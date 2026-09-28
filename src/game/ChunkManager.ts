// ============================================================
// ChunkManager.ts — Carregamento/descarregamento dinâmico
// ------------------------------------------------------------
// Mantém carregados os chunks dentro do RAIO DE VISÃO ao redor
// do jogador. A cada frame, com ORÇAMENTO limitado (para nunca
// travar a renderização):
//   1. GERA DADOS de chunks novos (Perlin) — incluindo um anel
//      externo só de dados (necessário para culdar as bordas);
//   2. CONSTRÓI MALHAS de chunks cujos 4 vizinhos já existem —
//      os mais próximos primeiro, dando o efeito de "stream";
//   3. DESCARREGA chunks fora do anel (remove da cena e
//      libera a geometria da GPU).
// Quando um chunk novo aparece, seus vizinhos são marcados
// como "dirty" e têm a malha refeita com as bordas corretas.
// ============================================================
import * as THREE from 'three';
import { Chunk, chunkKey, CHUNK_X, CHUNK_Y, CHUNK_Z, TerrainGenerator, SEA_LEVEL } from './chunk';
import { buildChunkGeometry } from './mesher';
import { BlockId, isSolid } from './blocks';
import { createVoxelMaterial, createFloraMaterial } from './voxelMaterial';

export interface WorldReader {
  getBlock(x: number, y: number, z: number): number;
  supportHeightAt(x: number, z: number): number;
  isLoadedAt?(x: number, z: number): boolean;
}

// Soft CPU budget: a single generation/mesh is atomic and may exceed it.
const WORK_BUDGET_MS = 5;

/** Offsets (dx, dz) pré-ordenados por distância — prioridade ao centro. */
function makeOffsets(radius: number): [number, number][] {
  const list: [number, number][] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) list.push([dx, dz]);
  }
  list.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1])));
  return list;
}

export class ChunkManager implements WorldReader {
  private readonly meshOffsets: [number, number][];
  private readonly dataOffsets: [number, number][];
  private settled = false;
  private lastCX = NaN;
  private lastCZ = NaN;
  private chunks = new Map<number, Chunk>();
  /** Edicoes sobrevivem ao descarregamento e a regeneracao do chunk. */
  private edits = new Map<number, Map<number, number>>();
  private torches = new Map<string, THREE.Vector3>();
  private generator: TerrainGenerator;
  private scene: THREE.Scene;

  /** Materiais COMPARTILHADOS por todos os chunks (1 textura). */
  private opaqueMaterial = createVoxelMaterial(false);
  private waterMaterial = createVoxelMaterial(true);
  private torchMaterial = createVoxelMaterial(false);
  private floraMaterial = createFloraMaterial();

  get material(): THREE.Material {
    return this.opaqueMaterial;
  }

  /** Nº de chunks dentro do raio ainda aguardando malha (HUD). */
  pendingMeshCount = 0;

  constructor(scene: THREE.Scene, seed: number, private readonly radius = 4) {
    this.meshOffsets = makeOffsets(radius);
    this.dataOffsets = makeOffsets(radius + 1);
    this.scene = scene;
    this.generator = new TerrainGenerator(seed);
    this.torchMaterial.emissive.set(0xff8a24);
    this.torchMaterial.emissiveIntensity = 1.25;
  }

  // ----------------------------------------------------------
  // Leitura global de blocos (usada por mesher e jogador)
  // ----------------------------------------------------------
  isLoadedAt(x: number, z: number): boolean {
    return this.chunks.has(chunkKey(Math.floor(x / CHUNK_X), Math.floor(z / CHUNK_Z)));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return BlockId.Bedrock;
    if (y >= CHUNK_Y) return BlockId.Air;
    const cx = Math.floor(x / CHUNK_X);
    const cz = Math.floor(z / CHUNK_Z);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockId.Air; // chunk não carregado = vazio
    return chunk.getLocal(x - cx * CHUNK_X, y, z - cz * CHUNK_Z);
  }

  /**
   * Altera um bloco global e invalida somente as malhas afetadas.
   * Se o bloco estiver numa borda, o chunk vizinho tambem e reconstruido.
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= CHUNK_Y) return false;

    const cx = Math.floor(x / CHUNK_X);
    const cz = Math.floor(z / CHUNK_Z);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return false;

    const lx = x - cx * CHUNK_X;
    const lz = z - cz * CHUNK_Z;
    const previousId = chunk.getLocal(lx, y, lz);
    if (previousId === id) return false;

    chunk.setLocal(lx, y, lz, id);
    const localIndex = (y * CHUNK_Z + lz) * CHUNK_X + lx;
    let chunkEdits = this.edits.get(key);
    if (!chunkEdits) {
      chunkEdits = new Map<number, number>();
      this.edits.set(key, chunkEdits);
    }
    chunkEdits.set(localIndex, id);
    chunk.dirty = true;
    this.settled = false;

    const torchKey = `${x},${y},${z}`;
    if (previousId === BlockId.Torch) this.torches.delete(torchKey);
    if (id === BlockId.Torch) {
      this.torches.set(torchKey, new THREE.Vector3(x + 0.5, y + 0.72, z + 0.5));
    }

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  /** Retorna somente as tochas mais proximas; o pool de luzes e limitado. */
  getNearbyTorches(position: THREE.Vector3, radius: number, limit: number): THREE.Vector3[] {
    const radiusSq = radius * radius;
    const candidates: { position: THREE.Vector3; distance: number }[] = [];
    for (const torch of this.torches.values()) {
      const distance = torch.distanceToSquared(position);
      if (distance <= radiusSq) candidates.push({ position: torch, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, limit).map((item) => item.position);
  }

  /** Altura do topo sólido (ignora água) na coluna; −1 se sem chunk. */
  supportHeightAt(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_X);
    const cz = Math.floor(z / CHUNK_Z);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return -1;
    const lx = x - cx * CHUNK_X;
    const lz = z - cz * CHUNK_Z;
    for (let y = chunk.highestBlockY; y >= 0; y--) {
      if (isSolid(chunk.getLocal(lx, y, lz))) return y + 1;
    }
    return 0;
  }

  // ----------------------------------------------------------
  // Área inicial: gera 3×3 ao redor do spawn DE IMEDIATO
  // (bordas são refeitas automaticamente quando o anel maior gerar)
  // ----------------------------------------------------------
  forceSpawnArea(): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(dx, dz);
        if (!this.chunks.has(key)) this.createChunk(dx, dz);
      }
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.meshChunk(this.chunks.get(chunkKey(dx, dz))!);
      }
    }
  }

  // ----------------------------------------------------------
  // Atualização principal — chamada a cada frame
  // ----------------------------------------------------------
  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_X);
    const pcz = Math.floor(playerZ / CHUNK_Z);

    const moved = pcx !== this.lastCX || pcz !== this.lastCZ;
    if (this.settled && !moved) return;
    this.lastCX = pcx; this.lastCZ = pcz;
    const deadline = performance.now() + WORK_BUDGET_MS;
    let generated = false;
    // Generate at most one chunk, not eight expensive noise volumes at once.
    for (const [dx, dz] of this.dataOffsets) {
      if (!this.chunks.has(chunkKey(pcx + dx, pcz + dz))) {
        this.createChunk(pcx + dx, pcz + dz); generated = true; break;
      }
    }
    let pending = 0;
    let meshed = false;
    for (const [dx, dz] of this.meshOffsets) {
      const chunk = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
      if (chunk?.meshed && !chunk.dirty) continue;
      if (chunk && !meshed && performance.now() < deadline && this.neighborsLoaded(chunk.cx, chunk.cz)) {
        this.meshChunk(chunk); meshed = true;
      } else { pending++; }
    }
    this.pendingMeshCount = pending;
    this.settled = !generated && pending === 0;
    if (moved) {
      for (const [key, chunk] of this.chunks) {
        const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
        if (dist > this.radius + 1) this.unloadChunk(key, chunk);
        // Data halo chunks must not keep rendering when they leave view range.
        for (const mesh of [chunk.opaqueMesh, chunk.waterMesh, chunk.torchMesh, chunk.floraMesh]) {
          if (mesh) mesh.visible = dist <= this.radius;
        }
      }
    }
  }

  // ----------------------------------------------------------
  // Internos
  // ----------------------------------------------------------
  private neighborsLoaded(cx: number, cz: number): boolean {
    return (
      this.chunks.has(chunkKey(cx + 1, cz)) &&
      this.chunks.has(chunkKey(cx - 1, cz)) &&
      this.chunks.has(chunkKey(cx, cz + 1)) &&
      this.chunks.has(chunkKey(cx, cz - 1))
    );
  }

  /** Gera os dados e marca os vizinhos existentes como dirty. */
  private createChunk(cx: number, cz: number): void {
    const chunk = new Chunk(cx, cz);
    this.generator.fillChunk(chunk);
    const key = chunkKey(cx, cz);

    // Reaplica alteracoes feitas antes de o chunk ser descarregado.
    const chunkEdits = this.edits.get(key);
    if (chunkEdits) {
      for (const [index, id] of chunkEdits) {
        const lx = index % CHUNK_X;
        const column = (index - lx) / CHUNK_X;
        const lz = column % CHUNK_Z;
        const y = (column - lz) / CHUNK_Z;
        chunk.setLocal(lx, y, lz, id);
      }
    }

    this.chunks.set(key, chunk);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const neighbor = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (neighbor) neighbor.dirty = true; // refaz borda
    }
  }

  private markDirty(cx: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) { chunk.dirty = true; this.settled = false; }
  }

  /** (Re)constrói as malhas do chunk, trocando as antigas na cena. */
  private meshChunk(chunk: Chunk): void {
    const { opaque, water, torch, flora } = buildChunkGeometry(chunk, (x, y, z) => this.getBlock(x, y, z));

    // Substitui a malha opaca
    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (opaque) {
      const mesh = new THREE.Mesh(opaque, this.opaqueMaterial);
      mesh.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      chunk.opaqueMesh = mesh;
      this.scene.add(mesh);
    }

    // Substitui a malha de água (sem sombra projetada)
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }
    if (water) {
      const mesh = new THREE.Mesh(water, this.waterMaterial);
      mesh.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      chunk.waterMesh = mesh;
      this.scene.add(mesh);
    }

    if (chunk.torchMesh) {
      this.scene.remove(chunk.torchMesh);
      chunk.torchMesh.geometry.dispose();
      chunk.torchMesh = null;
    }
    if (torch) {
      const mesh = new THREE.Mesh(torch, this.torchMaterial);
      mesh.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      chunk.torchMesh = mesh;
      this.scene.add(mesh);
    }

    // Flora (grama alta e flores): material DoubleSide em X
    if (chunk.floraMesh) {
      this.scene.remove(chunk.floraMesh);
      chunk.floraMesh.geometry.dispose();
      chunk.floraMesh = null;
    }
    if (flora) {
      const mesh = new THREE.Mesh(flora, this.floraMaterial);
      mesh.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      chunk.floraMesh = mesh;
      this.scene.add(mesh);
    }

    chunk.dirty = false;
    // Mesmo um chunk vazio foi processado; evita remeshing infinito.
    chunk.meshed = true;
  }

  /** Remove o chunk da cena e devolve a memória da GPU. */
  private unloadChunk(key: number, chunk: Chunk): void {
    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
    }
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
    }
    if (chunk.torchMesh) {
      this.scene.remove(chunk.torchMesh);
      chunk.torchMesh.geometry.dispose();
    }
    if (chunk.floraMesh) {
      this.scene.remove(chunk.floraMesh);
      chunk.floraMesh.geometry.dispose();
    }
    this.chunks.delete(key);
  }

  // ----------------------------------------------------------
  // Estatísticas para o HUD
  // ----------------------------------------------------------
  loadedCount(): number {
    return this.chunks.size;
  }

  meshedCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) if (c.meshed) n++;
    return n;
  }

  /** Libera tudo ao sair do jogo. */
  dispose(): void {
    this.unloadAll();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.torchMaterial.dispose();
    this.floraMaterial.dispose();
  }

  // ----------------------------------------------------------
  // FASE 5 — serialização das edições (salvar/carregar mundo)
  // ----------------------------------------------------------

  /** Exporta todas as edições como [x, y, z, id]. */
  serializeEdits(): number[][] {
    const out: number[][] = [];
    for (const [key, chunkEdits] of this.edits) {
      const cx = Math.floor(key / 65536) - 32768;
      const cz = (key % 65536) - 32768;
      for (const [index, id] of chunkEdits) {
        const lx = index % CHUNK_X;
        const column = (index - lx) / CHUNK_X;
        const lz = column % CHUNK_Z;
        const y = (column - lz) / CHUNK_Z;
        out.push([cx * CHUNK_X + lx, y, cz * CHUNK_Z + lz, id]);
      }
    }
    return out;
  }

  /**
   * Aplica edições vindas de um save: grava no registro persistente
   * e, se o chunk já estiver carregado, atualiza e remalha.
   */
  applyEdits(entries: number[][]): void {
    for (const [x, y, z, id] of entries) {
      const cx = Math.floor(x / CHUNK_X);
      const cz = Math.floor(z / CHUNK_Z);
      const key = chunkKey(cx, cz);
      const lx = x - cx * CHUNK_X;
      const lz = z - cz * CHUNK_Z;
      const localIndex = (y * CHUNK_Z + lz) * CHUNK_X + lx;

      let chunkEdits = this.edits.get(key);
      if (!chunkEdits) {
        chunkEdits = new Map<number, number>();
        this.edits.set(key, chunkEdits);
      }
      chunkEdits.set(localIndex, id);

      const chunk = this.chunks.get(key);
      if (chunk) {
        const prev = chunk.getLocal(lx, y, lz);
        chunk.setLocal(lx, y, lz, id);
        chunk.dirty = true;
        this.settled = false;
        // Atualiza o registro de tochas (luz dinâmica usa esse mapa)
        const torchKey = `${x},${y},${z}`;
        if (prev === BlockId.Torch) this.torches.delete(torchKey);
        if (id === BlockId.Torch) {
          this.torches.set(torchKey, new THREE.Vector3(x + 0.5, y + 0.72, z + 0.5));
        }
        if (lx === 0) this.markDirty(cx - 1, cz);
        if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
        if (lz === 0) this.markDirty(cx, cz - 1);
        if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
      } else if (id === BlockId.Torch) {
        // Tocha em chunk descarregado: manter no registro para reaparecer
        this.torches.set(`${x},${y},${z}`, new THREE.Vector3(x + 0.5, y + 0.72, z + 0.5));
      }
    }
  }

  /** Bioma na coluna global (exibido no HUD). */
  biomeAt(x: number, z: number): number {
    return this.generator.biomeAt(Math.floor(x), Math.floor(z));
  }

  private unloadAll(): void {
    for (const [key, chunk] of this.chunks) this.unloadChunk(key, chunk);
  }
}

export { SEA_LEVEL };
