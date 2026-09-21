import type { Ambience } from "@liminal/shared";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private dripTimer = 0;
  private stepTimer = 0;
  private muted = false;
  private ambience: Ambience = "hum";
  private proximity = 0;

  get isMuted(): boolean {
    return this.muted;
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.22;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.startHum();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.22, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setAmbience(ambience: Ambience): void {
    this.ambience = ambience;
  }

  setProximity(value: number): void {
    this.proximity = value;
  }

  update(dt: number, moving: boolean, sneak: boolean, fear: number): void {
    if (!this.ctx || !this.master || !this.humGain) return;
    const t = this.ctx.currentTime;
    const humLevel =
      this.ambience === "silence" ? 0.015 : this.ambience === "hum" ? 0.05 : 0.03;
    this.humGain.gain.setTargetAtTime(humLevel + this.proximity * 0.04, t, 0.2);

    if (moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.footstep(sneak);
        this.stepTimer = sneak ? 0.62 : 0.38;
      }
    } else {
      this.stepTimer = 0;
    }

    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      if (this.ambience === "drip" || this.ambience === "whisper_static") this.click(this.ambience);
      this.dripTimer = this.ambience === "drip" ? 0.7 + Math.random() * 1.4 : 2.4;
    }

    if (this.ambience === "footsteps" && Math.random() < dt * 0.35) {
      this.footstep(true);
    }

    if (fear > 70 && Math.random() < dt * 0.4) this.click("whisper_static");
  }

  stinger(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.7);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.82);
  }

  pickup(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.18);
  }

  private startHum(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "square";
    osc.frequency.value = 60;
    filter.type = "lowpass";
    filter.frequency.value = 180;
    gain.gain.value = 0.04;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.humGain = gain;
  }

  private footstep(quiet: boolean): void {
    if (!this.ctx || !this.master) return;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, 2200, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = quiet ? 0.04 : 0.09;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
  }

  private click(kind: Ambience): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = kind === "whisper_static" ? "triangle" : "sine";
    osc.frequency.value = kind === "whisper_static" ? 1400 + Math.random() * 800 : 240 + Math.random() * 80;
    gain.gain.setValueAtTime(kind === "whisper_static" ? 0.03 : 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.14);
  }
}
