import * as THREE from "three";
import {
  graffitiFor,
  hashString,
  mulberry32,
  notesFor,
  planDoorWalls,
  type RoomArchetype,
  type RoomDecision,
} from "@liminal/shared";
import {
  aabbFromCenter,
  opposite,
  rotateWall,
  rotateY,
  wallNormal,
  yawFromTurns,
  type Aabb,
  type Wall,
} from "./math.ts";
import { initialDoorGeneration } from "./doors.ts";
import { tileRepeat } from "./directorFeel.ts";
import { makeGraffitiTexture, tex, tiled } from "./textures.ts";

export type PickupKind = "battery" | "keycard" | "note";

export type Pickup = {
  id: string;
  kind: PickupKind;
  note?: string;
  mesh: THREE.Object3D;
  taken: boolean;
};

export type Door = {
  id: string;
  wall: Wall;
  worldWall: Wall;
  localX: number;
  localZ: number;
  width: number;
  isExit: boolean;
  isFalseExit: boolean;
  fake: boolean;
  locked: boolean;
  baitVisible: boolean;
  saferDim: boolean;
  low: boolean;
  connectedRoomId: string | null;
  generation: "idle" | "pending" | "ready";
  pendingSince: number;
  decision: RoomDecision | null;
  shimmer: THREE.Mesh;
  glitch: THREE.Mesh;
  veil: THREE.Mesh;
  frames: THREE.Mesh[];
};

export type RoomLight = {
  light: THREE.PointLight;
  base: number;
  phase: number;
  tube: THREE.Mesh;
};

export type BuiltRoom = {
  id: string;
  archetype: RoomArchetype;
  decision: RoomDecision;
  group: THREE.Group;
  colliders: Aabb[];
  bounds: Aabb;
  doors: Door[];
  pickups: Pickup[];
  lights: RoomLight[];
  water: boolean;
  darkPatch: Aabb | null;
  alcove: Aabb | null;
  cx: number;
  cz: number;
  yaw: number;
  width: number;
  depth: number;
  entryWall: Wall;
  powerFlicker: number;
  surface: "carpet" | "wet" | "concrete";
  guideLight: THREE.PointLight | null;
  guideBase: number;
  puddles: THREE.Mesh[];
};

const DOOR_W = 1.45;
const DOOR_H = 2.15;
const WALL_T = 0.2;
const HEIGHT = 2.85;

function std(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    roughness: 0.86,
    metalness: 0.02,
    ...opts,
  });
}

const mats = {
  wall: std({ color: 0xe4d25a, map: tex.wall, normalMap: tex.wallNorm, roughness: 0.9 }),
  wallDamp: std({ color: 0xc8c07a, map: tex.wallDamp, normalMap: tex.wallNorm, roughness: 0.88 }),
  wallExit: std({ color: 0xc5d36a, map: tex.wallExit, normalMap: tex.wallNorm, roughness: 0.88 }),
  wallConcrete: std({ color: 0xb7ae88, map: tex.concrete, roughness: 0.95 }),
  carpet: std({
    color: 0xc4a056,
    map: tex.carpet,
    roughnessMap: tex.carpetRough,
    roughness: 0.58,
    metalness: 0.06,
  }),
  carpetWet: std({
    color: 0x6e7a52,
    map: tex.carpetWet,
    roughnessMap: tex.carpetWetRough,
    roughness: 0.32,
    metalness: 0.1,
  }),
  ceiling: std({ color: 0xc9c3a6, map: tex.ceiling, roughness: 0.92 }),
  frame: std({ color: 0x4a3614, roughness: 0.7, metalness: 0.08 }),
  desk: std({ color: 0x8a7340, roughness: 0.62, metalness: 0.04 }),
  dark: std({ color: 0x2a2416, roughness: 0.9 }),
  water: std({
    color: 0x2d4036,
    map: tex.water,
    transparent: true,
    opacity: 0.46,
    roughness: 0.18,
    metalness: 0.12,
  }),
  metal: std({ color: 0x4a5348, roughness: 0.42, metalness: 0.55 }),
  card: std({ color: 0xc23b2e, roughness: 0.35, metalness: 0.15, emissive: 0x3a0808, emissiveIntensity: 0.15 }),
  battery: std({ color: 0xf2e27a, roughness: 0.4, metalness: 0.2, emissive: 0x4a3a10, emissiveIntensity: 0.2 }),
  paper: std({ color: 0xefe6c4, roughness: 0.88 }),
  stain: std({ color: 0x4a3a18, transparent: true, opacity: 0.38, roughness: 0.95 }),
  lightDead: std({ color: 0x6a6558, roughness: 0.7 }),
  trim: std({ color: 0x6b5420, roughness: 0.75 }),
  bars: std({ color: 0x2a2c28, roughness: 0.35, metalness: 0.7 }),
  alcove: std({ color: 0xc4b24a, map: tex.wall, roughness: 0.86 }),
  tile: std({ color: 0xc8d4d2, map: tex.tileWall, roughness: 0.36, metalness: 0.06 }),
  tileFloor: std({
    color: 0xb8ccc8,
    map: tex.tileFloor,
    roughnessMap: tex.tileFloorRough,
    roughness: 0.16,
    metalness: 0.16,
  }),
  pool: std({
    color: 0x1a6a62,
    map: tex.poolWater,
    transparent: true,
    opacity: 0.56,
    roughness: 0.08,
    metalness: 0.28,
  }),
  puddle: std({
    color: 0x3e9a86,
    map: tex.poolWater,
    transparent: true,
    opacity: 0.4,
    roughness: 0.06,
    metalness: 0.32,
  }),
  rust: std({ color: 0x6a3a1e, roughness: 0.82, metalness: 0.22 }),
  ring: std({ color: 0xe85a18, roughness: 0.42, metalness: 0.12 }),
  extinguisher: std({ color: 0xb82018, roughness: 0.48, metalness: 0.18 }),
  kick: std({ color: 0xc45a20, roughness: 0.7 }),
  locker: std({ color: 0x8aa0a4, roughness: 0.45, metalness: 0.35 }),
  chalk: std({ color: 0x2a3a32, roughness: 0.92 }),
  plastic: std({ color: 0xc8d0c4, transparent: true, opacity: 0.28, roughness: 0.2 }),
  paint: std({ color: 0xc9a22a, roughness: 0.7 }),
};

export function sizeOf(archetype: RoomArchetype, size: RoomDecision["size"]): { w: number; d: number } {
  const base: Record<RoomArchetype, { w: number; d: number }> = {
    empty_office: { w: 12, d: 12 },
    long_hall: { w: 4.6, d: 26 },
    flooded_lobby: { w: 16, d: 16 },
    maze_cubicles: { w: 15, d: 15 },
    stairwell: { w: 8.2, d: 8.2 },
    dead_end: { w: 6.4, d: 6.4 },
    exit_foyer: { w: 9, d: 10 },
    poolcore: { w: 15, d: 18 },
    hotel_hall: { w: 5.4, d: 22 },
    parking_ramp: { w: 10, d: 20 },
    machine_room: { w: 10, d: 10 },
    empty_classroom: { w: 13, d: 11 },
    unfinished: { w: 12, d: 12 },
  };
  const raw = base[archetype];
  const mul = size === "cramped" ? 0.78 : size === "vast" ? 1.28 : 1;
  if (archetype === "long_hall") return { w: raw.w, d: raw.d * (size === "vast" ? 1.15 : 1) };
  if (archetype === "dead_end" || archetype === "stairwell") return { w: raw.w * Math.min(mul, 1.05), d: raw.d * Math.min(mul, 1.05) };
  return { w: raw.w * mul, d: raw.d * mul };
}

function wallMaterial(archetype: RoomArchetype): THREE.MeshStandardMaterial {
  if (archetype === "exit_foyer") return mats.wallExit;
  if (archetype === "stairwell" || archetype === "parking_ramp" || archetype === "machine_room") {
    return mats.wallConcrete;
  }
  if (archetype === "flooded_lobby" || archetype === "unfinished") return mats.wallDamp;
  if (archetype === "poolcore") return mats.tile;
  return mats.wall;
}

function addBox(
  group: THREE.Group,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export function turnsToAlign(entryLocal: Wall, neededWorldOut: Wall): number {
  for (let turns = 0; turns < 4; turns += 1) {
    if (rotateWall(entryLocal, turns) === neededWorldOut) return turns;
  }
  return 0;
}

export function localDoorPos(wall: Wall, w: number, d: number, along = 0): { x: number; z: number } {
  if (wall === "n") return { x: along, z: d / 2 };
  if (wall === "s") return { x: along, z: -d / 2 };
  if (wall === "e") return { x: w / 2, z: along };
  return { x: -w / 2, z: along };
}

function clampDoorAlong(span: number): number {
  return Math.max(0.2, (span - DOOR_W) / 2 - 0.12);
}

function wallSegments(
  wall: Wall,
  w: number,
  d: number,
  doorOnWall: boolean,
  along = 0,
): Array<{ x: number; z: number; sx: number; sz: number }> {
  const halfW = w / 2;
  const halfD = d / 2;
  if (wall === "n" || wall === "s") {
    const z = wall === "n" ? halfD : -halfD;
    if (!doorOnWall) return [{ x: 0, z, sx: w + WALL_T, sz: WALL_T }];
    const max = clampDoorAlong(w);
    const mid = Math.max(-max, Math.min(max, along));
    const left = mid + halfW - DOOR_W / 2;
    const right = halfW - mid - DOOR_W / 2;
    return [
      { x: -halfW + left / 2, z, sx: left, sz: WALL_T },
      { x: halfW - right / 2, z, sx: right, sz: WALL_T },
    ];
  }
  const x = wall === "e" ? halfW : -halfW;
  if (!doorOnWall) return [{ x, z: 0, sx: WALL_T, sz: d + WALL_T }];
  const max = clampDoorAlong(d);
  const mid = Math.max(-max, Math.min(max, along));
  const left = mid + halfD - DOOR_W / 2;
  const right = halfD - mid - DOOR_W / 2;
  return [
    { x, z: -halfD + left / 2, sx: WALL_T, sz: left },
    { x, z: halfD - right / 2, sx: WALL_T, sz: right },
  ];
}

function transformAabb(local: Aabb, cx: number, cz: number, yaw: number): Aabb {
  const corners = [
    rotateY(local.minX, local.minZ, yaw),
    rotateY(local.minX, local.maxZ, yaw),
    rotateY(local.maxX, local.minZ, yaw),
    rotateY(local.maxX, local.maxZ, yaw),
  ];
  const xs = corners.map((c) => c.x + cx);
  const zs = corners.map((c) => c.z + cz);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: local.minY,
    maxY: local.maxY,
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

export function roomWorldBounds(cx: number, cz: number, w: number, d: number, yaw: number): Aabb {
  return transformAabb(aabbFromCenter(0, HEIGHT / 2, 0, w / 2 + 0.2, HEIGHT / 2, d / 2 + 0.2), cx, cz, yaw);
}

function planDoors(entryLocal: Wall, decision: RoomDecision) {
  return planDoorWalls(entryLocal, decision);
}

function makeDoorVisuals(
  group: THREE.Group,
  wall: Wall,
  pos: { x: number; z: number },
  kind: "real" | "fake" | "false_exit" | "locked" | "exit",
  opts: { bait?: boolean; safer?: boolean; low?: boolean } = {},
): { shimmer: THREE.Mesh; glitch: THREE.Mesh; veil: THREE.Mesh; frames: THREE.Mesh[] } {
  const doorH = opts.low ? DOOR_H * 0.72 : DOOR_H;
  const doorW = opts.low ? DOOR_W * 0.82 : DOOR_W;
  const frameMat = mats.frame.clone();
  if (opts.safer) frameMat.color.setHex(0x2a2618);
  if (opts.bait) frameMat.color.setHex(0x8a6a22);
  const left = addBox(
    group,
    frameMat,
    wall === "e" || wall === "w" ? pos.x : pos.x - (doorW / 2 + 0.06),
    doorH / 2,
    wall === "n" || wall === "s" ? pos.z : pos.z - (doorW / 2 + 0.06),
    wall === "n" || wall === "s" ? 0.1 : 0.22,
    doorH,
    wall === "n" || wall === "s" ? 0.22 : 0.1,
  );
  const right = addBox(
    group,
    frameMat,
    wall === "e" || wall === "w" ? pos.x : pos.x + (doorW / 2 + 0.06),
    doorH / 2,
    wall === "n" || wall === "s" ? pos.z : pos.z + (doorW / 2 + 0.06),
    wall === "n" || wall === "s" ? 0.1 : 0.22,
    doorH,
    wall === "n" || wall === "s" ? 0.22 : 0.1,
  );
  const lintel = addBox(
    group,
    frameMat,
    pos.x,
    doorH + 0.06,
    pos.z,
    wall === "n" || wall === "s" ? doorW + 0.28 : 0.22,
    0.12,
    wall === "n" || wall === "s" ? 0.22 : doorW + 0.28,
  );
  const frames = [left, right, lintel];

  const yaw = wall === "e" ? -Math.PI / 2 : wall === "w" ? Math.PI / 2 : wall === "s" ? Math.PI : 0;
  const shimmerMat = new THREE.MeshBasicMaterial({
    color: 0xf3e27a,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.92, doorH * 0.92), shimmerMat);
  shimmer.position.set(pos.x, DOOR_H / 2, pos.z);
  shimmer.rotation.y = yaw;
  shimmer.visible = false;
  group.add(shimmer);

  const glitchMat = new THREE.MeshBasicMaterial({
    color: 0x9ad0ff,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glitch = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.86, doorH * 0.86), glitchMat);
  glitch.position.set(pos.x, DOOR_H / 2, pos.z);
  glitch.rotation.y = yaw;
  glitch.visible = false;
  group.add(glitch);

  const veilMat = new THREE.MeshBasicMaterial({
    color: opts.bait ? 0xf0e08a : opts.safer ? 0x0c1012 : 0xd47820,
    transparent: true,
    opacity: kind === "real" ? (opts.bait ? 0.28 : opts.safer ? 0.08 : 0.32) : 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.9, doorH * 0.9), veilMat);
  veil.position.set(pos.x, DOOR_H / 2, pos.z);
  veil.rotation.y = yaw;
  veil.visible = kind === "real";
  group.add(veil);

  if (kind === "fake" || kind === "false_exit") {
    const seal = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.96, doorH * 0.96),
      std({ color: 0xd6c24a, map: tiled(tex.wall, 0.7, 1.1), roughness: 0.92 }),
    );
    seal.position.set(pos.x, DOOR_H / 2, pos.z);
    seal.rotation.y = yaw;
    group.add(seal);
  }
  if (kind === "false_exit" || kind === "exit") {
    const sign = addBox(group, new THREE.MeshBasicMaterial({ color: kind === "exit" ? 0x6dff6a : 0x5a8f4a }), pos.x, 2.38, pos.z, 1.05, 0.2, 0.04);
    sign.rotation.y = yaw;
    const inset = wall === "n" ? -0.08 : wall === "s" ? 0.08 : 0;
    const insetX = wall === "e" ? -0.08 : wall === "w" ? 0.08 : 0;
    sign.position.x += insetX;
    sign.position.z += inset;
  }
  if (kind === "locked") {
    for (let i = -2; i <= 2; i += 1) {
      const bar = addBox(group, mats.bars, pos.x, DOOR_H / 2, pos.z, wall === "n" || wall === "s" ? 0.05 : 0.08, DOOR_H * 0.92, wall === "n" || wall === "s" ? 0.08 : 0.05);
      if (wall === "n" || wall === "s") bar.position.x += i * 0.22;
      else bar.position.z += i * 0.22;
    }
  }
  return { shimmer, glitch, veil, frames };
}

function addLight(
  group: THREE.Group,
  lights: RoomLight[],
  x: number,
  z: number,
  intensity: number,
  decision: RoomDecision,
  forceDead = false,
): void {
  const style = decision.lightingStyle ?? (decision.lighting === "dead" ? "almost_dark" : decision.lighting === "dim" ? "half_dead" : decision.lighting === "flickering" ? "flicker" : "steady_cool");
  const live = !forceDead && decision.lighting !== "dead" && style !== "almost_dark";
  const poolVibe = decision.roomArchetype === "poolcore" || decision.lightingMood === "humid_teal";
  const cool = style === "steady_cool" || poolVibe;
  const emissive = poolVibe ? 0xc8e8f2 : cool || decision.lightingMood === "cold_service" ? 0xdce8f4 : decision.lightingMood === "brownout" ? 0xe0b86a : 0xfff1b0;
  const barW = poolVibe ? 2.55 : 1.7;
  const barD = poolVibe ? 0.16 : 0.38;
  addBox(group, mats.metal, x, HEIGHT - 0.04, z, barW, 0.08, barD);
  const tubeMat = live
    ? new THREE.MeshStandardMaterial({
        color: poolVibe || cool ? 0xd4eef6 : 0xfff6d0,
        emissive,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.1,
      })
    : mats.lightDead;
  const tube = addBox(group, tubeMat, x, HEIGHT - 0.1, z, poolVibe ? 2.35 : 1.45, 0.035, poolVibe ? 0.1 : 0.16);
  if (live) {
    const light = new THREE.PointLight(emissive, intensity, 14, 1.45);
    light.position.set(x, HEIGHT - 0.32, z);
    group.add(light);
    lights.push({ light, base: intensity, phase: hashString(`${x}:${z}`) % 100, tube });
  }
}

function spawnLoot(
  group: THREE.Group,
  pickups: Pickup[],
  decision: RoomDecision,
  seed: string,
  x: number,
  z: number,
): void {
  if (decision.loot === "none") return;
  const id = `loot-${seed}`;
  if (decision.loot === "battery") {
    const mesh = addBox(group, mats.battery, x, 0.18, z, 0.22, 0.12, 0.12);
    pickups.push({ id, kind: "battery", mesh, taken: false });
  } else if (decision.loot === "keycard") {
    const mesh = addBox(group, mats.card, x, 0.92, z, 0.22, 0.02, 0.14);
    pickups.push({ id, kind: "keycard", mesh, taken: false });
  } else {
    const mesh = addBox(group, mats.paper, x, 0.12, z, 0.28, 0.02, 0.2);
    pickups.push({ id, kind: "note", note: notesFor(seed), mesh, taken: false });
  }
}

function decorate(
  group: THREE.Group,
  archetype: RoomArchetype,
  w: number,
  d: number,
  rng: () => number,
  decision: RoomDecision,
  pickups: Pickup[],
  seed: string,
  colliders: Aabb[],
  entryLocal: Wall,
  puddles: THREE.Mesh[],
): Aabb | null {
  const stain = (x: number, z: number, s: number) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(s, 14), mats.stain);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.018, z);
    group.add(mesh);
  };
  stain((rng() - 0.5) * w * 0.6, (rng() - 0.5) * d * 0.6, 0.7 + rng());
  stain((rng() - 0.5) * w * 0.5, (rng() - 0.5) * d * 0.5, 0.45);

  const motif = decision.layoutMotif;
  if (motif === "narrow_throat") {
    const inward = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: -1, z: 0 }, w: { x: 1, z: 0 } }[entryLocal];
    const side = { n: { x: 1, z: 0 }, s: { x: 1, z: 0 }, e: { x: 0, z: 1 }, w: { x: 0, z: 1 } }[entryLocal];
    for (const dir of [-1, 1]) {
      const x = inward.x * 1.35 + side.x * dir * 1.15;
      const z = inward.z * 1.35 + side.z * dir * 1.15;
      addBox(group, wallMaterial(archetype), x, 1.15, z, 0.18 + Math.abs(side.z) * 1.4, 2.3, 0.18 + Math.abs(side.x) * 1.4);
      colliders.push(aabbFromCenter(x, 1.15, z, 0.2 + Math.abs(side.z) * 0.7, 1.15, 0.2 + Math.abs(side.x) * 0.7));
    }
  }

  if (motif === "pillar_grid" || archetype === "flooded_lobby") {
    const cols = archetype === "flooded_lobby" ? 2 : 3;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        const x = -w * 0.28 + (i * w * 0.56) / Math.max(1, cols - 1);
        const z = -d * 0.28 + (j * d * 0.56) / Math.max(1, cols - 1);
        if (Math.hypot(x, z) < 1.4) continue;
        addBox(group, mats.wallDamp, x, 1.3, z, 0.42, 2.6, 0.42);
        colliders.push(aabbFromCenter(x, 1.3, z, 0.26, 1.3, 0.26));
      }
    }
  }

  const skipOffice = motif === "open_floor";
  if (archetype === "empty_office" && !skipOffice) {
    const desks =
      motif === "broken_symmetry"
        ? [[2.1, -1.4] as const]
        : ([
            [-3, -2],
            [2.4, 2.1],
            [-1.2, 3.2],
          ] as const);
    for (const pos of desks) {
      if (Math.abs(pos[0]) > w / 2 - 1.4 || Math.abs(pos[1]) > d / 2 - 1.4) continue;
      addBox(group, mats.desk, pos[0], 0.55, pos[1], 1.4, 0.08, 0.7);
      addBox(group, mats.dark, pos[0], 0.28, pos[1], 1.3, 0.46, 0.08);
      addBox(group, mats.dark, pos[0] + 0.7, 0.42, pos[1] + 0.7, 0.36, 0.42, 0.36);
      colliders.push(aabbFromCenter(pos[0], 0.55, pos[1], 0.7, 0.55, 0.36));
    }
    if (motif !== "broken_symmetry") addBox(group, mats.metal, w * 0.28, 0.7, -d * 0.3, 0.28, 1.1, 0.28);
    stain(w * 0.18, d * 0.22, 0.85);
    stain(-w * 0.24, -d * 0.16, 0.55);
    addBox(group, mats.dark, -w * 0.46, 1.4, 0, 0.02, 2.4, 0.02);
    addBox(group, mats.dark, w * 0.46, 1.4, d * 0.08, 0.02, 2.4, 0.02);
    addBox(group, mats.extinguisher, w / 2 - 0.18, 0.72, d * 0.18, 0.16, 0.72, 0.16);
    addBox(group, mats.paper, w / 2 - 0.2, 1.18, d * 0.18, 0.08, 0.1, 0.12);
    addBox(group, mats.dark, w / 2 - 0.21, 1.18, d * 0.18, 0.02, 0.04, 0.08);
  }

  if (archetype === "flooded_lobby" || decision.encounterCard === "flooded_slow_zone" || decision.hazard === "puddle_slip") {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.35, d - 0.35), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.06;
    group.add(water);
  }

  if (archetype === "flooded_lobby") {
    addBox(group, mats.desk, 0, 0.55, -d * 0.18, 3.2, 0.12, 1.1);
  }

  if (archetype === "maze_cubicles") {
    addBox(group, mats.extinguisher, w / 2 - 0.2, 0.7, -d * 0.28, 0.14, 0.68, 0.14);
    const cols = Math.max(3, Math.floor(w / 2.4));
    const rows = Math.max(3, Math.floor(d / 2.4));
    const cw = w / cols;
    const cd = d / rows;
    const keepClear = (x: number, z: number): boolean =>
      Math.abs(x) < 0.85 || Math.abs(z) < 0.85 || Math.hypot(x, z - d / 2) < 2.1 || Math.hypot(x, z + d / 2) < 2.1 || Math.hypot(x - w / 2, z) < 2.1 || Math.hypot(x + w / 2, z) < 2.1;
    for (let i = 1; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        if (rng() < 0.55) {
          const x = -w / 2 + i * cw;
          const z = -d / 2 + (j + 0.5) * cd;
          if (keepClear(x, z)) continue;
          addBox(group, mats.wallDamp, x, 0.7, z, 0.08, 1.4, cd * 0.72);
          colliders.push(aabbFromCenter(x, 0.7, z, 0.08, 0.7, (cd * 0.72) / 2));
        }
      }
    }
    for (let j = 1; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        if (rng() < 0.5) {
          const x = -w / 2 + (i + 0.5) * cw;
          const z = -d / 2 + j * cd;
          if (keepClear(x, z)) continue;
          addBox(group, mats.wallDamp, x, 0.7, z, cw * 0.72, 1.4, 0.08);
          colliders.push(aabbFromCenter(x, 0.7, z, (cw * 0.72) / 2, 0.7, 0.08));
        }
      }
    }
  }

  if (archetype === "stairwell") {
    addBox(group, mats.dark, 0, 0.02, 0, 2.2, 0.04, 2.2);
    for (let i = 0; i < 8; i += 1) {
      addBox(group, mats.wallConcrete, -1.4, 0.12 + i * 0.18, -1.2 + i * 0.22, 1.4, 0.16, 0.36);
    }
    addBox(group, mats.metal, -0.6, 1.0, 0.2, 0.06, 2.0, 2.4);
    addBox(group, mats.metal, 1.5, 1.0, 0, 0.06, 2.0, 3.2);
  }

  if (archetype === "dead_end") {
    addBox(group, mats.dark, 0.2, 0.45, 0.4, 0.42, 0.9, 0.42);
    addBox(group, mats.desk, 0.2, 0.7, 0.15, 0.5, 0.08, 0.5);
    stain(0, 0.8, 1.3);
  }

  if (archetype === "long_hall") {
    for (let z = -d / 2 + 3; z < d / 2 - 2; z += 4.2) {
      addBox(group, mats.wallDamp, w / 2 - 0.08, 1.4, z, 0.04, 2.6, 0.04);
    }
  }

  if (archetype === "exit_foyer") {
    addBox(group, mats.metal, 0, 1.15, d / 2 - 0.28, 1.5, 2.2, 0.12);
  }

  const variant = decision.poolcoreVariant ?? "none";
  const poolish = archetype === "poolcore" || variant !== "none";
  if (poolish) {
    const addPuddle = (x: number, z: number, sx: number, sz: number, y = 0.025) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mats.puddle.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      group.add(mesh);
      puddles.push(mesh);
    };
    const stainCorner = (x: number, z: number) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.7 + rng() * 0.5, 12),
        std({ color: 0x6a5a28, transparent: true, opacity: 0.32, roughness: 0.95 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.02, z);
      group.add(mesh);
    };
    stainCorner(-w * 0.42, -d * 0.42);
    stainCorner(w * 0.4, d * 0.38);
    stainCorner(-w * 0.36, d * 0.4);

    if (variant === "locker_room") {
      for (let i = -2; i <= 2; i += 1) {
        addBox(group, mats.locker, -w * 0.38, 1.0, i * 1.15, 0.32, 2.0, 0.9);
        colliders.push(aabbFromCenter(-w * 0.38, 1.0, i * 1.15, 0.2, 1.0, 0.42));
      }
      addBox(group, mats.tile, w * 0.12, 0.28, 0, 2.6, 0.2, 0.42);
      addPuddle(0.4, -0.6, 2.4, 1.1);
      addPuddle(-0.8, 1.4, 1.6, 0.9);
    } else if (variant === "flooded_utility") {
      addBox(group, mats.metal, -w * 0.28, 1.1, -d * 0.18, 0.22, 2.2, 0.22);
      addBox(group, mats.metal, w * 0.22, 0.7, d * 0.16, 1.4, 0.16, 0.16);
      addBox(group, mats.metal, w * 0.22, 1.4, d * 0.16, 0.16, 1.4, 0.16);
      colliders.push(aabbFromCenter(-w * 0.28, 1.1, -d * 0.18, 0.16, 1.1, 0.16));
      const flood = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), mats.pool);
      flood.rotation.x = -Math.PI / 2;
      flood.position.y = 0.08;
      group.add(flood);
      puddles.push(flood);
    } else if (variant === "shallow_puddle_hall" || (archetype === "poolcore" && variant === "none")) {
      addPuddle(-w * 0.18, -d * 0.12, 3.4, 1.6);
      addPuddle(w * 0.22, d * 0.2, 2.2, 1.3);
      addPuddle(0, -d * 0.28, 1.6, 2.4);
    } else {
      const basinW = Math.min(w * 0.52, 8.2);
      const basinD = Math.min(d * 0.48, 9.4);
      addBox(group, mats.tile, 0, 0.22, 0, basinW + 0.55, 0.44, basinD + 0.55);
      addBox(group, mats.dark, 0, -0.15, 0, basinW, 0.2, basinD);
      const filled = variant !== "empty_pool_hall" && (decision.encounterCard === "flooded_slow_zone" || rng() < 0.35);
      if (filled) {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(basinW - 0.25, basinD - 0.25), mats.pool);
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.16;
        group.add(pool);
        puddles.push(pool);
      } else {
        addBox(group, mats.dark, 0, 0.02, 0, 0.55, 0.04, 0.55);
        addBox(group, mats.metal, 0, 0.03, 0, 0.42, 0.02, 0.42);
        const crack = new THREE.Mesh(
          new THREE.PlaneGeometry(basinW * 0.7, 0.06),
          std({ color: 0x1a2020, roughness: 1 }),
        );
        crack.rotation.x = -Math.PI / 2;
        crack.rotation.z = 0.4;
        crack.position.y = 0.03;
        group.add(crack);
      }
      for (const side of [-1, 1]) {
        addBox(group, mats.metal, side * (basinW / 2 - 0.15), 0.85, -basinD / 2 + 0.2, 0.06, 1.5, 0.06);
        addBox(group, mats.metal, side * (basinW / 2 - 0.15), 0.18, -basinD / 2 + 0.55, 0.08, 0.08, 0.7);
      }
    }
    if (archetype === "poolcore" && variant !== "locker_room") {
      const colX = w * 0.3;
      const colZ = d * 0.26;
      addBox(group, mats.tile, -colX, 1.2, -colZ, 0.42, 2.4, 0.42);
      addBox(group, mats.tile, colX, 1.2, -colZ, 0.42, 2.4, 0.42);
      addBox(group, mats.tile, -colX, 1.2, colZ, 0.42, 2.4, 0.42);
      addBox(group, mats.tile, colX, 1.2, colZ, 0.42, 2.4, 0.42);
      colliders.push(aabbFromCenter(-colX, 1.2, -colZ, 0.24, 1.2, 0.24));
      colliders.push(aabbFromCenter(colX, 1.2, -colZ, 0.24, 1.2, 0.24));
      colliders.push(aabbFromCenter(-colX, 1.2, colZ, 0.24, 1.2, 0.24));
      colliders.push(aabbFromCenter(colX, 1.2, colZ, 0.24, 1.2, 0.24));
    }
    addBox(group, mats.rust, w * 0.36, 0.04, d * 0.36, 0.55, 0.04, 0.55);
    addBox(group, mats.dark, w * 0.36, 0.055, d * 0.36, 0.38, 0.02, 0.38);
    const bubble = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 8),
      new THREE.MeshBasicMaterial({ color: 0xa8d8d0, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    bubble.rotation.x = -Math.PI / 2;
    bubble.position.set(w * 0.36, 0.09, d * 0.36);
    group.add(bubble);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 8, 18), mats.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-w * 0.38, 1.12, -d * 0.4);
    group.add(ring);
    addBox(group, mats.ring, -w * 0.38, 1.12, -d * 0.4, 0.08, 0.08, 0.08);
    const inward = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: -1, z: 0 }, w: { x: 1, z: 0 } }[entryLocal];
    for (let i = 0; i < 5; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.28),
        std({ color: 0x4a5550, transparent: true, opacity: 0.22 - i * 0.03, roughness: 0.35 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(inward.x * (0.6 + i * 0.42) + (i % 2) * 0.16, 0.021, inward.z * (0.6 + i * 0.42));
      group.add(mesh);
    }
    const drops = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, d * 0.8),
      new THREE.MeshBasicMaterial({
        map: tex.poolCeiling,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    drops.rotation.x = Math.PI / 2;
    drops.position.y = HEIGHT - 0.02;
    group.add(drops);
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, d * 0.92),
      new THREE.MeshBasicMaterial({
        color: 0xd8eeea,
        transparent: true,
        opacity: decision.humidity === "heavy" ? 0.08 : 0.05,
        depthWrite: false,
      }),
    );
    haze.rotation.x = -Math.PI / 2;
    haze.position.set(0, 0.22, 0);
    group.add(haze);
  }

  if (archetype === "hotel_hall") {
    for (let z = -d / 2 + 2.4; z < d / 2 - 2; z += 3.2) {
      addBox(group, mats.frame, w / 2 - 0.12, 1.7, z, 0.04, 0.22, 0.42);
      addBox(group, mats.paper, w / 2 - 0.14, 1.7, z, 0.01, 0.16, 0.28);
    }
    addBox(group, mats.desk, 0, 0.45, 0, 0.7, 0.9, 0.7);
    addBox(group, mats.extinguisher, w / 2 - 0.16, 0.7, -d * 0.12, 0.14, 0.68, 0.14);
    stain(0.4, d * 0.2, 0.7);
  }

  if (archetype === "parking_ramp") {
    for (let z = -d / 2 + 2; z < d / 2 - 1; z += 2.4) {
      addBox(group, mats.paint, -w * 0.18, 0.02, z, 0.16, 0.02, 1.1);
      addBox(group, mats.paint, w * 0.18, 0.02, z, 0.16, 0.02, 1.1);
    }
    addBox(group, mats.wallConcrete, 0, 1.2, 0, 0.7, 2.4, 0.7);
    colliders.push(aabbFromCenter(0, 1.2, 0, 0.4, 1.2, 0.4));
  }

  if (archetype === "machine_room") {
    addBox(group, mats.metal, -w * 0.22, 0.85, -d * 0.1, 1.8, 1.7, 1.1);
    addBox(group, mats.metal, w * 0.24, 0.55, d * 0.16, 1.1, 1.1, 1.1);
    addBox(group, mats.metal, 0.2, 1.6, 0, 2.4, 0.12, 0.12);
    colliders.push(aabbFromCenter(-w * 0.22, 0.85, -d * 0.1, 0.95, 0.85, 0.55));
    colliders.push(aabbFromCenter(w * 0.24, 0.55, d * 0.16, 0.55, 0.55, 0.55));
  }

  if (archetype === "empty_classroom") {
    addBox(group, mats.chalk, 0, 1.45, -d / 2 + 0.12, 3.6, 1.3, 0.06);
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        const x = i * 2.2;
        const z = j * 1.8 + 0.4;
        addBox(group, mats.desk, x, 0.42, z, 1.1, 0.08, 0.55);
        addBox(group, mats.dark, x, 0.22, z, 0.08, 0.4, 0.08);
        colliders.push(aabbFromCenter(x, 0.42, z, 0.55, 0.42, 0.28));
      }
    }
  }

  if (archetype === "unfinished") {
    for (const side of [-1, 1]) {
      addBox(group, mats.wallConcrete, side * w * 0.22, 1.1, -d * 0.12, 0.08, 2.2, 1.8);
      addBox(group, mats.plastic, side * w * 0.18, 1.2, d * 0.16, 1.6, 2.2, 0.04);
    }
    addBox(group, mats.desk, w * 0.28, 0.35, d * 0.22, 0.7, 0.5, 0.5);
  }

  const crumb = decision.narrativeCrumb ?? "none";
  if (crumb === "wrong_door_number" || decision.clueBeat === "wrong_door_number") {
    const plate = addBox(group, mats.paper, w * 0.2, 1.7, -d / 2 + 0.12, 0.42, 0.22, 0.02);
    addBox(group, mats.dark, plate.position.x, 1.7, plate.position.z + 0.01, 0.28, 0.1, 0.01);
  }
  if (crumb === "wet_footprints" || decision.clueBeat === "wet_footprints") {
    for (let i = 0; i < 6; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.32),
        std({ color: 0x3a4a40, transparent: true, opacity: 0.28 - i * 0.03, roughness: 0.3 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(-0.2 + (i % 2) * 0.22, 0.02, -d * 0.2 + i * 0.38);
      group.add(mesh);
    }
  }
  if (crumb === "unfinished_notice" || decision.clueBeat === "unfinished_notice") {
    addBox(group, mats.paper, -w * 0.18, 1.55, -d / 2 + 0.11, 0.7, 0.5, 0.02);
  }

  if (decision.clueBeat === "graffiti") {
    const text = graffitiFor(seed);
    const gtex = makeGraffitiTexture(text);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.1),
      new THREE.MeshStandardMaterial({ map: gtex, transparent: true, roughness: 0.95, metalness: 0 }),
    );
    plane.position.set(-w * 0.28, 1.55, -d / 2 + 0.12);
    group.add(plane);
  }

  if (decision.clueBeat === "radio_static") {
    addBox(group, mats.dark, w * 0.22, 0.28, d * 0.18, 0.34, 0.22, 0.22);
    addBox(group, mats.metal, w * 0.22, 0.48, d * 0.18, 0.16, 0.2, 0.12);
  }

  let alcoveLocal: Aabb | null = null;
  if (decision.encounterCard === "safe_alcove") {
    const ax = -w * 0.32;
    const az = d * 0.28;
    addBox(group, mats.alcove, ax, 1.1, az, 2.1, 2.2, 1.6);
    addBox(group, mats.desk, ax, 0.35, az, 0.7, 0.7, 0.7);
    const warm = new THREE.PointLight(0xffd9a0, 2.2, 4.5, 2);
    warm.position.set(ax, 1.4, az);
    group.add(warm);
    alcoveLocal = aabbFromCenter(ax, 1, az, 0.85, 1, 0.7);
  }

  const lootX = (rng() - 0.5) * (w * 0.4);
  const lootZ = (rng() - 0.5) * (d * 0.35);
  spawnLoot(group, pickups, decision, seed, lootX, lootZ);
  return alcoveLocal;
}

export function buildRoom(options: {
  id: string;
  decision: RoomDecision;
  cx: number;
  cz: number;
  yawTurns: number;
  entryWorldWall: Wall;
}): BuiltRoom {
  const { id, decision, cx, cz, yawTurns } = options;
  const archetype = decision.roomArchetype;
  const { w, d } = sizeOf(archetype, decision.size);
  const yaw = yawFromTurns(yawTurns);
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.rotation.y = yaw;

  const wet =
    archetype === "flooded_lobby" ||
    archetype === "poolcore" ||
    decision.hazard === "puddle_slip" ||
    decision.hazard === "environmental" ||
    decision.encounterCard === "flooded_slow_zone" ||
    (decision.poolcoreVariant ?? "none") !== "none";
  const floorMat =
    archetype === "poolcore" || (decision.poolcoreVariant ?? "none") !== "none"
      ? mats.tileFloor.clone()
      : wet
        ? mats.carpetWet.clone()
        : archetype === "parking_ramp" || archetype === "machine_room"
          ? mats.wallConcrete.clone()
          : mats.carpet.clone();
  const floorRepX = archetype === "poolcore" || (decision.poolcoreVariant ?? "none") !== "none" ? tileRepeat(w) : w / 3.2;
  const floorRepZ = archetype === "poolcore" || (decision.poolcoreVariant ?? "none") !== "none" ? tileRepeat(d) : d / 3.2;
  if (floorMat.map) floorMat.map = tiled(floorMat.map, floorRepX, floorRepZ);
  if (floorMat.roughnessMap) floorMat.roughnessMap = tiled(floorMat.roughnessMap, floorRepX, floorRepZ);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const ceilingMat =
    archetype === "poolcore" ? std({ color: 0xc6d4d2, map: tex.poolCeiling, roughness: 0.55 }) : mats.ceiling;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HEIGHT;
  group.add(ceiling);

  const entryLocal = rotateWall(options.entryWorldWall, -yawTurns);
  const planned = planDoors(entryLocal, decision);
  const openingWalls = new Set<Wall>([...planned.real, ...planned.fake]);

  const collidersLocal: Aabb[] = [];
  const lights: RoomLight[] = [];
  const pickups: Pickup[] = [];
  const doors: Door[] = [];
  const puddles: THREE.Mesh[] = [];
  const sideWalls = new Set<Wall>([
    rotateWall(entryLocal, 1),
    rotateWall(entryLocal, -1),
  ]);

  for (const wall of ["n", "s", "e", "w"] as const) {
    const hasOpening = openingWalls.has(wall);
    const bait = planned.bait === wall;
    const safer = planned.safer === wall && !bait;
    const along =
      hasOpening && sideWalls.has(wall) && !bait ? (wall === "n" || wall === "s" ? w : d) * 0.2 : 0;
    for (const seg of wallSegments(wall, w, d, hasOpening, along)) {
      const wmat = wallMaterial(archetype).clone();
      if (wmat.map) {
        const along = Math.max(seg.sx, seg.sz);
        wmat.map =
          archetype === "poolcore"
            ? tiled(wmat.map, tileRepeat(along), tileRepeat(HEIGHT))
            : tiled(wmat.map, along / 2.2, HEIGHT / 2.4);
      }
      addBox(group, wmat, seg.x, HEIGHT / 2, seg.z, seg.sx, HEIGHT, seg.sz);
      collidersLocal.push(aabbFromCenter(seg.x, HEIGHT / 2, seg.z, seg.sx / 2, HEIGHT / 2, seg.sz / 2));
    }
    const mid = wall === "n" || wall === "s" ? { x: 0, z: wall === "n" ? d / 2 : -d / 2 } : { x: wall === "e" ? w / 2 : -w / 2, z: 0 };
    addBox(
      group,
      archetype === "poolcore" ? mats.kick : mats.trim,
      mid.x,
      0.08,
      mid.z,
      wall === "n" || wall === "s" ? w : 0.08,
      0.16,
      wall === "n" || wall === "s" ? 0.08 : d,
    );

    if (hasOpening) {
      const pos = localDoorPos(wall, w, d, along);
      const isEntry = wall === entryLocal;
      const isExit = archetype === "exit_foyer" && wall === opposite(entryLocal);
      const fake = planned.fake.includes(wall);
      const falseExit = fake && decision.clueBeat === "false_exit";
      const low = !isEntry && sideWalls.has(wall) && !bait;
      const lockThis =
        !isEntry &&
        !fake &&
        !isExit &&
        decision.encounterCard === "locked_gate_needs_key" &&
        planned.real.filter((item) => item !== entryLocal)[0] === wall;
      const visuals = makeDoorVisuals(
        group,
        wall,
        pos,
        isExit ? "exit" : lockThis ? "locked" : falseExit ? "false_exit" : fake ? "fake" : "real",
        { bait, safer, low },
      );
      if (fake || lockThis) {
        const out = wallNormal(wall);
        collidersLocal.push(
          aabbFromCenter(pos.x + out.x * 0.22, 1.1, pos.z + out.z * 0.22, 0.55, 1.1, 0.55),
        );
      }
      if (bait && !fake && !isEntry) {
        const glow = new THREE.PointLight(0xf0e8a0, 3.4, 4.2, 1.8);
        glow.position.set(pos.x, 1.7, pos.z);
        group.add(glow);
      }
      doors.push({
        id: `${id}-${wall}`,
        wall,
        worldWall: rotateWall(wall, yawTurns),
        localX: pos.x,
        localZ: pos.z,
        width: DOOR_W,
        isExit,
        isFalseExit: falseExit || (!fake && decision.clueBeat === "false_exit" && wall === opposite(entryLocal) && archetype !== "exit_foyer"),
        fake,
        locked: lockThis,
        baitVisible: bait,
        saferDim: safer,
        low,
        connectedRoomId: null,
        generation: initialDoorGeneration(isEntry, id),
        pendingSince: 0,
        decision: null,
        shimmer: visuals.shimmer,
        glitch: visuals.glitch,
        veil: visuals.veil,
        frames: visuals.frames,
      });
    }
  }

  if (decision.clueBeat === "false_exit" && !doors.some((door) => door.isFalseExit || door.fake)) {
    const wall = opposite(entryLocal);
    const pos = localDoorPos(wall, w, d);
    makeDoorVisuals(group, wall, pos, "false_exit");
  }

  const style = decision.lightingStyle;
  const dimMul =
    style === "steady_cool" || decision.lighting === "harsh"
      ? 1.12
      : style === "half_dead" || decision.lighting === "dim"
        ? 0.42
        : style === "almost_dark" || decision.lighting === "dead"
          ? 0.0
          : 0.82;
  const placeTube = (x: number, z: number, intensity: number, index: number) => {
    const deadSection =
      (style === "half_dead" && index % 2 === 1) || (archetype === "poolcore" && index === 2);
    addLight(group, lights, x, z, intensity * Math.max(dimMul, deadSection ? 0 : 0.05), decision, deadSection);
  };
  if (archetype === "long_hall" || archetype === "hotel_hall" || archetype === "parking_ramp") {
    let i = 0;
    for (let z = -d / 2 + 2; z < d / 2; z += 3.4) {
      placeTube(0, z, 17, i);
      i += 1;
    }
  } else if (archetype === "dead_end") {
    placeTube(0, 0, 12, 0);
  } else if (archetype === "poolcore") {
    placeTube(-w * 0.28, -d * 0.28, 17, 0);
    placeTube(w * 0.26, d * 0.22, 16, 1);
    placeTube(0, 0, 14, 2);
    placeTube(w * 0.2, -d * 0.3, 13, 3);
  } else {
    placeTube(-w * 0.22, -d * 0.2, 16, 0);
    placeTube(w * 0.2, d * 0.18, 15, 1);
    if (w > 10) placeTube(0, 0, 13, 2);
  }
  if (style === "almost_dark") {
    const far = doors.find((door) => door.baitVisible) ?? doors.find((door) => !door.fake && door.wall !== entryLocal);
    if (far) {
      const glow = new THREE.PointLight(0xd8fff0, 2.6, 5.5, 1.8);
      glow.position.set(far.localX, 1.6, far.localZ);
      group.add(glow);
    }
  }

  let guideLight: THREE.PointLight | null = null;
  let guideBase = 0;
  if (id === "start") {
    // Stronger warm pool toward the south door the wanderer already faces.
    const gz = -d / 2 + 2.35;
    addLight(group, lights, 0, gz, 22 * Math.max(dimMul, 0.05), decision);
    guideLight = new THREE.PointLight(0xffe08a, 6.4, 7.2, 1.85);
    guideLight.position.set(0, 1.55, gz);
    group.add(guideLight);
    guideBase = 6.4;
  }

  const rng = mulberry32(hashString(id));
  const alcoveLocal = decorate(group, archetype, w, d, rng, decision, pickups, id, collidersLocal, entryLocal, puddles);

  let darkPatch: Aabb | null = null;
  if (decision.hazard === "dark_patch") {
    darkPatch = transformAabb(aabbFromCenter(w * 0.15, 1, d * 0.1, 1.8, 1, 1.8), cx, cz, yaw);
  }

  const colliders = collidersLocal.map((box) => transformAabb(box, cx, cz, yaw));
  const alcove = alcoveLocal ? transformAabb(alcoveLocal, cx, cz, yaw) : null;
  return {
    id,
    archetype,
    decision,
    group,
    colliders,
    bounds: roomWorldBounds(cx, cz, w, d, yaw),
    doors,
    pickups,
    lights,
    water: wet,
    darkPatch,
    alcove,
    cx,
    cz,
    yaw,
    width: w,
    depth: d,
    entryWall: entryLocal,
    powerFlicker: decision.encounterCard === "power_flicker_event" ? 1.7 : 0,
    surface: archetype === "stairwell" || archetype === "parking_ramp" || archetype === "machine_room" ? "concrete" : wet ? "wet" : "carpet",
    guideLight,
    guideBase,
    puddles,
  };
}

export function doorWorldPos(room: BuiltRoom, door: Door): { x: number; z: number } {
  const rotated = rotateY(door.localX, door.localZ, room.yaw);
  return { x: room.cx + rotated.x, z: room.cz + rotated.z };
}

export function doorOutward(room: BuiltRoom, door: Door): { x: number; z: number } {
  const local = wallNormal(door.wall);
  return rotateY(local.x, local.z, room.yaw);
}

export function resolveCutoffDoor(room: BuiltRoom, cutoff: RoomDecision["cutoffDoor"] | undefined): Door | null {
  if (!cutoff || cutoff === "none") return null;
  const entry = room.doors.find((door) => door.wall === room.entryWall);
  if (cutoff === "entry") return entry ?? null;
  const left = room.doors.find((door) => door.wall === rotateWall(room.entryWall, 1) && !door.fake);
  const right = room.doors.find((door) => door.wall === rotateWall(room.entryWall, -1) && !door.fake);
  const far = room.doors.find((door) => door.wall === opposite(room.entryWall) && !door.fake);
  if (cutoff === "left") return left ?? far ?? null;
  if (cutoff === "right") return right ?? far ?? null;
  return far ?? left ?? right ?? null;
}

export function placeAgainstDoor(
  parent: BuiltRoom,
  parentDoor: Door,
  decision: RoomDecision,
  extraGap = 0,
): { cx: number; cz: number; yawTurns: number; entryWorldWall: Wall } {
  const out = doorOutward(parent, parentDoor);
  const neededEntryWorld = opposite(parentDoor.worldWall);
  const preferredLocal = "s";
  const yawTurns = turnsToAlign(preferredLocal, neededEntryWorld);
  const { d } = sizeOf(decision.roomArchetype, decision.size);
  const half = d / 2;
  const parentPos = doorWorldPos(parent, parentDoor);
  const gap = extraGap + 0.02;
  return {
    cx: parentPos.x + out.x * (half + gap),
    cz: parentPos.z + out.z * (half + gap),
    yawTurns,
    entryWorldWall: neededEntryWorld,
  };
}

export function startRoomDecision(): RoomDecision {
  return {
    roomArchetype: "empty_office",
    size: "standard",
    lighting: "flickering",
    lightingMood: "sick_yellow",
    lightingStyle: "flicker",
    poolcoreVariant: "none",
    humidity: "dry",
    soundBed: "hvac_hum",
    narrativeCrumb: "none",
    exitLayout: "cross",
    familiarReturn: false,
    hazard: "none",
    loot: "battery",
    entityPresent: false,
    entityPresentNoul: 0.05,
    entityBehavior: "absent",
    ambience: "hum",
    fearIntensity: 0.45,
    layoutMotif: "offset_desks",
    exitCount: "three",
    exitOrientation: "split",
    deadEndBait: false,
    deadEndBaitNoul: 0.05,
    clueBeat: "none",
    advancesExit: false,
    advancesExitNoul: 0.08,
    encounterCard: "none",
    cutoffDoor: "none",
    soundBait: false,
    soundBaitNoul: 0.04,
    entityAggression: 0.2,
    entityPressure: 0.25,
    tunnelLength: "short",
    tunnelMood: "yellow_throat",
  };
}
