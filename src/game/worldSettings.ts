/** A seed only reproduces terrain when paired with the generator version. */
export type GeneratorVersion = 1 | 2 | 3;
export const CURRENT_GENERATOR_VERSION: GeneratorVersion = 3;
export interface WorldSettings {
  seed: number;
  seedText: string;
  generatorVersion: GeneratorVersion;
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Int32Array(1))[0];
}

/** Signed 32-bit numeric seeds; text uses stable FNV-1a over UTF-16 code units. */
export function seedFromText(text: string): number {
  const value = text.trim();
  if (/^[+-]?\d+$/.test(value)) return Number(BigInt.asIntN(32, BigInt(value)));
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash | 0;
}

export function createWorldSettings(text = ''): WorldSettings {
  const trimmed = text.trim().slice(0, 128);
  const seed = trimmed ? seedFromText(trimmed) : randomSeed();
  return { seed, seedText: trimmed || String(seed), generatorVersion: CURRENT_GENERATOR_VERSION };
}

/** Missing version means the pre-ocean generator, never the current one. */
export function worldSettingsFromSave(saved: { seed: number; seedText?: string; generatorVersion?: GeneratorVersion }): WorldSettings {
  return { seed: saved.seed, seedText: saved.seedText ?? String(saved.seed), generatorVersion: saved.generatorVersion ?? 1 };
}
