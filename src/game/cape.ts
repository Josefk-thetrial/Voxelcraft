/** Local cosmetic capes. Java atlas: 64×32, with a 10×16×1-pixel cuboid. */
import { decodePng, importPng } from './png';
export const CAPE_STYLES = ['none', 'ember', 'forest', 'night', 'custom'] as const;
export type CapeStyle = typeof CAPE_STYLES[number];
export interface CapeProfile { style: CapeStyle; dataUrl: string | null }
export const defaultCape = (): CapeProfile => ({ style: 'none', dataUrl: null });
export function readCape(value: unknown): CapeProfile {
  if (!value || typeof value !== 'object') return defaultCape();
  const saved = value as Partial<CapeProfile>;
  const dataUrl = typeof saved.dataUrl === 'string' && saved.dataUrl.startsWith('data:image/png') ? saved.dataUrl : null;
  const style = CAPE_STYLES.includes(saved.style as CapeStyle) ? saved.style! : 'none';
  return { style: style === 'custom' && !dataUrl ? 'none' : style, dataUrl };
}
export function normalizeCape(image: HTMLImageElement): HTMLCanvasElement {
  if (image.naturalWidth !== 64 || image.naturalHeight !== 32) throw new Error('Use uma capa PNG Java de 64×32 pixels.');
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return canvas;
}
export const decodeCape = (src: string) => decodePng(src, normalizeCape);
export async function importCape(file: File): Promise<string> {
  return (await importPng(file, (w, h) => w === 64 && h === 32, normalizeCape, 'Use uma capa PNG Java de 64×32 pixels.')).dataUrl;
}
export function capeDataUrl(cape: CapeProfile): string | null {
  if (cape.style === 'none') return null;
  if (cape.style === 'custom') return cape.dataUrl;
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const palette = { ember: ['#782f32', '#ffc66b'], forest: ['#225b45', '#c8e889'], night: ['#34356f', '#b7d7ff'] }[cape.style];
  ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, 22, 17);
  // Both broad faces receive an original pixel emblem and a contrasting hem.
  for (const x of [1, 12]) {
    ctx.fillStyle = palette[1]; ctx.fillRect(x, 15, 10, 2);
    ctx.fillRect(x + 4, 4, 2, 7); ctx.fillRect(x + 2, 6, 6, 3);
    ctx.fillStyle = palette[0]; ctx.fillRect(x + 4, 7, 2, 1);
  }
  return canvas.toDataURL('image/png');
}
