// ============================================================
// chunk.ts — Chunks 16×256×16 + geração da FASE 5
// ------------------------------------------------------------
// Novidades da geração:
//  • BIOMAS (temperatura × umidade): planície, floresta,
//    deserto e neve — cada um com superfície própria;
//  • CAVERNAS: dois "vermes" de ruído 3D intersectados criam
//    túneis; um terceiro campo forma cavernas amplas;
//  • ÁRVORES: decididas por CÉLULA 8×8 global → a copa pode
//    cruzar bordas de chunk sem nunca ser cortada;
//  • VEGETAÇÃO: grama alta na floresta/planície, flores.
// Tudo função determinística de (x, z) global + seed.
// ============================================================
import * as THREE from 'three';
import { BlockId, isSolid } from './blocks';
import { Noise2D, smoothstep } from './noise';
import { Noise3D } from './noise3d';
import { Biome, BiomeClassifier } from './biomes';

export const CHUNK_X = 16;
export const CHUNK_Y = 256;
export const CHUNK_Z = 16;

export const SEA_LEVEL = 26;
export const SNOW_LINE = 45;
const TREE_CELL = 8;

export function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Hash determinístico 2D→[0,1) para detalhes pontuais. */
export function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data = new Uint8Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
  highestBlockY = 0;

  opaqueMesh: THREE.Mesh | null = null;
  waterMesh: THREE.Mesh | null = null;
  torchMesh: THREE.Mesh | null = null;
  floraMesh: THREE.Mesh | null = null;

  dirty = true;
  meshed = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  private index(lx: number, y: number, lz: number): number {
    return (y * CHUNK_Z + lz) * CHUNK_X + lx;
  }

  getLocal(lx: number, y: number, lz: number): number {
    return this.data[this.index(lx, y, lz)];
  }

  setLocal(lx: number, y: number, lz: number, id: number): void {
    this.data[this.index(lx, y, lz)] = id;
    if (id !== BlockId.Air && y > this.highestBlockY) {
      this.highestBlockY = y;
    } else if (id === BlockId.Air && y === this.highestBlockY) {
      this.recalculateHighestBlock();
    }
  }

  private recalculateHighestBlock(): void {
    for (let y = this.highestBlockY; y >= 0; y--) {
      for (let z = 0; z < CHUNK_Z; z++) {
        for (let x = 0; x < CHUNK_X; x++) {
          if (this.getLocal(x, y, z) !== BlockId.Air) {
            this.highestBlockY = y;
            return;
          }
        }
      }
    }
    this.highestBlockY = 0;
  }
}

interface TreeSpec {
  x: number;
  z: number;
  trunkHeight: number;
}

export class TerrainGenerator {
  private noise: Noise2D;
  private caves: Noise3D;
  private biomes: BiomeClassifier;
  private seed: number;

  constructor(seed: number) {
    this.noise = new Noise2D(seed);
    this.caves = new Noise3D(seed + 77);
    this.biomes = new BiomeClassifier(seed);
    this.seed = seed;
  }

  biomeAt(x: number, z: number): Biome {
    return this.biomes.biomeAt(x, z);
  }

  /** Altura da superfície sólida (igual à Fase 2, provada). */
  heightAt(x: number, z: number): number {
    const continent = this.noise.fbm(x * 0.0075 + 100, z * 0.0075 - 100, 4);
    const maskRaw = this.noise.fbm(x * 0.0021 - 300, z * 0.0021 + 300, 2) * 0.5 + 0.5;
    const mountainMask = smoothstep(0.46, 0.74, maskRaw);
    const ridge = this.noise.ridged(x * 0.017 + 55, z * 0.017 - 55, 4);
    const detail = this.noise.fbm(x * 0.045, z * 0.045, 2) * 1.6;
    const h = 24 + continent * 7 + mountainMask * Math.pow(ridge, 1.7) * 38 + detail;
    return Math.max(3, Math.min(CHUNK_Y - 16, Math.floor(h)));
  }

  /** Regra de caverna: túneis (2 vermes) + cavernas amplas profundas. */
  private isCave(x: number, y: number, z: number, surfaceH: number): boolean {
    if (y < 5 || y > surfaceH - 3) return false;
    const w1 = this.caves.fbm(x * 0.022, y * 0.045, z * 0.022, 3);
    const w2 = this.caves.fbm(x * 0.03 + 400, y * 0.05 + 400, z * 0.03 - 400, 3);
    if (Math.abs(w1) < 0.085 && Math.abs(w2) < 0.12) return true;
    // Cavernas amplas só em profundidade
    if (y < 20 && this.caves.fbm(x * 0.012 - 900, y * 0.03, z * 0.012 + 900, 2) > 0.42) return true;
    return false;
  }

  /** Árvore decidida por célula 8×8 — posição estável entre chunks. */
  private treeAtCell(cellX: number, cellZ: number): TreeSpec | null {
    const h1 = hash2(cellX * 13.37 + this.seed * 0.001, cellZ * 7.91);
    const tx = cellX * TREE_CELL + 1 + Math.floor(h1 * (TREE_CELL - 2));
    const tz = cellZ * TREE_CELL + 1 + Math.floor(hash2(cellX * 3.1, cellZ * 9.7) * (TREE_CELL - 2));
    const biome = this.biomeAt(tx, tz);
    if (biome !== Biome.Forest && biome !== Biome.Plains) return null;

    const density = biome === Biome.Forest ? 0.55 : 0.06;
    const roll = hash2(cellX * 31.7, cellZ * 17.3);
    if (roll > density) return null;

    const h = hash2(tx * 5.3, tz * 11.1);
    return { x: tx, z: tz, trunkHeight: 4 + Math.floor(h * 3) };
  }

  /** Escreve no chunk as partes de uma árvore (cruza bordas com segurança). */
  private placeTree(chunk: Chunk, gx0: number, gz0: number, tree: TreeSpec): void {
    const surfaceH = this.heightAt(tree.x, tree.z);
    if (surfaceH < SEA_LEVEL + 1) return;

    const setIfInside = (x: number, y: number, z: number, id: number, onlyAir: boolean): void => {
      const lx = x - gx0;
      const lz = z - gz0;
      if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z || y < 0 || y >= CHUNK_Y) return;
      if (onlyAir && chunk.getLocal(lx, y, lz) !== BlockId.Air) return;
      chunk.setLocal(lx, y, lz, id);
    };

    // Tronco
    for (let y = surfaceH + 1; y <= surfaceH + tree.trunkHeight; y++) {
      setIfInside(tree.x, y, tree.z, BlockId.Log, false);
    }

    // Copa: duas camadas 5×5 (com cantos podados) + duas 3×3
    const topY = surfaceH + tree.trunkHeight;
    for (let layer = topY - 2; layer <= topY + 1; layer++) {
      const wide = layer <= topY - 1;
      const radius = wide ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (wide && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
            if (hash2((tree.x + dx) * 3.7, (tree.z + dz) * 5.1) < 0.7) continue;
          }
          setIfInside(tree.x + dx, layer, tree.z + dz, BlockId.Leaves, true);
        }
      }
    }
  }

  /** Flora rasteira sobre o bloco de superfície. */
  private plantFlora(chunk: Chunk, lx: number, y: number, lz: number, biome: Biome, gx: number, gz: number): void {
    if (y + 1 >= CHUNK_Y || chunk.getLocal(lx, y + 1, lz) !== BlockId.Air) return;
    const surface = chunk.getLocal(lx, y, lz);
    if (surface !== BlockId.Grass && surface !== BlockId.Snow) return;
    const roll = hash2(gx * 9.13, gz * 4.77);
    if ((biome === Biome.Forest || biome === Biome.Plains) && roll < 0.08) {
      chunk.setLocal(lx, y + 1, lz, BlockId.GrassTuft);
    } else if (biome === Biome.Forest && roll >= 0.08 && roll < 0.115) {
      chunk.setLocal(lx, y + 1, lz, BlockId.Flower);
    } else if ((biome === Biome.Plains || biome === Biome.Forest) && roll > 0.965) {
      chunk.setLocal(lx, y + 1, lz, BlockId.Flower);
    }
  }

  /** Preenche um chunk inteiro: base + cavernas + água + árvores + flora. */
  fillChunk(chunk: Chunk): void {
    const gx0 = chunk.cx * CHUNK_X;
    const gz0 = chunk.cz * CHUNK_Z;

    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const gx = gx0 + lx;
        const gz = gz0 + lz;
        const h = this.heightAt(gx, gz);
        const biome = this.biomeAt(gx, gz);

        // --- Bloco base por camadas, conforme o bioma ---
        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) {
            id = BlockId.Bedrock;
          } else if (y <= 2 && hash2(gx * 3 + y, gz * 5 - y) < (3 - y) * 0.25) {
            id = BlockId.Bedrock;
          } else if (y === h) {
            if (h >= SNOW_LINE || biome === Biome.Snow) id = BlockId.Snow;
            else if (biome === Biome.Desert || h <= SEA_LEVEL + 1) id = BlockId.Sand;
            else id = BlockId.Grass;
          } else if (y >= h - 3) {
            id = biome === Biome.Desert || h <= SEA_LEVEL + 1 ? BlockId.Sand : BlockId.Dirt;
          } else if (biome === Biome.Desert && y >= h - 7) {
            id = BlockId.Sandstone;
          } else {
            id = BlockId.Stone;
          }
          chunk.setLocal(lx, y, lz, id);
        }

        // --- Cavernas (escava o interior, nunca a superfície) ---
        for (let y = 5; y <= h - 3; y++) {
          if (this.isCave(gx, y, gz, h) && chunk.getLocal(lx, y, lz) !== BlockId.Bedrock) {
            chunk.setLocal(lx, y, lz, BlockId.Air);
          }
        }

        // --- Água até o nível do mar ---
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            chunk.setLocal(lx, y, lz, BlockId.Water);
          }
        }

        this.plantFlora(chunk, lx, h, lz, biome, gx, gz);
      }
    }

    // --- Árvores: células que sobrepoem o chunk + margem da copa (5 blocos) ---
    const cellX0 = Math.floor((gx0 - 4) / TREE_CELL);
    const cellX1 = Math.floor((gx0 + CHUNK_X + 3) / TREE_CELL);
    const cellZ0 = Math.floor((gz0 - 4) / TREE_CELL);
    const cellZ1 = Math.floor((gz0 + CHUNK_Z + 3) / TREE_CELL);
    for (let cellZ = cellZ0; cellZ <= cellZ1; cellZ++) {
      for (let cellX = cellX0; cellX <= cellX1; cellX++) {
        const tree = this.treeAtCell(cellX, cellZ);
        if (tree) this.placeTree(chunk, gx0, gz0, tree);
      }
    }
  }
}

export { isSolid };
