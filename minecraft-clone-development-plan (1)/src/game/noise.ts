// ============================================================
// noise.ts — Ruído Perlin 2D clássico + fBm + serrilhado
// ------------------------------------------------------------
// Implementação do "Improved Perlin Noise" (Ken Perlin, 2002):
// interpola gradientes nos vértices de uma grade, usando uma
// tabela de permutação embaralhada pela seed do mundo.
// Sobre ele construímos:
//   • fbm    → soma de oitavas (detalhe natural, usado p/ continentes)
//   • ridged → 1 − |ruído| (cristas afiadas, usado p/ montanhas)
// Determinístico: mesma seed ⇒ mesmo mundo, sempre.
// ============================================================

export class Noise2D {
  /** Tabela de permutação duplicada (0..511) evita overflow de índice. */
  private p = new Uint8Array(512);

  constructor(seed = 1337) {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;

    // Fisher–Yates com PRNG mulberry32 semeado
    let s = seed >>> 0;
    const rnd = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  /** Curva de suavização 6t⁵−15t⁴+10t³ (derivadas nulas nas bordas). */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /** Produto escalar do gradiente pseudoaleatório com o vetor distância. */
  private grad(hash: number, x: number, y: number): number {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }

  /** Perlin 2D em [-1, 1] (aprox.). */
  perlin(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const p = this.p;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const r = this.lerp(
      this.lerp(this.grad(aa, x, y), this.grad(ba, x - 1, y), u),
      this.lerp(this.grad(ab, x, y - 1), this.grad(bb, x - 1, y - 1), u),
      v,
    );
    return r * 1.42; // normaliza para ~[-1,1]
  }

  /**
   * fBm (fractional Brownian motion): soma de oitavas com frequência
   * dobrando e amplitude caindo pela metade → relevo natural.
   */
  fbm(x: number, y: number, octaves: number, gain = 0.5, lacunarity = 2): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm; // [-1, 1]
  }

  /** Ridged noise: cristas em [0, 1] — perfeito para cordilheiras. */
  ridged(x: number, y: number, octaves: number): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * (1 - Math.abs(this.perlin(x * freq, y * freq)));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm; // [0, 1]
  }
}

/** smoothstep clássico entre e0 e e1. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
