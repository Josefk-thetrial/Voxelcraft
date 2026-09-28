// ============================================================
// noise3d.ts — Ruído de valor 3D + fBm para CAVERNAS
// ------------------------------------------------------------
// Diferente do Perlin 2D do relevo, cavernas pedem um campo
// TRIDIMENSIONAL: usamos value noise 3D com hash de vértice
// (x,y,z,seed) → interpolação trilinear suave. Paredes se formam
// onde o valor cruza zero → túneis e cavernas orgânicas.
// ============================================================

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export class Noise3D {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed | 0;
  }

  /** Hash determinístico de um vértice da grade 3D → [-1, 1]. */
  private lattice(ix: number, iy: number, iz: number): number {
    let h = ix * 374761393 + iy * 668265263 + iz * 2246822519 + this.seed * 3266489917;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 20000) / 10000 - 1;
  }

  /** Value noise 3D contínuo em [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const tz = fade(z - z0);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const c000 = this.lattice(x0, y0, z0);
    const c100 = this.lattice(x0 + 1, y0, z0);
    const c010 = this.lattice(x0, y0 + 1, z0);
    const c110 = this.lattice(x0 + 1, y0 + 1, z0);
    const c001 = this.lattice(x0, y0, z0 + 1);
    const c101 = this.lattice(x0 + 1, y0, z0 + 1);
    const c011 = this.lattice(x0, y0 + 1, z0 + 1);
    const c111 = this.lattice(x0 + 1, y0 + 1, z0 + 1);

    const x00 = lerp(c000, c100, tx);
    const x10 = lerp(c010, c110, tx);
    const x01 = lerp(c001, c101, tx);
    const x11 = lerp(c011, c111, tx);
    const y0v = lerp(x00, x10, ty);
    const y1v = lerp(x01, x11, ty);
    return lerp(y0v, y1v, tz);
  }

  /** fBm 3D: soma de oitavas para estruturas multi-escala. */
  fbm(x: number, y: number, z: number, octaves: number, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }
}
