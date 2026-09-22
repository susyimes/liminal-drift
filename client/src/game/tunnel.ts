import * as THREE from "three";
import { hashString, type TunnelLength, type TunnelMood } from "@liminal/shared";
import { lightHexForMood, tunnelStartupFlicker, tunnelTubeMul } from "./lighting.ts";
import { aabbFromCenter, rotateY, type Aabb } from "./math.ts";
import type { BuiltRoom, Door, RoomLight } from "./rooms.ts";
import { doorOutward, doorWorldPos } from "./rooms.ts";
import { tex, tiled } from "./textures.ts";
import { tunnelMeters } from "./transit.ts";

export { inferTunnelMood, tunnelMeters, tunnelProgress, tunnelReachedExit, tunnelWalkYaw } from "./transit.ts";

export type BuiltTunnel = {
  id: string;
  parentRoomId: string;
  parentDoorId: string;
  mood: TunnelMood;
  lengthKind: TunnelLength;
  length: number;
  width: number;
  cx: number;
  cz: number;
  yaw: number;
  dir: { x: number; z: number };
  entry: { x: number; z: number };
  exit: { x: number; z: number };
  group: THREE.Group;
  colliders: Aabb[];
  bounds: Aabb;
  lights: RoomLight[];
  farVeil: THREE.Mesh;
  surface: "carpet" | "wet" | "concrete";
  litAt: number;
};

const HEIGHT = 2.38;
const WIDTH = 1.86;
const WALL_T = 0.18;

function std(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02, ...opts });
}

function moodPalette(mood: TunnelMood): {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  lightMood: "sick_yellow" | "humid_teal" | "cold_service" | "brownout";
  surface: "carpet" | "wet" | "concrete";
  intensity: number;
} {
  if (mood === "pool_pipe") {
    return {
      wall: std({ color: 0xd4ecec, map: tex.tileWall, roughness: 0.28, metalness: 0.12 }),
      floor: std({
        color: 0xb8e0e4,
        map: tex.tileFloor,
        roughnessMap: tex.tileFloorRough,
        roughness: 0.16,
        metalness: 0.22,
      }),
      ceiling: std({ color: 0xc8d8d8, map: tex.poolCeiling ?? tex.tileWall, roughness: 0.4 }),
      lightMood: "humid_teal",
      surface: "wet",
      intensity: 10,
    };
  }
  if (mood === "damp_service") {
    return {
      wall: std({ color: 0x9aa090, map: tex.concrete, roughness: 0.94 }),
      floor: std({ color: 0x6e7a52, map: tex.carpetWet, roughness: 0.34, metalness: 0.08 }),
      ceiling: std({ color: 0x8a8878, map: tex.concrete, roughness: 0.95 }),
      lightMood: "cold_service",
      surface: "wet",
      intensity: 7.4,
    };
  }
  if (mood === "dark_throat") {
    return {
      wall: std({ color: 0x4a4638, map: tex.concrete, roughness: 0.96 }),
      floor: std({ color: 0x3a3428, map: tex.concrete, roughness: 0.9 }),
      ceiling: std({ color: 0x2e2c26, roughness: 0.96 }),
      lightMood: "brownout",
      surface: "concrete",
      intensity: 3.8,
    };
  }
  return {
    wall: std({ color: 0xe4d25a, map: tex.wall, roughness: 0.9 }),
    floor: std({ color: 0xc4a056, map: tex.carpet, roughness: 0.58, metalness: 0.06 }),
    ceiling: std({ color: 0xc9c3a6, map: tex.ceiling, roughness: 0.92 }),
    lightMood: "cold_service",
    surface: "carpet",
    intensity: 9.2,
  };
}

export function buildTunnel(options: {
  id: string;
  parent: BuiltRoom;
  door: Door;
  length: TunnelLength;
  mood: TunnelMood;
}): BuiltTunnel {
  const length = tunnelMeters(options.length);
  const out = doorOutward(options.parent, options.door);
  const origin = doorWorldPos(options.parent, options.door);
  const yaw = Math.atan2(out.x, out.z);
  const cx = origin.x + out.x * (length / 2);
  const cz = origin.z + out.z * (length / 2);
  const palette = moodPalette(options.mood);

  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.rotation.y = yaw;

  const floorMat = palette.floor.clone();
  if (floorMat.map) floorMat.map = tiled(floorMat.map, WIDTH / 1.4, length / 1.8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, length), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  if (options.mood === "pool_pipe" || options.mood === "damp_service") {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH - 0.28, length - 0.28),
      std({
        color: options.mood === "pool_pipe" ? 0x1a6a62 : 0x2d4036,
        map: options.mood === "pool_pipe" ? tex.poolWater : tex.water,
        transparent: true,
        opacity: 0.3,
        roughness: 0.12,
        metalness: 0.2,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.03;
    group.add(water);
  }

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, length), palette.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HEIGHT;
  group.add(ceil);

  const collidersLocal: Aabb[] = [];
  const wallZ = length / 2;
  const wallX = WIDTH / 2;
  for (const side of [-1, 1]) {
    const wmat = palette.wall.clone();
    if (wmat.map) wmat.map = tiled(wmat.map, length / 1.8, HEIGHT / 2.0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, HEIGHT, length + WALL_T), wmat);
    mesh.position.set(side * wallX, HEIGHT / 2, 0);
    group.add(mesh);
    collidersLocal.push(aabbFromCenter(side * wallX, HEIGHT / 2, 0, WALL_T / 2 + 0.04, HEIGHT / 2, wallZ));
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(length, HEIGHT * 0.92),
      new THREE.MeshBasicMaterial({
        color: options.mood === "pool_pipe" ? 0x8ec8c4 : 0x9aa89a,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
    );
    inner.position.set(side * (wallX - 0.06), HEIGHT / 2, 0);
    inner.rotation.y = side * (Math.PI / 2);
    group.add(inner);
  }

  const lights: RoomLight[] = [];
  const tubes = 4;
  for (let i = 0; i < tubes; i += 1) {
    const t = (i + 0.55) / tubes;
    const z = -wallZ + t * length;
    const along = i / Math.max(1, tubes - 1);
    const dead = along > 0.72;
    const fade = 1 - along * 0.62;
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.05, 0.22),
      std({ color: 0x4a5348, metalness: 0.5, roughness: 0.4 }),
    );
    housing.position.set(0, HEIGHT - 0.04, z);
    group.add(housing);
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.035, 0.11),
      new THREE.MeshStandardMaterial({
        color: dead ? 0x6a6558 : 0xe8fff6,
        emissive: dead ? 0x000000 : 0xc8fff0,
        emissiveIntensity: dead ? 0 : 1.05 * fade,
        roughness: 0.28,
      }),
    );
    tube.position.set(0, HEIGHT - 0.09, z);
    group.add(tube);
    if (!dead) {
      const light = new THREE.PointLight(
        lightHexForMood("cold_service", true),
        palette.intensity * fade,
        6.4,
        1.7,
      );
      light.position.set(0, HEIGHT - 0.3, z);
      group.add(light);
      lights.push({
        light,
        base: palette.intensity * fade,
        phase: hashString(`${options.id}:${z}`) % 100,
        tube,
      });
    }
  }

  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, HEIGHT * 0.52),
    new THREE.MeshBasicMaterial({
      color: 0xe8fff8,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  seam.position.set(0, HEIGHT * 0.46, wallZ - 0.03);
  group.add(seam);
  const seamGlow = new THREE.PointLight(0xd8fff4, 4.6, 3.8, 1.8);
  seamGlow.position.set(0, HEIGHT * 0.5, wallZ - 0.2);
  group.add(seamGlow);
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH * 0.92, HEIGHT * 0.9),
    new THREE.MeshBasicMaterial({
      color: 0xb8d8d0,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  haze.position.set(0, HEIGHT / 2, wallZ * 0.35);
  group.add(haze);

  const worldColliders = collidersLocal.map((box) => {
    const corners = [
      rotateY(box.minX, box.minZ, yaw),
      rotateY(box.minX, box.maxZ, yaw),
      rotateY(box.maxX, box.minZ, yaw),
      rotateY(box.maxX, box.maxZ, yaw),
    ];
    const xs = corners.map((c) => c.x + cx);
    const zs = corners.map((c) => c.z + cz);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: box.minY,
      maxY: box.maxY,
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  });

  const halfW = WIDTH / 2 + 0.12;
  const halfL = length / 2 + 0.12;
  const boundCorners = [
    rotateY(-halfW, -halfL, yaw),
    rotateY(-halfW, halfL, yaw),
    rotateY(halfW, -halfL, yaw),
    rotateY(halfW, halfL, yaw),
  ];
  const bxs = boundCorners.map((c) => c.x + cx);
  const bzs = boundCorners.map((c) => c.z + cz);

  return {
    id: options.id,
    parentRoomId: options.parent.id,
    parentDoorId: options.door.id,
    mood: options.mood,
    lengthKind: options.length,
    length,
    width: WIDTH,
    cx,
    cz,
    yaw,
    dir: out,
    entry: { x: origin.x + out.x * 0.08, z: origin.z + out.z * 0.08 },
    exit: { x: origin.x + out.x * length, z: origin.z + out.z * length },
    group,
    colliders: worldColliders,
    bounds: {
      minX: Math.min(...bxs),
      maxX: Math.max(...bxs),
      minY: 0,
      maxY: HEIGHT,
      minZ: Math.min(...bzs),
      maxZ: Math.max(...bzs),
    },
    lights,
    farVeil: seam,
    surface: palette.surface,
    litAt: 0,
  };
}

export function updateTunnelLights(tunnel: BuiltTunnel, time: number, now = performance.now()): void {
  const elapsed = tunnel.litAt > 0 ? (now - tunnel.litAt) / 1000 : 1;
  const startMul = tunnelStartupFlicker(elapsed);
  for (const entry of tunnel.lights) {
    const mul = tunnelTubeMul(time, entry.phase) * startMul;
    entry.light.intensity = entry.base * mul;
    const tube = entry.tube.material;
    if (tube instanceof THREE.MeshStandardMaterial) {
      tube.emissiveIntensity = 0.62 + mul * 0.4;
    }
  }
}
