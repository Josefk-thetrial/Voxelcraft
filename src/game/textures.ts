// ============================================================
// textures.ts — Atlas de texturas 16×16 gerado proceduralmente
// ------------------------------------------------------------
// FASE 2: novos tiles → neve (topo/lateral) e ÁGUA.
// Cada tile é desenhado pixel a pixel num <canvas> com PRNG
// determinístico (mulberry32). NearestFilter ⇒ visual pixelado.
// ============================================================
import * as THREE from 'three';

export const TILE_PX = 16; // resolução de cada tile (autêntico: 16px)
export const ATLAS_COLS = 8; // capacidade: 16 tiles (8 colunas × 2 linhas)
export const ATLAS_ROWS = 4; // 32 tiles (os 3 novos da Fase 5: arenito, grama alta, flor)

/** Índice de cada tile dentro do atlas (coluna + linha × ATLAS_COLS). */
export const Tiles = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Bedrock: 5,
  LogSide: 6,
  LogTop: 7,
  Planks: 8,
  Leaves: 9,
  SnowTop: 10,
  SnowSide: 11,
  Water: 12,
  Torch: 13,
  CraftingTop: 14,
  CraftingSide: 15,
  Sandstone: 16,
  GrassTuft: 17,
  Flower: 18,
} as const;

/** PRNG determinístico (mulberry32) — mesma seed ⇒ mesma sequência. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/**
 * Overrides opcionais em /public/textures/
 *  - atlas.png                      → atlas inteiro (8x4 tiles)
 *  - grass_top.png, dirt.png, ...   → sobrescrevem tiles individuais
 * Se nada existir, o atlas procedural continua valendo.
 */
const TILE_OVERRIDE_FILES: Record<number, string> = {
  [Tiles.GrassTop]: 'grass_top.png',
  [Tiles.GrassSide]: 'grass_side.png',
  [Tiles.Dirt]: 'dirt.png',
  [Tiles.Stone]: 'stone.png',
  [Tiles.Sand]: 'sand.png',
  [Tiles.Bedrock]: 'bedrock.png',
  [Tiles.LogSide]: 'log_side.png',
  [Tiles.LogTop]: 'log_top.png',
  [Tiles.Planks]: 'planks.png',
  [Tiles.Leaves]: 'leaves.png',
  [Tiles.SnowTop]: 'snow_top.png',
  [Tiles.SnowSide]: 'snow_side.png',
  [Tiles.Water]: 'water.png',
  [Tiles.Torch]: 'torch.png',
  [Tiles.CraftingTop]: 'crafting_top.png',
  [Tiles.CraftingSide]: 'crafting_side.png',
  [Tiles.Sandstone]: 'sandstone.png',
  [Tiles.GrassTuft]: 'grass_tuft.png',
  [Tiles.Flower]: 'flower.png',
};

function tileXY(tile: number): [number, number] {
  return [(tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function applyExternalTextureOverrides(
  canvas: HTMLCanvasElement,
  g: Ctx,
  tex: THREE.CanvasTexture,
): Promise<void> {
  // 1) Atlas completo opcional
  const atlas = await loadImage('/textures/atlas.png');
  if (atlas) {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(atlas, 0, 0, canvas.width, canvas.height);
    tex.needsUpdate = true;
  }

  // 2) Tiles individuais opcionais (sobrescrevem o atlas ou o fallback procedural)
  for (const [tileKey, file] of Object.entries(TILE_OVERRIDE_FILES)) {
    const tile = Number(tileKey);
    const img = await loadImage(`/textures/${file}`);
    if (!img) continue;
    const [ox, oy] = tileXY(tile);
    g.clearRect(ox, oy, TILE_PX, TILE_PX);
    g.drawImage(img, ox, oy, TILE_PX, TILE_PX);
    tex.needsUpdate = true;
  }
}

function pick(rnd: () => number, palette: string[]): string {
  return palette[(rnd() * palette.length) | 0];
}

/** Preenche um tile inteiro coluna/linha com ruído de paleta. */
function noiseTile(g: Ctx, col: number, row: number, palette: string[], seed: number) {
  const rnd = mulberry32(seed);
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      g.fillStyle = pick(rnd, palette);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// Paletas ------------------------------------------------------
const GRASS_COLORS = ['#5fae3f', '#56a437', '#67b844', '#6fc24a', '#549c34'];
const DIRT_COLORS = ['#8a5f3c', '#7d5433', '#94684a', '#6f4a2c', '#835930'];
const STONE_COLORS = ['#7d7d7d', '#868686', '#757575', '#8c8c8c', '#6e6e6e'];
const SAND_COLORS = ['#dcd29b', '#d4c98d', '#e2d8a6', '#cfc383'];
const BEDROCK_COLORS = ['#2b2b2b', '#3a3a3a', '#1e1e1e', '#4a4a4a', '#565656'];
const BARK_COLORS = ['#6b5231', '#5d472a', '#755a37', '#4f3c23'];
const LEAF_COLORS = ['#2f6b24', '#35782a', '#285c1f', '#3d8430'];
const SNOW_COLORS = ['#f4fafc', '#ecf3f5', '#ffffff', '#e3ecef'];
const WATER_COLORS = ['#3f76e4', '#3a6fd1', '#4680ef', '#3565c4'];

function paintGrassTop(g: Ctx) {
  noiseTile(g, 0, 0, GRASS_COLORS, 101);
}

/** Lateral da grama: terra com faixa verde irregular no topo. */
function paintGrassSide(g: Ctx) {
  noiseTile(g, 1, 0, DIRT_COLORS, 201);
  const rnd = mulberry32(202);
  for (let x = 0; x < TILE_PX; x++) {
    const depth = 3 + (rnd() < 0.65 ? 1 : 0) + (rnd() < 0.3 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      g.fillStyle = pick(rnd, GRASS_COLORS);
      g.fillRect(TILE_PX + x, y, 1, 1);
    }
  }
}

function paintDirt(g: Ctx) {
  noiseTile(g, 2, 0, DIRT_COLORS, 301);
  const rnd = mulberry32(302);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = '#5c3a22';
    g.fillRect(2 * TILE_PX + ((rnd() * 16) | 0), (rnd() * 16) | 0, 1, 1);
  }
}

function paintStone(g: Ctx) {
  noiseTile(g, 3, 0, STONE_COLORS, 401);
  const rnd = mulberry32(402);
  for (let i = 0; i < 5; i++) {
    const x = (rnd() * 14) | 0;
    const y = (rnd() * 16) | 0;
    g.fillStyle = '#5f5f5f';
    g.fillRect(3 * TILE_PX + x, y, 2, 1);
  }
}

function paintSand(g: Ctx) {
  noiseTile(g, 4, 0, SAND_COLORS, 501);
}

/** Rocha-mãe: blocos 2×2 de alto contraste. */
function paintBedrock(g: Ctx) {
  const rnd = mulberry32(601);
  for (let y = 0; y < TILE_PX; y += 2) {
    for (let x = 0; x < TILE_PX; x += 2) {
      g.fillStyle = pick(rnd, BEDROCK_COLORS);
      g.fillRect(5 * TILE_PX + x, y, 2, 2);
    }
  }
}

function paintLogSide(g: Ctx) {
  const rnd = mulberry32(701);
  for (let x = 0; x < TILE_PX; x++) {
    const base = pick(rnd, BARK_COLORS);
    for (let y = 0; y < TILE_PX; y++) {
      g.fillStyle = rnd() < 0.18 ? '#3e2f1c' : base;
      g.fillRect(6 * TILE_PX + x, y, 1, 1);
    }
  }
}

/** Topo do tronco: anéis concêntricos. */
function paintLogTop(g: Ctx) {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d);
      g.fillStyle = d >= 7.5 ? '#4f3c23' : ring % 2 === 0 ? '#b09255' : '#8a6d3f';
      g.fillRect(7 * TILE_PX + x, y, 1, 1);
    }
  }
}

function paintPlanks(g: Ctx) {
  const rnd = mulberry32(901);
  for (let y = 0; y < TILE_PX; y++) {
    const board = Math.floor(y / 4);
    const light = board % 2 === 0;
    for (let x = 0; x < TILE_PX; x++) {
      const seam = y % 4 === 3 || x === ((board * 7 + 3) % 16);
      g.fillStyle = seam ? '#6e5330' : rnd() < 0.06 ? '#8a6a3c' : light ? '#a8814c' : '#9c7745';
      g.fillRect(x, TILE_PX + y, 1, 1);
    }
  }
}

function paintLeaves(g: Ctx) {
  const rnd = mulberry32(1001);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      g.fillStyle = rnd() < 0.14 ? '#173d12' : pick(rnd, LEAF_COLORS);
      g.fillRect(TILE_PX + x, TILE_PX + y, 1, 1);
    }
  }
}

/** Topo de neve: brancos frios com leve variação. */
function paintSnowTop(g: Ctx) {
  noiseTile(g, 2, 1, SNOW_COLORS, 1101);
}

/** Lateral com neve: terra com faixa branca irregular no topo. */
function paintSnowSide(g: Ctx) {
  noiseTile(g, 3, 1, DIRT_COLORS, 1201);
  const rnd = mulberry32(1202);
  for (let x = 0; x < TILE_PX; x++) {
    const depth = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      g.fillStyle = pick(rnd, SNOW_COLORS);
      g.fillRect(3 * TILE_PX + x, y, 1, 1);
    }
  }
}

/** Água: azul com ondas horizontais sutis. */
function paintWater(g: Ctx) {
  noiseTile(g, 4, 1, WATER_COLORS, 1301);
  const rnd = mulberry32(1302);
  for (let y = 0; y < TILE_PX; y += 4) {
    // fileiras de "espuma" parciais em intervalos verticais alternados
    for (let x = 0; x < TILE_PX; x++) {
      if (rnd() < 0.45) {
        g.fillStyle = '#5a95f0';
        g.fillRect(4 * TILE_PX + x, y, 1, 1);
      }
    }
  }
}

function paintTorch(g: Ctx) {
  const ox = 5 * TILE_PX;
  const oy = TILE_PX;
  g.fillStyle = '#5a3a1f';
  g.fillRect(ox, oy, TILE_PX, TILE_PX);
  g.fillStyle = '#8b5a2b';
  g.fillRect(ox + 5, oy + 5, 6, 11);
  g.fillStyle = '#ff8a24';
  g.fillRect(ox + 4, oy + 2, 8, 6);
  g.fillStyle = '#ffd85a';
  g.fillRect(ox + 6, oy, 4, 6);
  g.fillStyle = '#fff2a0';
  g.fillRect(ox + 7, oy + 1, 2, 3);
}

function paintCraftingTop(g: Ctx) {
  const ox = 6 * TILE_PX;
  const oy = TILE_PX;
  g.fillStyle = '#8d6337';
  g.fillRect(ox, oy, 16, 16);
  g.strokeStyle = '#3e2a18';
  g.lineWidth = 2;
  g.strokeRect(ox + 1, oy + 1, 14, 14);
  g.fillStyle = '#b78a50';
  for (let i = 0; i < 3; i++) {
    g.fillRect(ox + 3 + i * 4, oy + 2, 2, 12);
    g.fillRect(ox + 2, oy + 3 + i * 4, 12, 2);
  }
}

function paintCraftingSide(g: Ctx) {
  const ox = 7 * TILE_PX;
  const oy = TILE_PX;
  noiseTile(g, 7, 1, ['#8d6337', '#9e7442', '#7c552f'], 1501);
  g.fillStyle = '#3e2a18';
  g.fillRect(ox, oy, 16, 3);
  g.fillRect(ox + 2, oy + 8, 12, 2);
  g.fillRect(ox + 4, oy + 3, 2, 13);
  g.fillRect(ox + 10, oy + 3, 2, 13);
}

/** Arenito do deserto: areia compactada com veios horizontais.
 *  Tile 16 → coluna 0, linha 2 do atlas. */
function paintSandstone(g: Ctx) {
  // col=0, row=2 → ox=0, oy=2*TILE_PX
  const ox = 0;
  const oy = 2 * TILE_PX;
  noiseTile(g, 0, 2, ['#d8cba0', '#d0c294', '#e0d5ad', '#c9b98b'], 1601);
  const rnd = mulberry32(1602);
  for (let y = 2; y < TILE_PX; y += 4) {
    if (rnd() < 0.8) {
      g.fillStyle = '#b8a878';
      g.fillRect(ox, oy + y, TILE_PX, 1);
    }
  }
}

/** Grama alta: hastes finas verdes com pontas claras.
 *  Tile 17 → coluna 1, linha 2 do atlas. */
function paintGrassTuft(g: Ctx) {
  const ox = 1 * TILE_PX;
  const oy = 2 * TILE_PX;
  // fundo transparente (preto → será descartado pelo alpha do atlas, aqui fica escuro)
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(ox, oy, TILE_PX, TILE_PX);
  const rnd = mulberry32(1702);
  for (let i = 0; i < 9; i++) {
    const x = (rnd() * 14) | 0;
    const h = 6 + ((rnd() * 8) | 0);
    for (let y = TILE_PX - h; y < TILE_PX; y++) {
      g.fillStyle = y < TILE_PX - h + 2 ? '#8fd45e' : pick(rnd, GRASS_COLORS);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/** Flor: haste verde com corola laranja e centro amarelo.
 *  Tile 18 → coluna 2, linha 2 do atlas. */
function paintFlower(g: Ctx) {
  const ox = 2 * TILE_PX;
  const oy = 2 * TILE_PX;
  g.clearRect(ox, oy, TILE_PX, TILE_PX);
  // haste
  g.fillStyle = '#3e7d2c';
  g.fillRect(ox + 7, oy + 8, 2, 8);
  g.fillRect(ox + 5, oy + 11, 2, 1);
  g.fillRect(ox + 9, oy + 13, 2, 1);
  // pétalas
  g.fillStyle = '#e0913b';
  g.fillRect(ox + 5, oy + 3, 2, 4);
  g.fillRect(ox + 9, oy + 3, 2, 4);
  g.fillRect(ox + 4, oy + 4, 8, 3);
  // centro
  g.fillStyle = '#f5d76e';
  g.fillRect(ox + 6, oy + 4, 4, 4);
  // miolo
  g.fillStyle = '#c96f2d';
  g.fillRect(ox + 7, oy + 5, 2, 2);
}

let cached: THREE.CanvasTexture | null = null;

/** Constrói (uma única vez) o atlas completo e devolve a textura. */
export function getAtlasTexture(): THREE.CanvasTexture {
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const g = canvas.getContext('2d')!;

  paintGrassTop(g);
  paintGrassSide(g);
  paintDirt(g);
  paintStone(g);
  paintSand(g);
  paintBedrock(g);
  paintLogSide(g);
  paintLogTop(g);
  paintPlanks(g);
  paintLeaves(g);
  paintSnowTop(g);
  paintSnowSide(g);
  paintWater(g);
  paintTorch(g);
  paintCraftingTop(g);
  paintCraftingSide(g);
  paintSandstone(g);
  paintGrassTuft(g);
  paintFlower(g);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  // Tenta carregar atlas/tile custom da pasta public/textures/, sem quebrar o fallback procedural.
  void applyExternalTextureOverrides(canvas, g, tex);

  cached = tex;
  return tex;
}
