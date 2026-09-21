import {
  ENCOUNTER_CARDS,
  WIN_DEPTH,
  type ClueBeat,
  type CompactGameState,
  type DriftProgress,
  type EncounterCard,
  type ExitCount,
  type ExitOrientation,
  type LayoutMotif,
  type RoomDecision,
} from "./types.ts";

type WallLike = "n" | "s" | "e" | "w";

export function defaultProgress(): DriftProgress {
  return {
    exitChance: 0,
    lastEncounter: "none",
    lastClue: "none",
    notesFound: 0,
    roomsSinceEntity: 0,
  };
}

export function readProgress(state: CompactGameState): DriftProgress {
  const raw = state.progress;
  if (!raw || typeof raw !== "object") return defaultProgress();
  return {
    exitChance: clamp01(Number(raw.exitChance) || 0),
    lastEncounter: ENCOUNTER_CARDS.includes(raw.lastEncounter) ? raw.lastEncounter : "none",
    lastClue: raw.lastClue ?? "none",
    notesFound: Math.max(0, Number(raw.notesFound) || 0),
    roomsSinceEntity: Math.max(0, Number(raw.roomsSinceEntity) || 0),
  };
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function encounterWarrants(state: CompactGameState): EncounterCard[] {
  const opts: EncounterCard[] = ["none"];
  const progress = readProgress(state);
  const depth = state.depth;
  const last = progress.lastEncounter;

  if (depth >= 3 && last !== "locked_gate_needs_key") {
    opts.push("locked_gate_needs_key");
  }
  if (depth >= 3 && (state.currentRoom?.lighting === "flickering" || state.currentRoom?.lighting === "dead" || depth >= 4)) {
    if (last !== "power_flicker_event") opts.push("power_flicker_event");
  }
  if (depth >= 3 && state.currentRoom?.archetype !== "stairwell") {
    if (last !== "flooded_slow_zone") opts.push("flooded_slow_zone");
  }
  if (depth >= 3 && (state.player.sanity > 42 || state.entity.known || depth >= 5) && last !== "safe_alcove") {
    opts.push("safe_alcove");
  }
  return opts;
}

export function encounterAllowed(state: CompactGameState, card: EncounterCard): boolean {
  return encounterWarrants(state).includes(card);
}

export function outgoingCount(count: ExitCount): number {
  if (count === "one") return 1;
  if (count === "two") return 2;
  if (count === "three") return 3;
  return 4;
}

export function oppositeWall(wall: WallLike): WallLike {
  if (wall === "n") return "s";
  if (wall === "s") return "n";
  if (wall === "e") return "w";
  return "e";
}

export function rotateWallLike(wall: WallLike, turns: number): WallLike {
  const order: WallLike[] = ["n", "e", "s", "w"];
  const index = order.indexOf(wall);
  return order[((index + turns) % 4 + 4) % 4]!;
}

export function motifHint(motif: LayoutMotif): string {
  if (motif === "open_floor") return "almost empty, furniture pushed to memory";
  if (motif === "offset_desks") return "desks that refuse a grid";
  if (motif === "pillar_grid") return "columns that make the room a forest";
  if (motif === "broken_symmetry") return "one wall, one desk, something missing";
  return "a choke just after the door";
}

export function graffitiFor(seed: string): string {
  const lines = [
    "THE HUM IS A DOOR",
    "DO NOT TRUST PAINTED HALLS",
    "IT LEARNED THE CARD READER",
    "YELLOW IS A RULE",
    "IF IT MIMICS A DOOR, WAIT",
    "I LEFT THE KEY IN A ROOM THAT FOLDED",
    "COUNT THE LIGHTS. STOP AT THIRTEEN.",
    "THE EXIT SIGN LIES FIRST",
  ];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return lines[(h >>> 0) % lines.length]!;
}

export function clueNeedsLoot(clue: ClueBeat): "note" | "keycard" | null {
  if (clue === "note") return "note";
  if (clue === "keycard") return "keycard";
  return null;
}

export function orientationWalls(entry: WallLike, orientation: ExitOrientation): WallLike[] {
  const ahead = oppositeWall(entry);
  const left = rotateWallLike(entry, 1);
  const right = rotateWallLike(entry, -1);
  if (orientation === "behind_only") return [];
  if (orientation === "ahead") return [ahead];
  if (orientation === "left") return [left, ahead];
  if (orientation === "right") return [right, ahead];
  return [left, right, ahead];
}

/** True dead-ends stay rare until the run is almost over. */
export function allowIntentionalDeadEnd(depth: number): boolean {
  return depth >= WIN_DEPTH - 6;
}

export function planDoorWalls(
  entryLocal: WallLike,
  decision: Pick<RoomDecision, "roomArchetype" | "exitCount" | "exitOrientation" | "deadEndBait">,
): { real: WallLike[]; fake: WallLike[] } {
  const archetype = decision.roomArchetype;
  if (archetype === "exit_foyer") {
    return { real: [entryLocal, oppositeWall(entryLocal)], fake: [] };
  }
  if (archetype === "dead_end") {
    const baitWalls = decision.deadEndBait ? orientationWalls(entryLocal, "ahead").slice(0, 1) : [];
    return { real: [entryLocal], fake: baitWalls };
  }

  const outgoing = Math.min(archetype === "stairwell" ? 2 : 4, outgoingCount(decision.exitCount));
  let wanted = orientationWalls(entryLocal, decision.exitOrientation).slice(0, outgoing);
  if (wanted.length === 0) wanted = [oppositeWall(entryLocal)];

  // Bait may paint one throat. It must never delete the last real forward door.
  if (decision.deadEndBait && wanted.length > 1) {
    return { real: [entryLocal, ...wanted.slice(1)], fake: wanted.slice(0, 1) };
  }
  return { real: [entryLocal, ...wanted], fake: [] };
}

export function ensureTraversableDecision(decision: RoomDecision, depth: number): RoomDecision {
  const late = allowIntentionalDeadEnd(depth);
  let next = { ...decision };
  if (!late && next.roomArchetype === "dead_end") {
    next.roomArchetype = "empty_office";
    next.exitCount = "two";
    next.exitOrientation = "ahead";
    next.deadEndBait = false;
    next.deadEndBaitNoul = Math.min(next.deadEndBaitNoul, 0.35);
  }
  if (!late && next.exitOrientation === "behind_only") {
    next.exitOrientation = "ahead";
    if (next.exitCount === "one") next.exitCount = "two";
  }
  if (!late) {
    next.deadEndBait = false;
    next.deadEndBaitNoul = Math.min(next.deadEndBaitNoul, 0.4);
  }
  if (next.roomArchetype === "exit_foyer") {
    next.deadEndBait = false;
    next.exitOrientation = "ahead";
    next.exitCount = "one";
  }
  return next;
}
