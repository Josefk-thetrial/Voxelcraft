// Greedy meshing por chunk. Faces coplanares com o mesmo tile sao fundidas
// em retangulos, reduzindo vertices sem perder a repeticao da textura 16x16.
import * as THREE from 'three';
import { BLOCKS, BlockId, isOpaque } from './blocks';
import { Chunk, CHUNK_X, CHUNK_Y, CHUNK_Z } from './chunk';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';

export type GlobalBlockReader = (x: number, y: number, z: number) => number;

type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5;
type FaceKind = 'top' | 'bottom' | 'side';

interface FacePlan {
  axisSize: number;
  aSize: number;
  bSize: number;
  direction: [number, number, number];
  kind: FaceKind;
}

const DIRECTIONS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// A grade armazena 256 camadas, mas o mesher varre apenas ate o bloco mais alto.
function makePlans(activeHeight: number): FacePlan[] {
  return [
    { axisSize: CHUNK_X, aSize: CHUNK_Z, bSize: activeHeight, direction: DIRECTIONS[0], kind: 'side' },
    { axisSize: CHUNK_X, aSize: CHUNK_Z, bSize: activeHeight, direction: DIRECTIONS[1], kind: 'side' },
    { axisSize: activeHeight, aSize: CHUNK_X, bSize: CHUNK_Z, direction: DIRECTIONS[2], kind: 'top' },
    { axisSize: activeHeight, aSize: CHUNK_X, bSize: CHUNK_Z, direction: DIRECTIONS[3], kind: 'bottom' },
    { axisSize: CHUNK_Z, aSize: CHUNK_X, bSize: activeHeight, direction: DIRECTIONS[4], kind: 'side' },
    { axisSize: CHUNK_Z, aSize: CHUNK_X, bSize: activeHeight, direction: DIRECTIONS[5], kind: 'side' },
  ];
}

class GeometryBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private tiles: number[] = [];
  private indices: number[] = [];

  private addRawQuad(
    corners: [number, number, number][],
    uv: [number, number][],
    normal: [number, number, number],
    tile: number,
  ): void {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      this.positions.push(...corners[i]);
      this.normals.push(...normal);
      this.uvs.push(...uv[i]);
      this.tiles.push(tile);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addQuad(face: FaceIndex, fixed: number, a: number, b: number, width: number, height: number, tile: number): void {
    let corners: [number, number, number][];
    let uv: [number, number][];

    switch (face) {
      case 0: // +X; a=z, b=y
        corners = [[fixed + 1, b, a], [fixed + 1, b + height, a], [fixed + 1, b + height, a + width], [fixed + 1, b, a + width]];
        uv = [[0, 0], [0, height], [width, height], [width, 0]];
        break;
      case 1: // -X; a=z, b=y
        corners = [[fixed, b, a + width], [fixed, b + height, a + width], [fixed, b + height, a], [fixed, b, a]];
        uv = [[0, 0], [0, height], [width, height], [width, 0]];
        break;
      case 2: // +Y; a=x, b=z
        corners = [[a, fixed + 1, b + height], [a + width, fixed + 1, b + height], [a + width, fixed + 1, b], [a, fixed + 1, b]];
        uv = [[0, 0], [width, 0], [width, height], [0, height]];
        break;
      case 3: // -Y; a=x, b=z
        corners = [[a, fixed, b], [a + width, fixed, b], [a + width, fixed, b + height], [a, fixed, b + height]];
        uv = [[0, 0], [width, 0], [width, height], [0, height]];
        break;
      case 4: // +Z; a=x, b=y
        corners = [[a + width, b, fixed + 1], [a + width, b + height, fixed + 1], [a, b + height, fixed + 1], [a, b, fixed + 1]];
        uv = [[0, 0], [0, height], [width, height], [width, 0]];
        break;
      case 5: // -Z; a=x, b=y
        corners = [[a, b, fixed], [a, b + height, fixed], [a + width, b + height, fixed], [a + width, b, fixed]];
        uv = [[0, 0], [0, height], [width, height], [width, 0]];
        break;
    }

    this.addRawQuad(corners, uv, DIRECTIONS[face], tile);
  }

  /** Plano em X (dois quads diagonais) para grama alta e flores.
   *  UVs em espaço de TILE (0..1 dentro do quad, o shader mapeia para o atlas).
   *  Material é DoubleSide → não precisamos de quads invertidos, apenas 2 diagonais. */
  addCross(lx: number, y: number, lz: number, tile: number): void {
    // UV cobre o quad inteiro (0-1 cada eixo; o shader de atlas trata como fração do tile)
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    // Diagonal NW→SE
    this.addRawQuad(
      [
        [lx + 0.1, y,     lz + 0.1],
        [lx + 0.9, y,     lz + 0.9],
        [lx + 0.9, y + 1, lz + 0.9],
        [lx + 0.1, y + 1, lz + 0.1],
      ],
      uv,
      [0.7071, 0, -0.7071],
      tile,
    );
    // Diagonal NE→SW
    this.addRawQuad(
      [
        [lx + 0.9, y,     lz + 0.1],
        [lx + 0.1, y,     lz + 0.9],
        [lx + 0.1, y + 1, lz + 0.9],
        [lx + 0.9, y + 1, lz + 0.1],
      ],
      uv,
      [-0.7071, 0, -0.7071],
      tile,
    );
  }

  /** Cuboide fino usado pelas tochas, fora do greedy mesh dos blocos. */
  addCuboid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile: number): void {
    const uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    this.addRawQuad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], uv, [1, 0, 0], tile);
    this.addRawQuad([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], uv, [-1, 0, 0], tile);
    this.addRawQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uv, [0, 1, 0], tile);
    this.addRawQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], uv, [0, -1, 0], tile);
    this.addRawQuad([[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], uv, [0, 0, 1], tile);
    this.addRawQuad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], uv, [0, 0, -1], tile);
  }

  build(): THREE.BufferGeometry | null {
    if (this.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('tile', new THREE.Float32BufferAttribute(this.tiles, 1));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface ChunkGeometries {
  opaque: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
  torch: THREE.BufferGeometry | null;
  flora: THREE.BufferGeometry | null;
}

/** Funde retangulos de valores iguais dentro de uma mascara 2D. */
function consumeMask(
  mask: Int16Array,
  face: FaceIndex,
  fixed: number,
  aSize: number,
  bSize: number,
  builder: GeometryBuilder,
): void {
  for (let b = 0; b < bSize; b++) {
    for (let a = 0; a < aSize;) {
      const token = mask[b * aSize + a];
      if (token === 0) {
        a++;
        continue;
      }

      let width = 1;
      while (a + width < aSize && mask[b * aSize + a + width] === token) width++;

      let height = 1;
      outer: while (b + height < bSize) {
        for (let x = 0; x < width; x++) {
          if (mask[(b + height) * aSize + a + x] !== token) break outer;
        }
        height++;
      }

      builder.addQuad(face, fixed, a, b, width, height, token - 1);
      for (let dy = 0; dy < height; dy++) {
        mask.fill(0, (b + dy) * aSize + a, (b + dy) * aSize + a + width);
      }
      a += width;
    }
  }
}

export function buildChunkGeometry(chunk: Chunk, readGlobal: GlobalBlockReader): ChunkGeometries {
  const opaque = new GeometryBuilder();
  const water = new GeometryBuilder();
  const torch = new GeometryBuilder();
  const flora = new GeometryBuilder();
  const gx0 = chunk.cx * CHUNK_X;
  const gz0 = chunk.cz * CHUNK_Z;
  const plans = makePlans(Math.min(CHUNK_Y, chunk.highestBlockY + 1));

  const readNeighbor = (lx: number, y: number, lz: number, dx: number, dy: number, dz: number): number => {
    const nx = lx + dx;
    const ny = y + dy;
    const nz = lz + dz;
    if (ny < 0) return BlockId.Stone;
    if (nx >= 0 && nx < CHUNK_X && ny < CHUNK_Y && nz >= 0 && nz < CHUNK_Z) {
      return chunk.getLocal(nx, ny, nz);
    }
    return readGlobal(gx0 + nx, ny, gz0 + nz);
  };

  for (let face = 0 as FaceIndex; face < 6; face = (face + 1) as FaceIndex) {
    const plan = plans[face];
    const opaqueMask = new Int16Array(plan.aSize * plan.bSize);
    const waterMask = new Int16Array(plan.aSize * plan.bSize);
    for (let fixed = 0; fixed < plan.axisSize; fixed++) {
      opaqueMask.fill(0); waterMask.fill(0);

      for (let b = 0; b < plan.bSize; b++) {
        for (let a = 0; a < plan.aSize; a++) {
          // No temporary coordinate array for every voxel in all six scans.
          const lx = face <= 1 ? fixed : a;
          const y = face <= 1 ? b : face <= 3 ? fixed : b;
          const lz = face <= 1 ? a : face <= 3 ? b : fixed;
          const id = chunk.getLocal(lx, y, lz);
          if (id === BlockId.Air) continue;
          if (id === BlockId.Torch) {
            // Adiciona uma vez; as outras cinco varreduras apenas ignoram.
            if (face === 0) {
              const tile = BLOCKS[id].side;
              torch.addCuboid(lx + 0.42, y, lz + 0.42, lx + 0.58, y + 0.72, lz + 0.58, tile);
            }
            continue;
          }
          if (BLOCKS[id].render === 'cross') {
            if (face === 0) flora.addCross(lx, y, lz, BLOCKS[id].side);
            continue;
          }

          const [dx, dy, dz] = plan.direction;
          const neighbor = readNeighbor(lx, y, lz, dx, dy, dz);
          const index = b * plan.aSize + a;
          const definition = BLOCKS[id];
          const tile = plan.kind === 'top'
            ? definition.top
            : plan.kind === 'bottom'
              ? definition.bottom
              : definition.side;

          if (id === BlockId.Water) {
            if (neighbor === BlockId.Air) waterMask[index] = tile + 1;
          } else if (!isOpaque(neighbor)) {
            opaqueMask[index] = tile + 1;
          }
        }
      }

      consumeMask(opaqueMask, face, fixed, plan.aSize, plan.bSize, opaque);
      consumeMask(waterMask, face, fixed, plan.aSize, plan.bSize, water);
    }
  }

  return {
    opaque: opaque.build(),
    water: water.build(),
    torch: torch.build(),
    flora: flora.build(),
  };
}

// Converte tile index → UV rect no atlas (com margem)
function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const eps = 0.02;
  const u0 = (col + eps) / ATLAS_COLS;
  const u1 = (col + 1 - eps) / ATLAS_COLS;
  const v0 = 1 - (row + 1 - eps) / ATLAS_ROWS;
  const v1 = 1 - (row + eps) / ATLAS_ROWS;
  return [u0, v0, u1, v1];
}

function addFaceSimple(
  positions: number[], normals: number[], uvs: number[], indices: number[],
  verts: [number, number, number][],
  norm: [number, number, number],
  tile: number,
): void {
  const [u0, v0, u1, v1] = tileUV(tile);
  const uvCoords: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const base = positions.length / 3;
  for (let i = 0; i < 4; i++) {
    positions.push(...verts[i]);
    normals.push(...norm);
    uvs.push(...uvCoords[i]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Geometria de item com UVs já mapeadas no atlas (sem shader custom).
 * Usada para mão do jogador e drops de bloco.
 */
export function buildItemGeometry(id: number): THREE.BufferGeometry | null {
  if (id === BlockId.Air || id === BlockId.Water) return null;
  const def = BLOCKS[id];
  if (!def) return null;

  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];

  const addFace = (
    verts: [number, number, number][],
    norm: [number, number, number],
    tile: number,
  ) => addFaceSimple(pos, nor, uv, idx, verts, norm, tile);

  const s = def.side, t = def.top, b = def.bottom;

  // Cubo unitário centrado na origem (−0.5 a +0.5)
  addFace([[-.5,-.5, .5],[.5,-.5, .5],[.5,.5, .5],[-.5,.5, .5]], [0,0,1],  s); // +Z
  addFace([[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]], [0,0,-1], s); // -Z
  addFace([[.5,-.5, .5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5, .5]], [1,0,0],  s); // +X
  addFace([[-.5,-.5,-.5],[-.5,-.5, .5],[-.5,.5, .5],[-.5,.5,-.5]], [-1,0,0], s); // -X
  addFace([[-.5,.5, .5],[.5,.5, .5],[.5,.5,-.5],[-.5,.5,-.5]], [0,1,0],  t); // +Y topo
  addFace([[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5, .5],[-.5,-.5, .5]], [0,-1,0], b); // -Y fundo

  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,  2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}