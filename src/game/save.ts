import type { GeneratorVersion } from './worldSettings';
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
  seedText?: string;
  generatorVersion?: GeneratorVersion;
  spawn?: { x: number; y: number; z: number };
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; mode: string };
  gameMode: 'survival' | 'creative';
  stats: { health: number; hunger: number; air?: number };
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
    if (data.version !== 1 || !Array.isArray(data.edits) || !Number.isSafeInteger(data.seed)) return null;
    if (data.generatorVersion !== undefined && data.generatorVersion !== 1 && data.generatorVersion !== 2 && data.generatorVersion !== 3) return null;
    if (!data.player || ![data.player.x, data.player.y, data.player.z, data.player.yaw, data.player.pitch].every(Number.isFinite)) return null;
    if (!data.stats || !Number.isFinite(data.stats.health) || !Number.isFinite(data.stats.hunger) || !Array.isArray(data.inventory)) return null;
    if (data.seedText !== undefined && typeof data.seedText !== 'string') return null;
    if (data.spawn && ![data.spawn.x, data.spawn.y, data.spawn.z].every(Number.isFinite)) return null;
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
