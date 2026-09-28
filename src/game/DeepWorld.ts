import * as THREE from 'three';
import { Chunk, TerrainGenerator, CHUNK_Y } from './chunk';
import { BlockId, BLOCKS, isSolid } from './blocks';
import { buildChunkGeometry } from './mesher';
import { smoothstep } from './noise';
import { BEDROCK_TOP_Y, depthAt, layerAt, type CrustProfile } from './geology';

export const SECTION_SIZE = 16;
const VERTICAL_RADIUS = 3;
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
const fields = ['opaqueMesh', 'waterMesh', 'torchMesh', 'floraMesh'] as const;
type Materials = Record<'opaque' | 'water' | 'torch' | 'flora', THREE.Material>;

/** Generator v3: bounded 16³ working set + sparse persistent edits.
 * No array/scan scales with the planet's depth. Missing sections are sampled
 * procedurally for meshing; collisions can still wait for a loaded section.
 */
export class DeepWorld {
  readonly terrain: TerrainGenerator;
  private sections = new Map<string, Chunk>();
  private edits = new Map<string, Map<number, number>>();
  private surfaceCache = new Map<string, Chunk>();
  private crustCache = new Map<string, { thickness: Int32Array; oceanic: Uint8Array }>();
  private torches = new Map<string, THREE.Vector3>();
  private center = [NaN, NaN, NaN];
  private targets: [number, number, number][] = [];
  private settled = false;
  pending = 0;
  constructor(private scene: THREE.Scene, seed: number, private radius: number, private materials: Materials) {
    this.terrain = new TerrainGenerator(seed, 2);
  }

  crustAt(x: number, z: number): CrustProfile {
    x = Math.floor(x); z = Math.floor(z);
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx},${cz}`;
    let cached = this.crustCache.get(key);
    if (!cached) {
      cached = { thickness: new Int32Array(256), oceanic: new Uint8Array(256) };
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const c = this.terrain.continentalnessAt(cx * 16 + lx, cz * 16 + lz);
        const oceanic = c < 0;
        const i = lz * 16 + lx;
        cached.oceanic[i] = Number(oceanic);
        cached.thickness[i] = Math.round(oceanic ? 5000 + smoothstep(-.6, 0, c) * 5000 : 30000 + smoothstep(0, .6, c) * 40000);
      }
      this.crustCache.set(key, cached);
      if (this.crustCache.size > (this.radius * 2 + 5) ** 2) this.crustCache.delete(this.crustCache.keys().next().value!);
    }
    const i = (z - cz * 16) * 16 + x - cx * 16;
    return { thickness: cached.thickness[i], oceanic: Boolean(cached.oceanic[i]) };
  }

  private baseBlock(x: number, y: number, z: number): number {
    if (y < BEDROCK_TOP_Y) return BlockId.Bedrock;
    if (y >= CHUNK_Y) return BlockId.Air;
    if (y >= 0) {
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx},${cz}`;
      let column = this.surfaceCache.get(key);
      if (!column) {
        column = new Chunk(cx, cz); this.terrain.fillChunk(column); this.surfaceCache.set(key, column);
        if (this.surfaceCache.size > (this.radius * 2 + 5) ** 2) this.surfaceCache.delete(this.surfaceCache.keys().next().value!);
      }
      const id = column.getLocal(x - cx * 16, y, z - cz * 16);
      if (id !== BlockId.Bedrock) return id;
      // v2's shallow bedrock is replaced only in v3. v1/v2 data never changes.
    }
    const depth = depthAt(y + .5);
    const crust = depth >= 70000 ? { thickness: 35000, oceanic: false } : this.crustAt(x, z);
    return layerAt(depth, crust).block;
  }

  getBlock(x: number, y: number, z: number): number {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < BEDROCK_TOP_Y) return BlockId.Bedrock;
    if (y >= CHUNK_Y) return BlockId.Air;
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16), cz = Math.floor(z / 16);
    const key = keyOf(cx, cy, cz), lx = x - cx * 16, ly = y - cy * 16, lz = z - cz * 16;
    const chunk = this.sections.get(key);
    if (chunk) return chunk.getLocal(lx, ly, lz);
    return this.edits.get(key)?.get((ly * 16 + lz) * 16 + lx) ?? this.baseBlock(x, y, z);
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (![x, y, z, id].every(Number.isInteger) || (id !== BlockId.Air && !BLOCKS[id]) || y < BEDROCK_TOP_Y || y >= CHUNK_Y) return false;
    if (this.getBlock(x, y, z) === id) return false;
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16), cz = Math.floor(z / 16), key = keyOf(cx, cy, cz);
    const lx = x - cx * 16, ly = y - cy * 16, lz = z - cz * 16, index = (ly * 16 + lz) * 16 + lx;
    let edits = this.edits.get(key);
    if (!edits) { edits = new Map(); this.edits.set(key, edits); }
    if (id === this.baseBlock(x, y, z)) { edits.delete(index); if (!edits.size) this.edits.delete(key); }
    else edits.set(index, id);
    const chunk = this.sections.get(key);
    if (chunk) chunk.setLocal(lx, ly, lz, id);
    const dirty = (a: number, b: number, c: number) => { const s = this.sections.get(keyOf(a, b, c)); if (s) s.dirty = true; };
    dirty(cx, cy, cz);
    if (lx === 0) dirty(cx - 1, cy, cz); if (lx === 15) dirty(cx + 1, cy, cz);
    if (ly === 0) dirty(cx, cy - 1, cz); if (ly === 15) dirty(cx, cy + 1, cz);
    if (lz === 0) dirty(cx, cy, cz - 1); if (lz === 15) dirty(cx, cy, cz + 1);
    this.settled = false;
    const torchKey = `${x},${y},${z}`;
    if (id === BlockId.Torch) this.torches.set(torchKey, new THREE.Vector3(x + .5, y + .72, z + .5));
    else this.torches.delete(torchKey);
    return true;
  }

  isLoadedAt(x: number, z: number, y = this.center[1] * 16): boolean {
    if (y >= 256) return true;
    return this.sections.has(keyOf(Math.floor(x / 16), Math.floor(y / 16), Math.floor(z / 16)));
  }
  supportHeightAt(x: number, z: number, nearY?: number): number {
    x = Math.floor(x); z = Math.floor(z);
    const top = nearY === undefined ? 255 : Math.min(255, Math.floor(nearY));
    const bottom = nearY === undefined ? 0 : Math.max(BEDROCK_TOP_Y - 1, top - 32);
    for (let y = top; y >= bottom; y--) if (isSolid(this.getBlock(x, y, z))) return y + 1;
    return -Infinity;
  }

  private create(cx: number, cy: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz, cy * 16, 16);
    // Uniform deep geological sections need neither cave noise nor column arrays.
    const d0 = depthAt(cy * 16 + .5), d1 = depthAt(cy * 16 + 15.5);
    const crust = { thickness: 35000, oceanic: false };
    const a = layerAt(d0, crust).block, b = layerAt(d1, crust).block;
    if (d1 > 70000 && a === b) { chunk.data.fill(a); chunk.highestBlockY = 15; }
    else for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      chunk.setLocal(x, y, z, this.baseBlock(cx * 16 + x, cy * 16 + y, cz * 16 + z));
    }
    const key = keyOf(cx, cy, cz);
    for (const [i, id] of this.edits.get(key) ?? []) chunk.setLocal(i % 16, Math.floor(i / 256), Math.floor(i / 16) % 16, id);
    this.sections.set(key, chunk);
    return chunk;
  }
  private mesh(chunk: Chunk): void {
    const geometry = buildChunkGeometry(chunk, (x, y, z) => this.getBlock(x, y, z));
    const kinds = ['opaque', 'water', 'torch', 'flora'] as const;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i], old = chunk[field], kind = kinds[i];
      if (old) { this.scene.remove(old); old.geometry.dispose(); chunk[field] = null; }
      const geo = geometry[kind];
      if (geo) {
        const mesh = new THREE.Mesh(geo, this.materials[kind]);
        mesh.position.set(chunk.cx * 16, chunk.baseY, chunk.cz * 16);
        mesh.castShadow = kind === 'opaque' || kind === 'flora'; mesh.receiveShadow = kind === 'opaque';
        mesh.matrixAutoUpdate = false; mesh.updateMatrix(); chunk[field] = mesh; this.scene.add(mesh);
      }
    }
    chunk.dirty = false; chunk.meshed = true;
  }
  private unload(key: string, chunk: Chunk): void {
    for (const field of fields) if (chunk[field]) { this.scene.remove(chunk[field]!); chunk[field]!.geometry.dispose(); }
    this.sections.delete(key);
  }
  private moveCenter(x: number, y: number, z: number): void {
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16), cz = Math.floor(z / 16);
    if (cx === this.center[0] && cy === this.center[1] && cz === this.center[2]) return;
    if (Math.abs(cy - this.center[1]) > 8) this.surfaceCache.clear();
    this.center = [cx, cy, cz]; this.targets = []; this.settled = false;
    for (let dy = -VERTICAL_RADIUS; dy <= VERTICAL_RADIUS; dy++) for (let dz = -this.radius; dz <= this.radius; dz++) for (let dx = -this.radius; dx <= this.radius; dx++) {
      if ((cy + dy) * 16 >= 256 || (cy + dy + 1) * 16 < BEDROCK_TOP_Y) continue;
      this.targets.push([cx + dx, cy + dy, cz + dz]);
    }
    this.targets.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy, a[2] - cz) - Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz));
    for (const [key, chunk] of this.sections) if (Math.abs(chunk.cx - cx) > this.radius || Math.abs(chunk.cz - cz) > this.radius || Math.abs(chunk.baseY / 16 - cy) > VERTICAL_RADIUS) this.unload(key, chunk);
  }
  update(x: number, z: number, y: number): void {
    this.moveCenter(x, y, z); if (this.settled) return;
    // One atomic section task per frame. Meshing remains bounded by section size.
    for (const [cx, cy, cz] of this.targets) {
      const chunk = this.sections.get(keyOf(cx, cy, cz));
      if (!chunk || chunk.dirty || !chunk.meshed) { this.mesh(chunk ?? this.create(cx, cy, cz)); break; }
    }
    this.pending = 0;
    for (const [cx, cy, cz] of this.targets) { const c = this.sections.get(keyOf(cx, cy, cz)); if (!c || c.dirty || !c.meshed) this.pending++; }
    this.settled = this.pending === 0;
  }
  forceSpawnArea(x: number, z: number, y: number): void {
    this.moveCenter(x, y, z);
    const [cx, cy, cz] = this.center;
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const chunk = this.sections.get(keyOf(cx + dx, cy + dy, cz + dz)) ?? this.create(cx + dx, cy + dy, cz + dz);
      this.mesh(chunk);
    }
    this.settled = false;
  }
  nearbyTorches(position: THREE.Vector3, radius: number, limit: number): THREE.Vector3[] {
    return [...this.torches.values()].filter(p => p.distanceToSquared(position) <= radius * radius)
      .sort((a, b) => a.distanceToSquared(position) - b.distanceToSquared(position)).slice(0, limit);
  }
  serializeEdits(): number[][] {
    const out: number[][] = [];
    for (const [key, edits] of this.edits) {
      const [cx, cy, cz] = key.split(',').map(Number);
      for (const [i, id] of edits) out.push([cx * 16 + i % 16, cy * 16 + Math.floor(i / 256), cz * 16 + Math.floor(i / 16) % 16, id]);
    }
    return out;
  }
  loadedCount(): number { return this.sections.size; }
  meshedCount(): number { return [...this.sections.values()].filter(c => c.meshed).length; }
  allocatedVoxelBytes(): number { return [...this.sections.values(), ...this.surfaceCache.values()].reduce((n, c) => n + c.data.byteLength, 0); }
  dispose(): void { for (const [key, chunk] of this.sections) this.unload(key, chunk); this.surfaceCache.clear(); this.crustCache.clear(); this.edits.clear(); this.torches.clear(); }
}
