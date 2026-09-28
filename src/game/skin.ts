// Persistência da skin do jogador no navegador.
const SKIN_STORAGE_KEY = 'voxelcraft-player-skin';

export function getStoredSkinDataUrl(): string | null {
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSkinDataUrl(dataUrl: string): boolean {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSkinDataUrl(): void {
  try {
    localStorage.removeItem(SKIN_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
