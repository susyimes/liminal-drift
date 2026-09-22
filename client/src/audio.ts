import type { Ambience } from "@liminal/shared";

const MUTE_KEY = "liminal-drift-mute";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private airGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private portalGain: GainNode | null = null;
  private dripTimer = 0;
  private stepTimer = 0;
  private oddTimer = 0;
  private muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  private ambience: Ambience = "hum";
  private proximity = 0;
  private humidity = false;
  private inTunnel = false;

  get isMuted(): boolean {
    return this.muted;
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.24;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.startHum();
      this.startAir();
      this.startRumble();
      this.startPortal();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore quota */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.24, this.ctx.currentTime, 0.05);
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

  setPortal(pending: boolean): void {
    if (!this.ctx || !this.portalGain) return;
    this.portalGain.gain.setTargetAtTime(pending ? 0.045 : this.inTunnel ? 0.018 : 0.0001, this.ctx.currentTime, 0.08);
  }

  setTunnel(active: boolean, mood = "yellow_throat"): void {
    this.inTunnel = active;
    if (mood === "pool_pipe" || mood === "damp_service") this.humidity = true;
    if (!active && !this.humidity) {
      /* keep humidity if the destination still wants it */
    }
  }

  setHumidity(on: boolean): void {
    this.humidity = on;
  }

  update(dt: number, moving: boolean, sneak: boolean, fear: number, surface: "carpet" | "wet" | "concrete" = "carpet"): void {
    if (!this.ctx || !this.master || !this.humGain || !this.airGain || !this.rumbleGain) return;
    const t = this.ctx.currentTime;
    const humLevel =
      this.ambience === "silence" ? 0.01 : this.ambience === "hum" ? 0.055 : this.ambience === "whisper_static" ? 0.028 : 0.032;
    this.humGain.gain.setTargetAtTime(humLevel + this.proximity * 0.03, t, 0.22);
    const air =
      this.ambience === "silence" ? 0.006 : this.ambience === "whisper_static" ? 0.03 : this.ambience === "drip" || this.humidity ? 0.018 : 0.012;
    this.airGain.gain.setTargetAtTime(air + fear * 0.00008 + (this.inTunnel ? 0.006 : 0), t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(this.proximity > 0.35 ? (this.proximity - 0.35) * 0.12 : 0.0001, t, 0.15);

    if (moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.footstep(sneak, surface);
        const pace = sneak ? 0.64 : surface === "wet" ? 0.44 : 0.36;
        this.stepTimer = pace;
      }
    } else {
      this.stepTimer = 0;
    }

    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      if (this.ambience === "drip" || this.humidity || this.ambience === "whisper_static") this.click(this.ambience === "whisper_static" ? "whisper_static" : "drip");
      else if (Math.random() < 0.35) this.click("drip");
      this.dripTimer = this.ambience === "drip" || this.humidity ? 0.55 + Math.random() * 1.1 : 2.1 + Math.random() * 2.4;
    }

    if (this.ambience === "footsteps" && Math.random() < dt * 0.4) {
      this.footstep(true, "wet");
    }

    this.oddTimer -= dt;
    if (this.oddTimer <= 0) {
      if (this.ambience !== "silence" && Math.random() < 0.55) this.unidentified();
      this.oddTimer = 3.5 + Math.random() * 6;
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

  uiClick(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(740, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.07);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.09);
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

  portalResolve(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.34);
  }

  enterLand(surface: "carpet" | "wet" | "concrete" = "carpet"): void {
    this.footstep(false, surface);
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(surface === "concrete" ? 78 : 62, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.18);
  }

  hintAhead(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(196, t);
    osc.frequency.exponentialRampToValueAtTime(148, t + 0.55);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.028, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.64);
  }

  bait(): void {
    this.footstep(true, "wet");
    this.click("drip");
  }

  entityStep(muffled: boolean): void {
    this.footstep(true, muffled ? "carpet" : "wet");
  }

  private startHum(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "square";
    osc.frequency.value = 60;
    osc2.type = "sine";
    osc2.frequency.value = 120;
    filter.type = "lowpass";
    filter.frequency.value = 190;
    gain.gain.value = 0.04;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc2.start();
    this.humGain = gain;
  }

  private startAir(): void {
    if (!this.ctx || !this.master) return;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.01;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
    this.airGain = gain;
  }

  private startRumble(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 36;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.rumbleGain = gain;
  }

  private startPortal(): void {
    if (!this.ctx || !this.master) return;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1800;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start();
    this.portalGain = gain;
  }

  private footstep(quiet: boolean, surface: "carpet" | "wet" | "concrete"): void {
    if (!this.ctx || !this.master) return;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, 2200, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === "wet" ? "bandpass" : "lowpass";
    filter.frequency.value = surface === "concrete" ? 720 : surface === "wet" ? 980 : 420;
    const gain = this.ctx.createGain();
    gain.gain.value = quiet ? 0.035 : surface === "wet" ? 0.1 : 0.085;
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

  private unidentified(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(70 + Math.random() * 40, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.04, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(t + 0.46);
  }
}
