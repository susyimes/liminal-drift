import { encounterAllowed, encounterWarrants, ensureTraversableDecision, readProgress } from "./director.ts";
import { hashString, mulberry32, pickOne, pickWeighted } from "./rng.ts";
import {
  AMBIENCES,
  CLUE_BEATS,
  CUTOFF_DOORS,
  ENCOUNTER_CARDS,
  ENTITY_BEHAVIORS,
  ENTITY_INTENTS,
  EXIT_COUNTS,
  EXIT_ORIENTATIONS,
  HAZARDS,
  LAYOUT_MOTIFS,
  LIGHTING_MODES,
  LOOT_TYPES,
  ROOM_ARCHETYPES,
  ROOM_SIZES,
  WIN_DEPTH,
  type ClueBeat,
  type CompactGameState,
  type CutoffDoor,
  type EncounterCard,
  type EntityBehavior,
  type EntityDecision,
  type EntityIntent,
  type ExitCount,
  type ExitOrientation,
  type Hazard,
  type JevAnswer,
  type JevAnswers,
  type LayoutMotif,
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
  const motifRaw = readChoice(answers, "layout_motif");
  const exitCountRaw = readChoice(answers, "exit_count");
  const exitOriRaw = readChoice(answers, "exit_orientation");
  const clueRaw = readChoice(answers, "clue_beat");
  const encounterRaw = readChoice(answers, "encounter_card");
  const cutoffRaw = readChoice(answers, "cutoff_door");
  const noul = readNoul(answers, "entity_present");
  const baitNoul = readNoul(answers, "dead_end_bait");
  const exitNoul = readNoul(answers, "advances_exit");
  const soundNoul = readNoul(answers, "sound_bait");
  const fear = readScore(answers, "fear_intensity");
  const aggression = readScore(answers, "entity_aggression");

  let roomArchetype: RoomArchetype = isOneOf(archetypeRaw, ROOM_ARCHETYPES)
    ? archetypeRaw
    : fallback.roomArchetype;
  if (roomArchetype === "exit_foyer" && state.depth < 7 && readProgress(state).exitChance < 0.62) {
    roomArchetype = fallback.roomArchetype === "exit_foyer" ? "long_hall" : fallback.roomArchetype;
  }

  const entityPresentNoul = noul ?? fallback.entityPresentNoul;
  let entityBehavior: EntityBehavior = isOneOf(behaviorRaw, ENTITY_BEHAVIORS)
    ? behaviorRaw
    : fallback.entityBehavior;
  const entityPresent = entityPresentNoul >= 0.55 && entityBehavior !== "absent";
  if (!entityPresent) entityBehavior = "absent";

  let loot: LootType = isOneOf(lootRaw, LOOT_TYPES) ? lootRaw : fallback.loot;
  const clueBeat: ClueBeat = isOneOf(clueRaw, CLUE_BEATS) ? clueRaw : fallback.clueBeat;
  if (loot === "none" && clueBeat === "note") loot = "note";
  if (loot === "none" && clueBeat === "keycard" && !state.player.hasKeycard) loot = "keycard";
  if (loot === "keycard" && state.player.hasKeycard && clueBeat !== "keycard") loot = fallback.loot === "keycard" ? "none" : fallback.loot;

  let encounterCard: EncounterCard = isOneOf(encounterRaw, ENCOUNTER_CARDS)
    ? encounterRaw
    : fallback.encounterCard;
  if (!encounterAllowed(state, encounterCard)) {
    encounterCard = encounterAllowed(state, fallback.encounterCard) ? fallback.encounterCard : "none";
  }
  if (roomArchetype === "exit_foyer" && encounterCard === "locked_gate_needs_key") {
    encounterCard = "none";
  }

  let exitCount: ExitCount = isOneOf(exitCountRaw, EXIT_COUNTS) ? exitCountRaw : fallback.exitCount;
  let exitOrientation: ExitOrientation = isOneOf(exitOriRaw, EXIT_ORIENTATIONS)
    ? exitOriRaw
    : fallback.exitOrientation;
  if (roomArchetype === "dead_end") {
    exitCount = "one";
    exitOrientation = "behind_only";
  }
  if (roomArchetype === "exit_foyer") {
    exitCount = "one";
    exitOrientation = "ahead";
  }

  const deadEndBaitNoul = baitNoul ?? fallback.deadEndBaitNoul;
  const deadEndBait = roomArchetype !== "exit_foyer" && deadEndBaitNoul >= 0.55;

  return ensureTraversableDecision(
    {
      roomArchetype,
      size: isOneOf(sizeRaw, ROOM_SIZES) ? sizeRaw : fallback.size,
      lighting: isOneOf(lightingRaw, LIGHTING_MODES) ? lightingRaw : fallback.lighting,
      hazard: isOneOf(hazardRaw, HAZARDS) ? hazardRaw : fallback.hazard,
      loot,
      entityPresent,
      entityPresentNoul,
      entityBehavior,
      ambience: isOneOf(ambienceRaw, AMBIENCES) ? ambienceRaw : fallback.ambience,
      fearIntensity: fear ?? fallback.fearIntensity,
      layoutMotif: isOneOf(motifRaw, LAYOUT_MOTIFS) ? motifRaw : fallback.layoutMotif,
      exitCount,
      exitOrientation,
      deadEndBait,
      deadEndBaitNoul,
      clueBeat,
      advancesExit: (exitNoul ?? fallback.advancesExitNoul) >= 0.55,
      advancesExitNoul: exitNoul ?? fallback.advancesExitNoul,
      encounterCard,
      cutoffDoor: isOneOf(cutoffRaw, CUTOFF_DOORS) ? cutoffRaw : fallback.cutoffDoor,
      soundBait: (soundNoul ?? fallback.soundBaitNoul) >= 0.55,
      soundBaitNoul: soundNoul ?? fallback.soundBaitNoul,
      entityAggression: aggression ?? fallback.entityAggression,
    },
    state.depth,
  );
}

export function mapEntityDecision(
  answers: JevAnswers | undefined,
  fallback: EntityDecision,
): EntityDecision {
  const intentRaw = readChoice(answers, "intent");
  const aggression = readScore(answers, "aggression");
  const cutoffRaw = readChoice(answers, "cutoff_door");
  const soundNoul = readNoul(answers, "sound_bait");
  return {
    intent: isOneOf(intentRaw, ENTITY_INTENTS) ? intentRaw : fallback.intent,
    aggression: aggression ?? fallback.aggression,
    cutoffDoor: isOneOf(cutoffRaw, CUTOFF_DOORS) ? cutoffRaw : fallback.cutoffDoor,
    soundBait: (soundNoul ?? fallback.soundBaitNoul) >= 0.55,
    soundBaitNoul: soundNoul ?? fallback.soundBaitNoul,
  };
}

export function fallbackRoomDecision(state: CompactGameState, portalId: string): RoomDecision {
  const progress = readProgress(state);
  const rng = mulberry32(
    hashString(`${state.depth}|${state.roomsVisited}|${portalId}|${state.recentArchetypes.join(",")}|${progress.exitChance.toFixed(2)}`),
  );

  const recent = new Set(state.recentArchetypes.slice(-2));
  const exitWeight =
    state.depth >= WIN_DEPTH
      ? 12
      : progress.exitChance >= 0.6 && state.depth >= 7
        ? 1.8 + progress.exitChance * 4
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
    { value: "dead_end", w: state.depth < 8 ? 0.04 : 0.45 },
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
    entityBehavior = pickOne(rng, ["stalk", "ambush", "wander", "mimic_door"] as const);
  }

  const clueBeat = pickWeighted<ClueBeat>(rng, [
    { value: "none", w: 2.4 },
    { value: "note", w: loot === "note" ? 0.2 : 0.7 },
    { value: "keycard", w: state.player.hasKeycard ? 0.05 : 0.35 },
    { value: "false_exit", w: state.depth >= 4 ? 0.55 : 0.1 },
    { value: "graffiti", w: 0.7 },
    { value: "radio_static", w: 0.45 },
  ]);

  const warrants = encounterWarrants(state);
  const encounterCard = pickWeighted<EncounterCard>(
    rng,
    warrants.map((value) => ({ value, w: value === "none" ? 2.8 : 0.7 })),
  );

  const deadEndBaitNoul = state.depth >= 8 && rng() < 0.12 ? 0.7 : rng() * 0.35;
  const advancesExitNoul = state.depth >= 5 && rng() < 0.28 ? 0.66 : rng() * 0.4;
  const soundBaitNoul = entityBehavior !== "absent" && rng() < 0.35 ? 0.7 : rng() * 0.3;

  let exitCount: ExitCount = pickOne(rng, EXIT_COUNTS);
  let exitOrientation: ExitOrientation = pickOne(rng, EXIT_ORIENTATIONS);
  if (archetype === "dead_end") {
    exitCount = "one";
    exitOrientation = "behind_only";
  } else if (archetype === "long_hall") {
    exitCount = rng() < 0.35 ? "two" : "one";
    exitOrientation = rng() < 0.4 ? "split" : "ahead";
  } else if (archetype === "exit_foyer") {
    exitCount = "one";
    exitOrientation = "ahead";
  } else if (exitOrientation === "behind_only" && state.depth < 8) {
    exitOrientation = "ahead";
    if (exitCount === "one") exitCount = "two";
  }

  return ensureTraversableDecision({
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
    layoutMotif: pickOne(rng, LAYOUT_MOTIFS),
    exitCount,
    exitOrientation,
    deadEndBait: deadEndBaitNoul >= 0.55,
    deadEndBaitNoul,
    clueBeat,
    advancesExit: advancesExitNoul >= 0.55,
    advancesExitNoul,
    encounterCard,
    cutoffDoor: entityBehavior === "absent" ? "none" : pickOne(rng, CUTOFF_DOORS),
    soundBait: soundBaitNoul >= 0.55,
    soundBaitNoul,
    entityAggression: 0.4 + state.depth * 0.08 + (state.player.noise > 0.45 ? 0.5 : 0),
  }, state.depth);
}

export function fallbackEntityDecision(state: CompactGameState): EntityDecision {
  const rng = mulberry32(
    hashString(
      `ent|${state.depth}|${state.entity.hops}|${state.entity.los}|${state.player.noise}|${Math.round(state.player.sanity)}|${state.entity.lastIntent ?? ""}`,
    ),
  );
  const noisy = state.player.noise > 0.45;
  const close = state.entity.sameRoom || state.entity.hops <= 1;
  let intent: EntityIntent;
  if (!state.entity.known && state.depth < 2) intent = "hold";
  else if (close && (noisy || state.player.sanity > 55)) intent = rng() < 0.7 ? "chase" : "cut_off";
  else if (!state.entity.los && rng() < 0.28) intent = "bait";
  else if (state.entity.los && rng() < 0.4) intent = "hide";
  else if (rng() < 0.32) intent = "flank";
  else if (rng() < 0.5) intent = "chase";
  else intent = "hold";

  const soundBaitNoul = intent === "bait" || (!close && rng() < 0.4) ? 0.72 : rng() * 0.35;
  const aggression =
    (close ? 1.4 : 0.5) + (noisy ? 0.8 : 0) + state.depth * 0.08 + (state.player.sanity / 100) * 0.7;

  let cutoffDoor: CutoffDoor = "none";
  if (intent === "cut_off" || intent === "flank") cutoffDoor = pickOne(rng, ["entry", "left", "right", "far"] as const);
  else if (rng() < 0.25) cutoffDoor = pickOne(rng, CUTOFF_DOORS);

  return { intent, aggression, cutoffDoor, soundBait: soundBaitNoul >= 0.55, soundBaitNoul };
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
    "A door that shimmers is still deciding. Wait or it invents you.",
    "It stood in the jamb until I said hello. Then it had joints.",
  ];
  return notes[hashString(seed) % notes.length]!;
}
