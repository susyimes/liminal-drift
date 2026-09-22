import type { TunnelLength, TunnelMood } from "@liminal/shared";

/** Match Player walk speed so tunnel duration stays 0.8–1.4s. */
export const WALK_SPEED = 3.05;
export const TUNNEL_START_INSET = 0.85;
export const TUNNEL_EXIT_T = 0.84;

export function tunnelMeters(length: TunnelLength | string): number {
  if (length === "short") return 4.1;
  if (length === "long") return 5.95;
  return 5.05;
}

export function tunnelWalkSeconds(length: number, speed = WALK_SPEED): number {
  const walkable = Math.max(0.2, length * TUNNEL_EXIT_T - TUNNEL_START_INSET);
  return walkable / speed;
}

export function inferTunnelMood(
  fromArchetype: string,
  destArchetype?: string | null,
  fallback: TunnelMood = "yellow_throat",
): TunnelMood {
  if (destArchetype === "poolcore" || fromArchetype === "poolcore") return "pool_pipe";
  if (fromArchetype === "flooded_lobby" || destArchetype === "flooded_lobby") return "damp_service";
  if (fromArchetype === "stairwell" || fromArchetype === "dead_end" || fromArchetype === "parking_ramp") {
    return "dark_throat";
  }
  if (fromArchetype === "machine_room" || destArchetype === "machine_room") return "damp_service";
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
  threshold = TUNNEL_EXIT_T,
): boolean {
  return tunnelProgress(tunnel, x, z) >= threshold;
}

export function tunnelWalkYaw(dir: { x: number; z: number }): number {
  return Math.atan2(-dir.x, -dir.z);
}
