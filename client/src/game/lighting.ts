import type { LightingMood, TunnelMood } from "@liminal/shared";

/** Calm tube flicker — mood, not a strobe. Frequencies stay under ~1 Hz. */
export function tubeFlickerMul(opts: {
  buzzing: boolean;
  powerFlicker: number;
  time: number;
  phase: number;
  fear: number;
  here: boolean;
}): number {
  const { buzzing, powerFlicker, time, phase, fear, here } = opts;
  const buzz = buzzing ? 0.94 + Math.sin(time * 2.2 + phase) * 0.045 : 1;
  const rare = buzzing ? 1 - 0.05 * Math.max(0, Math.sin(time * 0.85 + phase * 0.21) - 0.82) / 0.18 : 1;
  let blackout = 1;
  if (powerFlicker > 0) {
    if (powerFlicker > 1.15) blackout = 0.34;
    else if (powerFlicker > 0.55) blackout = 0.58 + (1.15 - powerFlicker) * 0.28;
    else blackout = 0.82 + (0.55 - powerFlicker) * 0.33;
  }
  const fearDim = 1 - fear * 0.0035;
  const hop = here ? 1 : 0.42;
  return Math.max(0.16, buzz * rare * blackout * fearDim * hop);
}

export const DOOR_SHIMMER_NEAR = 3.15;

export function doorShimmerOpacity(kind: "pending" | "ready", time: number): number {
  // Ready doors stay dark — a lingering veil sat in the player's face after prefetch.
  if (kind === "ready") return 0;
  return 0.08 + Math.abs(Math.sin(time * 1.6)) * 0.05;
}

export function doorGlitchOpacity(time: number): number {
  return 0.02 + Math.abs(Math.sin(time * 1.8 + 1.2)) * 0.03;
}

/** Landing recover: a light exposure dip, never a black wipe. */
export function enterFadeOpacity(enterFade: number): number {
  const t = Math.min(1, Math.max(0, enterFade));
  return t * t * 0.16;
}

/** Exposure dip while crossing a jamb. Positive value is subtracted. */
export function enterExposureDip(enterFade: number): number {
  const t = Math.min(1, Math.max(0, enterFade));
  return t * t * 0.13;
}

/** Extra vignette while the jamb silhouette is up. */
export function enterVignetteAdd(enterFade: number): number {
  const t = Math.min(1, Math.max(0, enterFade));
  return t * t * 0.22;
}

/** Static veil: unexplored throats read slightly occupied; explored stay open. */
export function doorVeilOpacity(explored: boolean): number {
  return explored ? 0 : 0.32;
}

export function doorVeilHex(explored: boolean): number {
  return explored ? 0x0a1218 : 0xd47820;
}

export function doorFrameHex(explored: boolean): number {
  return explored ? 0x163038 : 0xe07a1c;
}

/** Start-room wayfinding lamp — slow breathe, not a flicker. */
export function startGuideMul(time: number): number {
  return 1 + Math.sin(time * 0.72) * 0.055;
}

/** Fixture color grade. Mood is palette; flicker/dim stays separate. */
export function lightHexForMood(mood: LightingMood | string, here: boolean): number {
  if (mood === "humid_teal") return here ? 0xd4eef6 : 0x3e6a72;
  if (mood === "cold_service") return here ? 0xd4e2ee : 0x6a7c88;
  if (mood === "brownout") return here ? 0xd0a85a : 0x5a4a28;
  return here ? 0xfff1b0 : 0x8fa0b4;
}

export function tubeEmissiveHex(mood: LightingMood | string): number {
  if (mood === "humid_teal") return 0xc8e8f2;
  if (mood === "cold_service") return 0xdce8f4;
  if (mood === "brownout") return 0xe0b86a;
  return 0xfff1b0;
}

/** Tunnel tubes after they settle — almost still, never a strobe. */
export function tunnelTubeMul(time: number, phase: number): number {
  return 0.975 + Math.sin(time * 0.45 + phase) * 0.012;
}

/**
 * Two smooth dips in the first ~0.45s, then hold.
 * Each dip is ~180ms so a frame never slams to black.
 */
export function tunnelStartupFlicker(elapsed: number): number {
  const dip = (t: number, start: number): number => {
    const u = (t - start) / 0.18;
    if (u < 0 || u > 1) return 1;
    const v = u < 0.5 ? u * 2 : (1 - u) * 2;
    return 1 - v * 0.34;
  };
  return Math.min(dip(elapsed, 0.04), dip(elapsed, 0.28));
}

/** Side squeeze only — the player must still see the walk. */
export function tunnelOverlayOpacity(progress: number, waiting: boolean): number {
  const p = Math.min(1, Math.max(0, progress));
  const mid = 0.045 + Math.sin(p * Math.PI) * 0.03;
  return waiting ? mid + 0.02 : mid;
}

export function tunnelFogHex(mood: TunnelMood | string): number {
  if (mood === "pool_pipe") return 0x1a4044;
  if (mood === "damp_service") return 0x243830;
  if (mood === "dark_throat") return 0x14181c;
  return 0x2a3630;
}
