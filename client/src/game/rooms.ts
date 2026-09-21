import * as THREE from "three";
import { hashString, mulberry32, notesFor, type RoomArchetype, type RoomDecision } from "@liminal/shared";
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
  connectedRoomId: string | null;
  generation: "idle" | "pending" | "ready";
  pendingSince: number;
  decision: RoomDecision | null;
  shimmer: THREE.Mesh;
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
  lights: Array<{ light: THREE.PointLight; base: number; phase: number }>;
  water: boolean;
  darkPatch: Aabb | null;
  cx: number;
  cz: number;
  yaw: number;
  width: number;
  depth: number;
};

const DOOR_W = 1.45;
const DOOR_H = 2.15;
const WALL_T = 0.2;
const HEIGHT = 2.85;

const mats = {
  wall: new THREE.MeshLambertMaterial({ color: 0xe8d44d }),
  wallDamp: new THREE.MeshLambertMaterial({ color: 0xcfc24a }),
  wallExit: new THREE.MeshLambertMaterial({ color: 0xc5d36a }),
  wallConcrete: new THREE.MeshLambertMaterial({ color: 0xb7ae88 }),
  carpet: new THREE.MeshLambertMaterial({ color: 0x6e5426 }),
  carpetWet: new THREE.MeshLambertMaterial({ color: 0x3f4a32 }),
  ceiling: new THREE.MeshLambertMaterial({ color: 0xc9c3a6 }),
  frame: new THREE.MeshLambertMaterial({ color: 0x5a4318 }),
  desk: new THREE.MeshLambertMaterial({ color: 0x8a7340 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2a2416 }),
  water: new THREE.MeshLambertMaterial({ color: 0x2d4036, transparent: true, opacity: 0.42 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x4a5348 }),
  card: new THREE.MeshLambertMaterial({ color: 0xc23b2e }),
  battery: new THREE.MeshLambertMaterial({ color: 0xf2e27a }),
  paper: new THREE.MeshLambertMaterial({ color: 0xefe6c4 }),
  stain: new THREE.MeshLambertMaterial({ color: 0x4a3a18, transparent: true, opacity: 0.35 }),
  shimmer: new THREE.MeshBasicMaterial({
    color: 0xe8d44d,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  }),
  lightTube: new THREE.MeshBasicMaterial({ color: 0xfff3c0 }),
  exitGlow: new THREE.MeshBasicMaterial({ color: 0x6dff6a }),
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
  };
  const raw = base[archetype];
  const mul = size === "cramped" ? 0.78 : size === "vast" ? 1.28 : 1;
  if (archetype === "long_hall") return { w: raw.w, d: raw.d * (size === "vast" ? 1.15 : 1) };
  if (archetype === "dead_end" || archetype === "stairwell") return { w: raw.w * Math.min(mul, 1.05), d: raw.d * Math.min(mul, 1.05) };
  return { w: raw.w * mul, d: raw.d * mul };
}

function wallMaterial(archetype: RoomArchetype): THREE.MeshLambertMaterial {
  if (archetype === "exit_foyer") return mats.wallExit;
  if (archetype === "stairwell") return mats.wallConcrete;
  if (archetype === "flooded_lobby") return mats.wallDamp;
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

function doorSlots(archetype: RoomArchetype): Wall[] {
  if (archetype === "dead_end") return ["s"];
  if (archetype === "long_hall") return ["n", "s", "e"];
  if (archetype === "stairwell") return ["n", "s"];
  if (archetype === "exit_foyer") return ["s", "n"];
  if (archetype === "maze_cubicles" || archetype === "flooded_lobby") return ["n", "s", "e", "w"];
  return ["n", "e", "w"];
}

export function turnsToAlign(entryLocal: Wall, neededWorldOut: Wall): number {
  for (let turns = 0; turns < 4; turns += 1) {
    if (rotateWall(entryLocal, turns) === neededWorldOut) return turns;
  }
  return 0;
}

export function localDoorPos(wall: Wall, w: number, d: number): { x: number; z: number } {
  if (wall === "n") return { x: 0, z: d / 2 };
  if (wall === "s") return { x: 0, z: -d / 2 };
  if (wall === "e") return { x: w / 2, z: 0 };
  return { x: -w / 2, z: 0 };
}

function wallSegments(wall: Wall, w: number, d: number, doorOnWall: boolean): Array<{ x: number; z: number; sx: number; sz: number }> {
  const halfW = w / 2;
  const halfD = d / 2;
  if (wall === "n" || wall === "s") {
    const z = wall === "n" ? halfD : -halfD;
    if (!doorOnWall) return [{ x: 0, z, sx: w + WALL_T, sz: WALL_T }];
    const side = (w - DOOR_W) / 2;
    return [
      { x: -(DOOR_W / 2 + side / 2), z, sx: side, sz: WALL_T },
      { x: DOOR_W / 2 + side / 2, z, sx: side, sz: WALL_T },
    ];
  }
  const x = wall === "e" ? halfW : -halfW;
  if (!doorOnWall) return [{ x, z: 0, sx: WALL_T, sz: d + WALL_T }];
  const side = (d - DOOR_W) / 2;
  return [
    { x, z: -(DOOR_W / 2 + side / 2), sx: WALL_T, sz: side },
    { x, z: DOOR_W / 2 + side / 2, sx: WALL_T, sz: side },
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

function addLight(
  group: THREE.Group,
  lights: BuiltRoom["lights"],
  x: number,
  z: number,
  intensity: number,
  decision: RoomDecision,
): void {
  const fixture = addBox(group, mats.lightTube, x, HEIGHT - 0.08, z, 1.4, 0.05, 0.22);
  if (decision.lighting === "dead") fixture.material = new THREE.MeshLambertMaterial({ color: 0x6a6558 });
  const light = new THREE.PointLight(0xfff1b0, intensity, 11, 1.6);
  light.position.set(x, HEIGHT - 0.28, z);
  group.add(light);
  lights.push({ light, base: intensity, phase: hashString(`${x}:${z}`) % 100 });
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
): void {
  const stain = (x: number, z: number, s: number) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(s, 10), mats.stain);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    group.add(mesh);
  };
  stain((rng() - 0.5) * w * 0.6, (rng() - 0.5) * d * 0.6, 0.6 + rng());
  stain((rng() - 0.5) * w * 0.5, (rng() - 0.5) * d * 0.5, 0.4);

  if (archetype === "empty_office") {
    for (const pos of [
      [-3, -2],
      [2.4, 2.1],
      [-1.2, 3.2],
    ] as const) {
      if (Math.abs(pos[0]) > w / 2 - 1.4 || Math.abs(pos[1]) > d / 2 - 1.4) continue;
      addBox(group, mats.desk, pos[0], 0.55, pos[1], 1.4, 0.08, 0.7);
      addBox(group, mats.dark, pos[0], 0.28, pos[1], 1.3, 0.46, 0.08);
      addBox(group, mats.dark, pos[0] + 0.7, 0.42, pos[1] + 0.7, 0.36, 0.42, 0.36);
      colliders.push(aabbFromCenter(pos[0], 0.55, pos[1], 0.7, 0.55, 0.36));
    }
    addBox(group, mats.metal, w * 0.28, 0.7, -d * 0.3, 0.28, 1.1, 0.28);
  }

  if (archetype === "flooded_lobby") {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.07;
    group.add(water);
    for (const pos of [
      [-w * 0.22, -d * 0.22],
      [w * 0.22, -d * 0.22],
      [-w * 0.22, d * 0.22],
      [w * 0.22, d * 0.22],
    ] as const) {
      addBox(group, mats.wallDamp, pos[0], 1.3, pos[1], 0.55, 2.6, 0.55);
      colliders.push(aabbFromCenter(pos[0], 1.3, pos[1], 0.32, 1.3, 0.32));
    }
    addBox(group, mats.desk, 0, 0.55, -d * 0.18, 3.2, 0.12, 1.1);
  }

  if (archetype === "maze_cubicles") {
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
    const sign = addBox(group, mats.exitGlow, 0, 2.35, d / 2 - 0.36, 1.1, 0.22, 0.04);
    sign.userData.exitSign = true;
  }

  const lootX = (rng() - 0.5) * (w * 0.4);
  const lootZ = (rng() - 0.5) * (d * 0.35);
  spawnLoot(group, pickups, decision, seed, lootX, lootZ);
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

  const floorMat = archetype === "flooded_lobby" ? mats.carpetWet : mats.carpet;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HEIGHT;
  group.add(ceiling);

  const wallSet = new Set(doorSlots(archetype));
  const entryLocal = rotateWall(options.entryWorldWall, -yawTurns);
  wallSet.add(entryLocal);

  const collidersLocal: Aabb[] = [];
  const lights: BuiltRoom["lights"] = [];
  const pickups: Pickup[] = [];
  const doors: Door[] = [];

  for (const wall of ["n", "s", "e", "w"] as const) {
    const hasDoor = wallSet.has(wall);
    for (const seg of wallSegments(wall, w, d, hasDoor)) {
      addBox(group, wallMaterial(archetype), seg.x, HEIGHT / 2, seg.z, seg.sx, HEIGHT, seg.sz);
      collidersLocal.push(aabbFromCenter(seg.x, HEIGHT / 2, seg.z, seg.sx / 2, HEIGHT / 2, seg.sz / 2));
    }
    if (hasDoor) {
      const pos = localDoorPos(wall, w, d);
      addBox(
        group,
        mats.frame,
        wall === "e" || wall === "w" ? pos.x : pos.x - (DOOR_W / 2 + 0.06),
        DOOR_H / 2,
        wall === "n" || wall === "s" ? pos.z : pos.z - (DOOR_W / 2 + 0.06),
        wall === "n" || wall === "s" ? 0.1 : 0.22,
        DOOR_H,
        wall === "n" || wall === "s" ? 0.22 : 0.1,
      );
      addBox(
        group,
        mats.frame,
        wall === "e" || wall === "w" ? pos.x : pos.x + (DOOR_W / 2 + 0.06),
        DOOR_H / 2,
        wall === "n" || wall === "s" ? pos.z : pos.z + (DOOR_W / 2 + 0.06),
        wall === "n" || wall === "s" ? 0.1 : 0.22,
        DOOR_H,
        wall === "n" || wall === "s" ? 0.22 : 0.1,
      );
      const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 0.92, DOOR_H * 0.92), mats.shimmer.clone());
      shimmer.position.set(pos.x, DOOR_H / 2, pos.z);
      if (wall === "e") shimmer.rotation.y = -Math.PI / 2;
      if (wall === "w") shimmer.rotation.y = Math.PI / 2;
      if (wall === "s") shimmer.rotation.y = Math.PI;
      shimmer.visible = false;
      group.add(shimmer);
      doors.push({
        id: `${id}-${wall}`,
        wall,
        worldWall: rotateWall(wall, yawTurns),
        localX: pos.x,
        localZ: pos.z,
        width: DOOR_W,
        isExit: archetype === "exit_foyer" && wall === "n",
        connectedRoomId: null,
        generation: "idle",
        pendingSince: 0,
        decision: null,
        shimmer,
      });
    }
  }

  const dimMul =
    decision.lighting === "harsh" ? 1.15 : decision.lighting === "dim" ? 0.38 : decision.lighting === "dead" ? 0.08 : 0.7;
  if (archetype === "long_hall") {
    for (let z = -d / 2 + 2; z < d / 2; z += 3.6) addLight(group, lights, 0, z, 1.6 * dimMul, decision);
  } else if (archetype === "dead_end") {
    addLight(group, lights, 0, 0, 1.1 * dimMul, decision);
  } else {
    addLight(group, lights, -w * 0.22, -d * 0.2, 1.5 * dimMul, decision);
    addLight(group, lights, w * 0.2, d * 0.18, 1.4 * dimMul, decision);
    if (w > 10) addLight(group, lights, 0, 0, 1.2 * dimMul, decision);
  }

  const rng = mulberry32(hashString(id));
  decorate(group, archetype, w, d, rng, decision, pickups, id, collidersLocal);

  let darkPatch: Aabb | null = null;
  if (decision.hazard === "dark_patch") {
    darkPatch = transformAabb(aabbFromCenter(w * 0.15, 1, d * 0.1, 1.8, 1, 1.8), cx, cz, yaw);
  }

  const colliders = collidersLocal.map((box) => transformAabb(box, cx, cz, yaw));
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
    water: archetype === "flooded_lobby" || decision.hazard === "puddle_slip",
    darkPatch,
    cx,
    cz,
    yaw,
    width: w,
    depth: d,
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

export function placeAgainstDoor(
  parent: BuiltRoom,
  parentDoor: Door,
  decision: RoomDecision,
): { cx: number; cz: number; yawTurns: number; entryWorldWall: Wall } {
  const out = doorOutward(parent, parentDoor);
  const neededEntryWorld = opposite(parentDoor.worldWall);
  const slots = doorSlots(decision.roomArchetype);
  const preferredLocal = slots.includes("s") ? "s" : slots[0] ?? "s";
  const yawTurns = turnsToAlign(preferredLocal, neededEntryWorld);
  const { w, d } = sizeOf(decision.roomArchetype, decision.size);
  const half = preferredLocal === "n" || preferredLocal === "s" ? d / 2 : w / 2;
  const parentPos = doorWorldPos(parent, parentDoor);
  return {
    cx: parentPos.x + out.x * (half + 0.02),
    cz: parentPos.z + out.z * (half + 0.02),
    yawTurns,
    entryWorldWall: neededEntryWorld,
  };
}

export function startRoomDecision(): RoomDecision {
  return {
    roomArchetype: "empty_office",
    size: "standard",
    lighting: "harsh",
    hazard: "none",
    loot: "battery",
    entityPresent: false,
    entityPresentNoul: 0.05,
    entityBehavior: "absent",
    ambience: "hum",
    fearIntensity: 0.4,
  };
}
