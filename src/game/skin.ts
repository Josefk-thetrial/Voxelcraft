import { decodePng, importPng } from './png';
import { defaultCape, readCape, type CapeProfile } from './cape';
/** Minecraft Java skin layout; all imported images are normalized to 64×64. */
const LEGACY_KEY = 'voxelcraft-player-skin';
const PROFILE_KEY = 'voxelcraft-skin-profile-v1';
export const SKIN_LAYERS = ['hat', 'jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants'] as const;
export type SkinLayer = typeof SKIN_LAYERS[number];
export type SkinModel = 'classic' | 'slim';
export interface SkinProfile {
  dataUrl: string | null;
  cape: CapeProfile;
  model: SkinModel;
  layers: Record<SkinLayer, boolean>;
}
export function defaultSkinProfile(): SkinProfile {
  return { dataUrl: null, cape: defaultCape(), model: 'classic', layers: Object.fromEntries(SKIN_LAYERS.map(k => [k, true])) as SkinProfile['layers'] };
}
export function getSkinProfile(): SkinProfile {
  const fallback = defaultSkinProfile();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...fallback, dataUrl: localStorage.getItem(LEGACY_KEY) };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return fallback;
    return {
      dataUrl: typeof saved.dataUrl === 'string' && saved.dataUrl.startsWith('data:image/png') ? saved.dataUrl : null,
      cape: readCape(saved.cape),
      model: saved.model === 'slim' ? 'slim' : 'classic',
      layers: Object.fromEntries(SKIN_LAYERS.map(k => [k, typeof saved.layers?.[k] === 'boolean' ? saved.layers[k] : true])) as SkinProfile['layers'],
    };
  } catch { return fallback; }
}
export function saveSkinProfile(profile: SkinProfile): boolean {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
}
export function isSkinSize(width: number, height: number): boolean {
  return width === 64 && (height === 64 || height === 32);
}

export function normalizeSkin(image: HTMLImageElement): HTMLCanvasElement {
  if (!isSkinSize(image.naturalWidth, image.naturalHeight)) {
    throw new Error('Use uma skin PNG de 64×64 ou 64×32 pixels.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  if (image.naturalHeight === 32) {
    // Old skins reuse mirrored right limbs for the left ones. Mirror each
    // face independently (not the whole atlas, which swaps front and back).
    const mirror = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => {
      ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1);
      ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h); ctx.restore();
    };
    for (const [sx, dx] of [[0, 16], [40, 32]]) {
      mirror(sx + 4, 16, dx + 4, 48, 4, 4);
      mirror(sx + 8, 16, dx + 8, 48, 4, 4);
      mirror(sx + 8, 20, dx, 52, 4, 12);
      mirror(sx + 4, 20, dx + 4, 52, 4, 12);
      mirror(sx, 20, dx + 8, 52, 4, 12);
      mirror(sx + 12, 20, dx + 12, 52, 4, 12);
    }
    // Legacy editors often filled the unused hat rectangle with opaque color.
    const hat = ctx.getImageData(32, 0, 32, 16);
    if (hat.data.every((value, i) => i % 4 !== 3 || value === 255)) ctx.clearRect(32, 0, 32, 16);
  }
  // Minecraft base layers are opaque; only outer layers support transparency.
  for (const [x, y, w, h] of [[0, 0, 32, 16], [0, 16, 64, 16], [16, 48, 32, 16]]) {
    const pixels = ctx.getImageData(x, y, w, h);
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
    ctx.putImageData(pixels, x, y);
  }
  return canvas;
}
export const decodeSkin = (src: string) => decodePng(src, normalizeSkin);
export const importSkin = (file: File) => importPng(file, isSkinSize, normalizeSkin, 'Use uma skin PNG de 64×64 ou 64×32 pixels.');
