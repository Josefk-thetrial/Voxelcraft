// ============================================================
// sound.ts — Efeitos sonoros sintetizados com WebAudio
// ------------------------------------------------------------
// Nenhum arquivo de áudio: tudo é gerado proceduralmente
// (osciladores + ruído branco filtrado). O AudioContext só é
// criado após um gesto do usuário (requisito dos navegadores).
// ============================================================

export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** Chamado no primeiro clique/pointer lock — libera o áudio. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
  }

  private ready(): boolean {
    return this.ctx !== null && this.master !== null && this.ctx.state !== 'closed';
  }

  /** Buffer de ruído branco reutilizado por explosões e golpes. */
  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  /** Envoltório simples para um oscilador. */
  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Rajada de ruído filtrada. */
  private burst(filterType: BiquadFilterType, freq: number, q: number, duration: number, volume: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  // ----------------------------------------------------------
  // Efeitos do jogo
  // ----------------------------------------------------------

  /** Quebra de bloco: estalo seco de ruído. */
  breakBlock(): void {
    this.burst('bandpass', 650, 1.6, 0.12, 0.9);
    this.tone('triangle', 180, 90, 0.08, 0.25);
  }

  /** Colocar bloco: impacto grave curto. */
  placeBlock(): void {
    this.tone('square', 150, 105, 0.06, 0.5);
    this.burst('lowpass', 900, 0.8, 0.05, 0.35);
  }

  /** Dano no jogador: tom descendente. */
  hurt(): void {
    this.tone('sawtooth', 260, 90, 0.24, 0.6);
  }

  /** Ataque corpo a corpo (em mob). */
  attackHit(): void {
    this.burst('bandpass', 1500, 2, 0.08, 0.8);
    this.tone('square', 320, 160, 0.07, 0.4);
  }

  /** Morte de mob: "pop" descendente. */
  mobDeath(): void {
    this.tone('triangle', 300, 60, 0.18, 0.55);
    this.burst('lowpass', 500, 1, 0.12, 0.4);
  }

  /** Craft concluído: duas notas ascendentes. */
  craft(): void {
    this.tone('triangle', 523, 523, 0.08, 0.45);
    this.tone('triangle', 784, 784, 0.1, 0.45, 0.09);
  }

  /** Rosnado ocasional de zumbi próximo. */
  zombieGroan(volume = 0.22): void {
    this.tone('sawtooth', 82, 52, 0.7, volume);
    this.tone('sawtooth', 78, 49, 0.65, volume * 0.6, 0.05);
  }

  /** Item coletado. */
  pop(): void {
    this.tone('sine', 600, 800, 0.05, 0.15);
  }
}
