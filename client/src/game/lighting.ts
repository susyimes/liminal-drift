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

/** Door-pass overlay: dark → clear, quadratic ease, never a bright flash. */
export function enterFadeOpacity(enterFade: number): number {
  const t = Math.min(1, Math.max(0, enterFade));
  return t * t * 0.58;
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
  return explored ? 0 : 0.11;
}

export function doorFrameHex(explored: boolean): number {
  return explored ? 0x2c2618 : 0x6a4e1a;
}

/** Start-room wayfinding lamp — slow breathe, not a flicker. */
export function startGuideMul(time: number): number {
  return 1 + Math.sin(time * 0.72) * 0.055;
}
