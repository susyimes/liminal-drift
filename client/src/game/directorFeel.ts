/** Director camera / rhythm — small, testable knobs. No shake, no wipe. */

export const ENTER_HOLD_S = 0.5;
export const SETTLE_S = 1.35;
export const FOOTPRINT_LIFE_S = 3.1;
export const GLANCE_START_S = 0.45;
export const GLANCE_PEAK_S = 1.05;
export const GLANCE_END_S = 1.75;
export const PLACE_INSIDE_M = 1.35;
export const TILE_M = 0.4;

export const EYE_YELLOW = 1.62;
export const EYE_TUNNEL = 1.48;
export const EYE_POOL = 1.38;

export function isPoolVibe(archetype?: string | null, mood?: string | null): boolean {
  return archetype === "poolcore" || mood === "humid_teal" || mood === "pool_pipe";
}

export function isYellowOffice(archetype?: string | null): boolean {
  return archetype === "empty_office" || archetype === "hotel_hall" || archetype === "maze_cubicles";
}

export function eyeHeight(kind: "tunnel" | "pool" | "yellow" | "other"): number {
  if (kind === "tunnel") return EYE_TUNNEL;
  if (kind === "pool") return EYE_POOL;
  return EYE_YELLOW;
}

export function tunnelLengthFor(
  dest: string | null | undefined,
  requested: "short" | "medium" | "long" | undefined,
): "short" | "medium" | "long" {
  if (dest === "poolcore" || dest === "flooded_lobby") return "long";
  if (isYellowOffice(dest)) return "short";
  return requested ?? "medium";
}

export function controlEase(settleAge: number, settle = SETTLE_S): number {
  const t = Math.min(1, Math.max(0, settleAge) / settle);
  return 0.28 + t * t * 0.72;
}

export function holdActive(holdRemain: number): boolean {
  return holdRemain > 0;
}

/** Slight head-down while in the throat. */
export function tunnelPitch(progress: number): number {
  return -0.07 - Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI) * 0.03;
}

/** Longer-lens mid-throat, then a short recover. Not a shake. */
export function tunnelFov(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 58.5 + Math.sin(p * Math.PI) * 2.1;
}

/** EaseInOut stride: ~0.25s in, cruise, ~0.15s micro-decel. */
export function tunnelSpeedMul(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.22) {
    const t = p / 0.22;
    return t * t * (3 - 2 * t);
  }
  if (p > 0.86) {
    const t = (1 - p) / 0.14;
    return 0.42 + t * t * (3 - 2 * t) * 0.58;
  }
  return 1;
}

/** Edge falloff so the vanishing speck sits in a readable ellipse. */
export function tunnelVignette(): number {
  return 0.64;
}

export function tunnelStrafeMul(): number {
  return 0.12;
}

/**
 * 2–3 frames of cool-white overbright at the far threshold, after a brief dark.
 * Recover is handled by `exitRecover` once the room loads.
 */
export function exitFlashAdd(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.8 || p > 0.9) return 0;
  if (p < 0.845) return -0.2;
  return 0.28;
}

/** 0.12–0.18s exposure recover after the exit flash. */
export function exitRecover(sinceLand: number): number {
  if (sinceLand <= 0) return 0.22;
  if (sinceLand >= 0.16) return 0;
  const t = 1 - sinceLand / 0.16;
  return t * t * 0.22;
}

/** Camera / FOV / vignette return in ~0.2s after leaving the throat. */
export function liftAmount(sinceLand: number): number {
  const t = Math.min(1, Math.max(0, sinceLand / 0.2));
  return t * t * (3 - 2 * t);
}

/** Optional glance across the second exit. Returns yaw delta in radians. */
export function glanceYaw(age: number, sideSign: number, peak = 0.34): number {
  if (age < GLANCE_START_S || age > GLANCE_END_S) return 0;
  const span = GLANCE_END_S - GLANCE_START_S;
  const u = (age - GLANCE_START_S) / span;
  const bell = Math.sin(u * Math.PI);
  const peakU = (GLANCE_PEAK_S - GLANCE_START_S) / span;
  const shaped = u < peakU ? bell : bell * 0.85;
  return sideSign * peak * shaped;
}

export function footprintOpacity(age: number, life = FOOTPRINT_LIFE_S): number {
  if (age < 0 || age >= life) return 0;
  const t = age / life;
  return (1 - t) * (1 - t) * 0.34;
}

export function splashOpacity(age: number, life = 0.55): number {
  if (age < 0 || age >= life) return 0;
  return (1 - age / life) * 0.28;
}

export function splashScale(age: number): number {
  return 0.18 + age * 1.6;
}

/** Texture.repeat so a 30–50cm tile reads at `meters` of world size. */
export function tileRepeat(meters: number, tileM = TILE_M, tilesInMap = 4): number {
  return Math.max(0.8, meters / (tileM * tilesInMap));
}

/** Side of the strongest off-axis walkable opening. +1 = right. */
export function glanceSignFromExits(
  px: number,
  pz: number,
  yaw: number,
  exits: ReadonlyArray<{ x: number; z: number }>,
): number {
  if (exits.length === 0) return 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best = 0;
  let bestAbs = 0;
  for (const exit of exits) {
    const dx = exit.x - px;
    const dz = exit.z - pz;
    const side = fx * dz - fz * dx;
    if (Math.abs(side) > bestAbs) {
      bestAbs = Math.abs(side);
      best = side >= 0 ? 1 : -1;
    }
  }
  return best;
}
