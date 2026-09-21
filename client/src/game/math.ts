export type Aabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type Wall = "n" | "s" | "e" | "w";

export const WALLS: Wall[] = ["n", "s", "e", "w"];

export function opposite(wall: Wall): Wall {
  if (wall === "n") return "s";
  if (wall === "s") return "n";
  if (wall === "e") return "w";
  return "e";
}

export function wallNormal(wall: Wall): { x: number; z: number } {
  if (wall === "n") return { x: 0, z: 1 };
  if (wall === "s") return { x: 0, z: -1 };
  if (wall === "e") return { x: 1, z: 0 };
  return { x: -1, z: 0 };
}

export function rotateWall(wall: Wall, turns: number): Wall {
  const order: Wall[] = ["n", "e", "s", "w"];
  const index = order.indexOf(wall);
  return order[((index + turns) % 4 + 4) % 4]!;
}

export function yawFromTurns(turns: number): number {
  return (turns % 4) * (Math.PI / 2);
}

export function rotateY(x: number, z: number, yaw: number): { x: number; z: number } {
  // Match THREE.Object3D rotation.y (right-hand, CCW when looking down +Y):
  // x' = x cos θ + z sin θ,  z' = -x sin θ + z cos θ
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export function aabb(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Aabb {
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function aabbFromCenter(
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
): Aabb {
  return aabb(x - hx, x + hx, y - hy, y + hy, z - hz, z + hz);
}

export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function pointInAabb(x: number, z: number, box: Aabb, pad = 0): boolean {
  return x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
}

export function circleHitsAabb(x: number, z: number, radius: number, box: Aabb): boolean {
  const qx = Math.min(Math.max(x, box.minX), box.maxX);
  const qz = Math.min(Math.max(z, box.minZ), box.maxZ);
  const dx = x - qx;
  const dz = z - qz;
  return dx * dx + dz * dz < radius * radius;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Preferred spawn, then a short spiral so the player is never born inside a collider. */
export function firstFreePoint(
  blocked: (x: number, z: number) => boolean,
  preferredX: number,
  preferredZ: number,
): { x: number; z: number } {
  if (!blocked(preferredX, preferredZ)) return { x: preferredX, z: preferredZ };
  const rings = [0.7, 1.3, 2.0, 2.8];
  const steps = 8;
  for (const radius of rings) {
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const x = preferredX + Math.cos(angle) * radius;
      const z = preferredZ + Math.sin(angle) * radius;
      if (!blocked(x, z)) return { x, z };
    }
  }
  return { x: preferredX, z: preferredZ };
}
