// ============================================================
// save.ts — Salvar/carregar mundo no localStorage
// ------------------------------------------------------------
// O mundo é INFINITO, então não salvamos bloco por bloco: a
// seed recria o terreno original e gravamos apenas as EDIÇÕES
// (diff) + estado do jogador, da sobrevivência, inventário, hora
// do dia e posição de spawn. Leve e instantâneo.
// ============================================================

const SAVE_KEY = 'voxelcraft-save-v1';

export interface SaveData {
  version: number;
  seed: number;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; mode: string };
  gameMode: 'survival' | 'creative';
  stats: { health: number; hunger: number };
  timeOfDay: number; // fração do ciclo [0,1)
  selectedSlot: number;
  hotbarIds?: number[];
  inventory: [number, number][]; // [blockId, count][]
  edits: number[][]; // [x, y, z, id][]
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1 || !Array.isArray(data.edits)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}
