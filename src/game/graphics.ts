export type GraphicsQuality = 'low' | 'balanced' | 'high';
export const GRAPHICS = {
  low: { radius: 3, pixelRatio: 1, shadows: false, shadowSize: 512, antialias: false },
  balanced: { radius: 4, pixelRatio: 1.25, shadows: true, shadowSize: 1024, antialias: false },
  high: { radius: 5, pixelRatio: 2, shadows: true, shadowSize: 2048, antialias: true },
} as const;
export function getGraphicsQuality(): GraphicsQuality {
  try { const value = localStorage.getItem('voxelcraft-graphics'); return value === 'low' || value === 'high' ? value : 'balanced'; }
  catch { return 'balanced'; }
}
export function saveGraphicsQuality(value: GraphicsQuality): boolean {
  try { localStorage.setItem('voxelcraft-graphics', value); return true; } catch { return false; }
}
