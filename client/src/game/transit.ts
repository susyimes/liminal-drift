import type { TunnelLength, TunnelMood } from "@liminal/shared";

export function tunnelMeters(length: TunnelLength | string): number {
  if (length === "short") return 6.8;
  if (length === "long") return 13.4;
  return 9.6;
}

export function inferTunnelMood(
  fromArchetype: string,
  destArchetype?: string | null,
  fallback: TunnelMood = "yellow_throat",
): TunnelMood {
  if (destArchetype === "poolcore" || fromArchetype === "poolcore") return "pool_pipe";
  if (fromArchetype === "flooded_lobby" || destArchetype === "flooded_lobby") return "damp_service";
  if (fromArchetype === "stairwell" || fromArchetype === "dead_end") return "dark_throat";
  return fallback;
}

export function tunnelProgress(
  tunnel: { entry: { x: number; z: number }; exit: { x: number; z: number } },
  x: number,
  z: number,
): number {
  const fx = tunnel.exit.x - tunnel.entry.x;
  const fz = tunnel.exit.z - tunnel.entry.z;
  const len2 = fx * fx + fz * fz;
  if (len2 < 1e-6) return 1;
  const t = ((x - tunnel.entry.x) * fx + (z - tunnel.entry.z) * fz) / len2;
  return Math.min(1, Math.max(0, t));
}

export function tunnelReachedExit(
  tunnel: { entry: { x: number; z: number }; exit: { x: number; z: number } },
  x: number,
  z: number,
  threshold = 0.84,
): boolean {
  return tunnelProgress(tunnel, x, z) >= threshold;
}

export function tunnelWalkYaw(dir: { x: number; z: number }): number {
  return Math.atan2(-dir.x, -dir.z);
}
