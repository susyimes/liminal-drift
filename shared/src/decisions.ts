import { hashString, mulberry32, pickOne, pickWeighted } from "./rng.ts";
import {
  AMBIENCES,
  ENTITY_BEHAVIORS,
  ENTITY_INTENTS,
  HAZARDS,
  LIGHTING_MODES,
  LOOT_TYPES,
  ROOM_ARCHETYPES,
  ROOM_SIZES,
  WIN_DEPTH,
  type CompactGameState,
  type EntityBehavior,
  type EntityDecision,
  type EntityIntent,
  type Hazard,
  type JevAnswer,
  type JevAnswers,
  type LightingMode,
  type LootType,
  type RoomArchetype,
  type RoomDecision,
  type RoomSize,
} from "./types.ts";

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function readChoice(answers: JevAnswers | undefined, key: string): string | null {
  const raw: JevAnswer | undefined = answers?.[key];
  if (!raw || raw.type !== "choice") return null;
  return raw.choice;
}

function readNoul(answers: JevAnswers | undefined, key: string): number | null {
  const raw: JevAnswer | undefined = answers?.[key];
  if (!raw || raw.type !== "noul") return null;
  if (typeof raw.noul !== "number" || Number.isNaN(raw.noul)) return null;
  return Math.min(1, Math.max(0, raw.noul));
}

function readScore(answers: JevAnswers | undefined, key: string): number | null {
  const raw: JevAnswer | undefined = answers?.[key];
  if (!raw || raw.type !== "score") return null;
  if (typeof raw.score !== "number" || Number.isNaN(raw.score)) return null;
  return raw.score;
}

export function mapRoomDecision(
  answers: JevAnswers | undefined,
  state: CompactGameState,
  fallback: RoomDecision,
): RoomDecision {
  const archetypeRaw = readChoice(answers, "room_archetype");
  const sizeRaw = readChoice(answers, "size");
  const lightingRaw = readChoice(answers, "lighting");
  const hazardRaw = readChoice(answers, "hazard");
  const lootRaw = readChoice(answers, "loot_or_clue");
  const behaviorRaw = readChoice(answers, "entity_behavior");
  const ambienceRaw = readChoice(answers, "ambience");
  const noul = readNoul(answers, "entity_present");
  const fear = readScore(answers, "fear_intensity");

  let roomArchetype: RoomArchetype = isOneOf(archetypeRaw, ROOM_ARCHETYPES)
    ? archetypeRaw
    : fallback.roomArchetype;
  if (roomArchetype === "exit_foyer" && state.depth < 7) {
    roomArchetype = fallback.roomArchetype === "exit_foyer" ? "long_hall" : fallback.roomArchetype;
  }

  const entityPresentNoul = noul ?? fallback.entityPresentNoul;
  let entityBehavior: EntityBehavior = isOneOf(behaviorRaw, ENTITY_BEHAVIORS)
    ? behaviorRaw
    : fallback.entityBehavior;
  const entityPresent = entityPresentNoul >= 0.55 && entityBehavior !== "absent";
  if (!entityPresent) entityBehavior = "absent";

  return {
    roomArchetype,
    size: isOneOf(sizeRaw, ROOM_SIZES) ? sizeRaw : fallback.size,
    lighting: isOneOf(lightingRaw, LIGHTING_MODES) ? lightingRaw : fallback.lighting,
    hazard: isOneOf(hazardRaw, HAZARDS) ? hazardRaw : fallback.hazard,
    loot: isOneOf(lootRaw, LOOT_TYPES) ? lootRaw : fallback.loot,
    entityPresent,
    entityPresentNoul,
    entityBehavior,
    ambience: isOneOf(ambienceRaw, AMBIENCES) ? ambienceRaw : fallback.ambience,
    fearIntensity: fear ?? fallback.fearIntensity,
  };
}

export function mapEntityDecision(
  answers: JevAnswers | undefined,
  fallback: EntityDecision,
): EntityDecision {
  const intentRaw = readChoice(answers, "intent");
  const aggression = readScore(answers, "aggression");
  return {
    intent: isOneOf(intentRaw, ENTITY_INTENTS) ? intentRaw : fallback.intent,
    aggression: aggression ?? fallback.aggression,
  };
}

export function fallbackRoomDecision(state: CompactGameState, portalId: string): RoomDecision {
  const rng = mulberry32(
    hashString(`${state.depth}|${state.roomsVisited}|${portalId}|${state.recentArchetypes.join(",")}`),
  );

  const recent = new Set(state.recentArchetypes.slice(-2));
  const exitWeight =
    state.depth >= WIN_DEPTH
      ? 12
      : state.depth >= 10
        ? 2.2
        : state.depth >= 8
          ? 0.7
          : 0;

  const archetype = pickWeighted<RoomArchetype>(rng, [
    { value: "empty_office", w: recent.has("empty_office") ? 0.4 : 1.6 },
    { value: "long_hall", w: recent.has("long_hall") ? 0.5 : 2.2 },
    { value: "flooded_lobby", w: recent.has("flooded_lobby") ? 0.3 : 1.1 },
    { value: "maze_cubicles", w: recent.has("maze_cubicles") ? 0.35 : 1.7 },
    { value: "stairwell", w: recent.has("stairwell") ? 0.25 : 1.0 },
    { value: "dead_end", w: state.depth < 2 ? 0.1 : 0.9 },
    { value: "exit_foyer", w: exitWeight },
  ]);

  const sizePool: RoomSize[] =
    archetype === "dead_end" || archetype === "stairwell"
      ? ["cramped", "standard"]
      : archetype === "long_hall"
        ? ["standard", "vast"]
        : [...ROOM_SIZES];

  const lighting = pickWeighted<LightingMode>(rng, [
    { value: "flickering", w: 1.4 },
    { value: "dim", w: state.depth > 4 ? 1.6 : 0.8 },
    { value: "harsh", w: 1.1 },
    { value: "dead", w: state.depth > 6 ? 1.2 : 0.25 },
  ]);

  const hazard =
    state.depth < 3
      ? "none"
      : pickWeighted<Hazard>(rng, [
          { value: "none", w: 2.2 },
          { value: "puddle_slip", w: 0.8 },
          { value: "dark_patch", w: 0.7 },
          { value: "buzzing_overload", w: 0.5 },
        ]);

  let loot: LootType = "none";
  const lootRoll = rng();
  if (state.player.battery < 35 && lootRoll < 0.45) loot = "battery";
  else if (!state.player.hasKeycard && state.depth >= 4 && lootRoll < 0.16) loot = "keycard";
  else if (lootRoll < 0.22) loot = "note";
  else if (lootRoll < 0.38) loot = "battery";

  const presentRoll = rng();
  const presentChance = state.depth < 2 ? 0.08 : Math.min(0.72, 0.18 + state.depth * 0.05 + state.player.noise * 0.2);
  let entityBehavior: EntityBehavior = "absent";
  if (presentRoll < presentChance) {
    entityBehavior = pickOne(rng, ["stalk", "ambush", "wander"] as const);
  }

  return {
    roomArchetype: archetype,
    size: pickOne(rng, sizePool),
    lighting,
    hazard,
    loot,
    entityPresent: entityBehavior !== "absent",
    entityPresentNoul: entityBehavior === "absent" ? presentRoll * 0.4 : 0.55 + presentRoll * 0.4,
    entityBehavior,
    ambience: pickOne(rng, AMBIENCES),
    fearIntensity: 0.6 + state.depth * 0.18 + (lighting === "dead" ? 0.7 : 0) + rng() * 0.5,
  };
}

export function fallbackEntityDecision(state: CompactGameState): EntityDecision {
  const rng = mulberry32(
    hashString(
      `ent|${state.depth}|${state.entity.hops}|${state.entity.los}|${state.player.noise}|${Math.round(state.player.sanity)}`,
    ),
  );
  const noisy = state.player.noise > 0.45;
  const close = state.entity.sameRoom || state.entity.hops <= 1;
  let intent: EntityIntent;
  if (!state.entity.known && state.depth < 2) intent = "hold";
  else if (close && (noisy || state.player.sanity > 55)) intent = rng() < 0.75 ? "chase" : "flank";
  else if (state.entity.los && rng() < 0.45) intent = "hide";
  else if (rng() < 0.35) intent = "flank";
  else if (rng() < 0.5) intent = "chase";
  else intent = "hold";

  const aggression =
    (close ? 1.4 : 0.5) + (noisy ? 0.8 : 0) + state.depth * 0.08 + (state.player.sanity / 100) * 0.7;
  return { intent, aggression };
}

export function notesFor(seed: string): string {
  const notes = [
    "If the hum stops, do not look up.",
    "I counted 400 doors. None of them were the first one.",
    "It walks when you walk. I tested this. I should not have tested this.",
    "The carpet is wet on purpose. It keeps the sound.",
    "Yellow is not a color here. It is a rule.",
    "Battery dying. If you find this I am not ahead of you.",
    "The exit sign was a painting. The lock was real.",
    "Don't run in the cubicles. It likes the corners.",
  ];
  return notes[hashString(seed) % notes.length]!;
}
