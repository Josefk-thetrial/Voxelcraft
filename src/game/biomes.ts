// ============================================================
// biomes.ts — Classificação de biomas por clima
// ------------------------------------------------------------
// Dois campos de ruído de baixa frequência definem o clima:
//   temperatura: frio → neve | quente + seco → deserto
//   umidade:     úmido + temperado → floresta | resto → planície
// Altitude extrema sempre vira neve (linha de neve).
// ============================================================
import { Noise2D } from './noise';

export enum Biome {
  Plains = 0,
  Forest = 1,
  Desert = 2,
  Snow = 3,
  Ocean = 4,
  DeepOcean = 5,
  Beach = 6,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Plains]: 'Planície',
  [Biome.Forest]: 'Floresta',
  [Biome.Desert]: 'Deserto',
  [Biome.Snow]: 'Neve',
  [Biome.Ocean]: 'Oceano',
  [Biome.DeepOcean]: 'Oceano profundo',
  [Biome.Beach]: 'Praia',
};

export class BiomeClassifier {
  private tempNoise: Noise2D;
  private moistNoise: Noise2D;

  constructor(seed: number) {
    this.tempNoise = new Noise2D(seed ^ 0x51f15e);
    this.moistNoise = new Noise2D(seed ^ 0x2b9d3a);
  }

  /** Temperatura/umidade normalizadas [0,1] na coluna global. */
  climate(x: number, z: number): { temp: number; moist: number } {
    const temp = 0.5 + 0.5 * this.tempNoise.fbm(x * 0.004 + 700, z * 0.004 - 700, 3);
    const moist = 0.5 + 0.5 * this.moistNoise.fbm(x * 0.004 - 1400, z * 0.004 + 1400, 3);
    return { temp, moist };
  }

  biomeAt(x: number, z: number): Biome {
    const { temp, moist } = this.climate(x, z);
    if (temp < 0.33) return Biome.Snow;
    if (temp > 0.66 && moist < 0.44) return Biome.Desert;
    if (moist > 0.56 && temp > 0.4) return Biome.Forest;
    return Biome.Plains;
  }
}
