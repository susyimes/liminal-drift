import type { RoomArchetype } from "@liminal/shared";

const VIBE_ZH: Record<RoomArchetype, string> = {
  empty_office: "空置办公室",
  long_hall: "长廊",
  flooded_lobby: "积水大堂",
  maze_cubicles: "隔间迷宫",
  stairwell: "楼梯间",
  dead_end: "死路",
  exit_foyer: "出口门厅",
};

export function roomVibeZh(archetype: RoomArchetype | string): string {
  return VIBE_ZH[archetype as RoomArchetype] ?? archetype.replaceAll("_", " ");
}

export function roomVibeHud(archetype: RoomArchetype | string): string {
  return `${roomVibeZh(archetype)} · ${archetype}`;
}

export function depthHudText(depth: number): string {
  return `深度 DEPTH ${depth}`;
}

export const OPENING_HINT = "往前走。找一扇门。";
