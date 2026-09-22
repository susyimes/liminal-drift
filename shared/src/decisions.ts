import {
  ambienceFromSoundBed,
  encounterAllowed,
  encounterWarrants,
  ensureTraversableDecision,
  lightingFromStyle,
  readProgress,
  soundBedFromAmbience,
  styleFromLighting,
} from "./director.ts";
import { hashString, mulberry32, pickOne, pickWeighted } from "./rng.ts";
import {
  AMBIENCES,
  CLUE_BEATS,
  CUTOFF_DOORS,
  ENCOUNTER_CARDS,
  ENTITY_BEHAVIORS,
  ENTITY_INTENTS,
  EXIT_COUNTS,
  EXIT_LAYOUTS,
  EXIT_ORIENTATIONS,
  HAZARDS,
  HUMIDITIES,
  LAYOUT_MOTIFS,
  LIGHTING_MODES,
  LIGHTING_MOODS,
  LIGHTING_STYLES,
  LOOT_TYPES,
  NARRATIVE_CRUMBS,
  POOLCORE_VARIANTS,
  ROOM_ARCHETYPES,
  ROOM_SIZES,
  SOUND_BEDS,
  TUNNEL_LENGTHS,
  TUNNEL_MOODS,
  WIN_DEPTH,
  type ClueBeat,
  type CompactGameState,
  type CutoffDoor,
  type EncounterCard,
  type EntityBehavior,
  type EntityDecision,
  type EntityIntent,
  type ExitCount,
  type ExitLayout,
  type ExitOrientation,
  type Hazard,
  type Humidity,
  type JevAnswer,
  type JevAnswers,
  type LayoutMotif,
  type LightingMode,
  type LightingMood,
  type LightingStyle,
  type LootType,
  type NarrativeCrumb,
  type PoolcoreVariant,
  type RoomArchetype,
  type RoomDecision,
  type RoomSize,
  type SoundBed,
  type TunnelLength,
  type TunnelMood,
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
  const moodRaw = readChoice(answers, "lighting_mood");
  const styleRaw = readChoice(answers, "lighting_style");
  const tunnelLenRaw = readChoice(answers, "tunnel_length");
  const tunnelMoodRaw = readChoice(answers, "tunnel_mood");
  const poolVarRaw = readChoice(answers, "poolcore_variant");
  const humidityRaw = readChoice(answers, "humidity");
  const soundBedRaw = readChoice(answers, "sound_bed");
  const crumbRaw = readChoice(answers, "narrative_crumb");
  const layoutRaw = readChoice(answers, "exit_layout");
  const familiarNoul = readNoul(answers, "familiar_return");
  const noul = readNoul(answers, "entity_present");
  const baitNoul = readNoul(answers, "dead_end_bait");
  const exitNoul = readNoul(answers, "advances_exit");
  const soundNoul = readNoul(answers, "sound_bait");
  const fear = readScore(answers, "fear_intensity");
  const aggression = readScore(answers, "entity_aggression");
  const pressure = readScore(answers, "entity_pressure");

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

  let lightingMood: LightingMood = isOneOf(moodRaw, LIGHTING_MOODS) ? moodRaw : fallback.lightingMood;
  if (roomArchetype === "poolcore" && lightingMood === "sick_yellow") lightingMood = "humid_teal";

  let lightingStyle: LightingStyle = isOneOf(styleRaw, LIGHTING_STYLES)
    ? styleRaw
    : isOneOf(lightingRaw, LIGHTING_MODES)
      ? styleFromLighting(lightingRaw)
      : fallback.lightingStyle;
  let lighting: LightingMode = isOneOf(styleRaw, LIGHTING_STYLES)
    ? lightingFromStyle(styleRaw)
    : isOneOf(lightingRaw, LIGHTING_MODES)
      ? lightingRaw
      : fallback.lighting;

  let tunnelMood: TunnelMood = isOneOf(tunnelMoodRaw, TUNNEL_MOODS) ? tunnelMoodRaw : fallback.tunnelMood;
  if (roomArchetype === "poolcore" && tunnelMood === "yellow_throat") tunnelMood = "pool_pipe";

  let poolcoreVariant: PoolcoreVariant = isOneOf(poolVarRaw, POOLCORE_VARIANTS)
    ? poolVarRaw
    : fallback.poolcoreVariant;
  if (roomArchetype === "poolcore" && poolcoreVariant === "none") {
    poolcoreVariant = fallback.poolcoreVariant === "none" ? "shallow_puddle_hall" : fallback.poolcoreVariant;
  }
  if (roomArchetype !== "poolcore" && poolcoreVariant !== "none" && roomArchetype !== "flooded_lobby") {
    poolcoreVariant = "none";
  }

  let humidity: Humidity = isOneOf(humidityRaw, HUMIDITIES) ? humidityRaw : fallback.humidity;
  if (roomArchetype === "poolcore" && humidity === "dry") humidity = "damp";

  let soundBed: SoundBed = isOneOf(soundBedRaw, SOUND_BEDS)
    ? soundBedRaw
    : isOneOf(ambienceRaw, AMBIENCES)
      ? soundBedFromAmbience(ambienceRaw)
      : fallback.soundBed;
  let ambience = isOneOf(soundBedRaw, SOUND_BEDS)
    ? ambienceFromSoundBed(soundBedRaw)
    : isOneOf(ambienceRaw, AMBIENCES)
      ? ambienceRaw
      : fallback.ambience;

  const narrativeCrumb: NarrativeCrumb = isOneOf(crumbRaw, NARRATIVE_CRUMBS)
    ? crumbRaw
    : fallback.narrativeCrumb;
  if (narrativeCrumb !== "none" && clueBeat === "none") {
    /* crumbs can stand alone */
  }

  let exitLayout: ExitLayout = isOneOf(layoutRaw, EXIT_LAYOUTS) ? layoutRaw : fallback.exitLayout;
  if (roomArchetype === "dead_end") exitLayout = "parallel_two";
  if (roomArchetype === "exit_foyer") exitLayout = "parallel_two";

  let hazard: Hazard = isOneOf(hazardRaw, HAZARDS) ? hazardRaw : fallback.hazard;
  let soundBait = (soundNoul ?? fallback.soundBaitNoul) >= 0.55;
  if (hazard === "audio_lure") soundBait = true;
  if (hazard === "low_entity") {
    entityBehavior = "absent";
  }
  if (hazard === "tracking_presence" && !entityPresent) {
    /* unseen pressure — keep the body out of the room */
  }

  return ensureTraversableDecision(
    {
      roomArchetype,
      size: isOneOf(sizeRaw, ROOM_SIZES) ? sizeRaw : fallback.size,
      lighting,
      lightingMood,
      lightingStyle,
      poolcoreVariant,
      humidity,
      soundBed,
      narrativeCrumb,
      exitLayout,
      familiarReturn: (familiarNoul ?? (fallback.familiarReturn ? 0.7 : 0.2)) >= 0.55,
      hazard,
      loot,
      entityPresent: hazard === "low_entity" ? false : entityPresent,
      entityPresentNoul: hazard === "low_entity" ? Math.min(entityPresentNoul, 0.4) : entityPresentNoul,
      entityBehavior: hazard === "low_entity" ? "absent" : entityBehavior,
      ambience,
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
      soundBait,
      soundBaitNoul: soundBait ? Math.max(soundNoul ?? fallback.soundBaitNoul, 0.6) : soundNoul ?? fallback.soundBaitNoul,
      entityAggression: aggression ?? fallback.entityAggression,
      entityPressure:
        hazard === "tracking_presence"
          ? Math.max(pressure ?? fallback.entityPressure, 2.1)
          : hazard === "low_entity"
            ? Math.min(pressure ?? fallback.entityPressure, 0.8)
            : pressure ?? fallback.entityPressure,
      tunnelLength: isOneOf(tunnelLenRaw, TUNNEL_LENGTHS) ? tunnelLenRaw : fallback.tunnelLength,
      tunnelMood,
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

  const visited = state.recentArchetypes.filter(
    (kind) => kind !== "dead_end" && kind !== "exit_foyer",
  );
  const familiarReturn = visited.length > 0 && rng() < 0.3;
  const archetype = familiarReturn
    ? pickOne(
        rng,
        visited.filter((kind) => kind !== state.recentArchetypes[state.recentArchetypes.length - 1])
          .length
          ? visited.filter((kind) => kind !== state.recentArchetypes[state.recentArchetypes.length - 1])
          : visited,
      )
    : pickWeighted<RoomArchetype>(rng, [
        { value: "empty_office", w: recent.has("empty_office") ? 0.4 : 1.5 },
        { value: "long_hall", w: recent.has("long_hall") ? 0.5 : 2.1 },
        { value: "flooded_lobby", w: recent.has("flooded_lobby") ? 0.3 : 1.0 },
        { value: "maze_cubicles", w: recent.has("maze_cubicles") ? 0.35 : 1.6 },
        { value: "stairwell", w: recent.has("stairwell") ? 0.25 : 0.95 },
        { value: "poolcore", w: recent.has("poolcore") ? 0.35 : 1.35 },
        { value: "hotel_hall", w: recent.has("hotel_hall") ? 0.35 : 1.15 },
        { value: "parking_ramp", w: recent.has("parking_ramp") ? 0.3 : 0.95 },
        { value: "machine_room", w: recent.has("machine_room") ? 0.28 : 0.85 },
        { value: "empty_classroom", w: recent.has("empty_classroom") ? 0.28 : 0.9 },
        { value: "unfinished", w: recent.has("unfinished") ? 0.25 : 0.8 },
        { value: "dead_end", w: state.depth < 8 ? 0.04 : 0.45 },
        { value: "exit_foyer", w: exitWeight },
      ]);

  const sizePool: RoomSize[] =
    archetype === "dead_end" || archetype === "stairwell" || archetype === "machine_room"
      ? ["cramped", "standard"]
      : archetype === "long_hall" || archetype === "hotel_hall" || archetype === "parking_ramp"
        ? ["standard", "vast"]
        : archetype === "poolcore"
          ? ["standard", "vast"]
          : [...ROOM_SIZES];

  const lightingStyle = pickWeighted<LightingStyle>(rng, [
    { value: "steady_cool", w: archetype === "poolcore" || archetype === "parking_ramp" ? 1.6 : 0.9 },
    { value: "flicker", w: 1.5 },
    { value: "half_dead", w: state.depth > 3 ? 1.3 : 0.55 },
    { value: "almost_dark", w: state.depth > 6 ? 0.9 : 0.18 },
  ]);
  const lighting = lightingFromStyle(lightingStyle);

  const hazard =
    state.depth < 3
      ? "none"
      : pickWeighted<Hazard>(rng, [
          { value: "none", w: 2.0 },
          { value: "puddle_slip", w: archetype === "poolcore" ? 1.2 : 0.55 },
          { value: "dark_patch", w: 0.55 },
          { value: "buzzing_overload", w: 0.4 },
          { value: "audio_lure", w: 0.7 },
          { value: "tracking_presence", w: state.depth >= 5 ? 0.65 : 0.2 },
          { value: "environmental", w: archetype === "poolcore" ? 1.1 : 0.45 },
          { value: "low_entity", w: 0.85 },
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
  if (hazard === "low_entity") {
    entityBehavior = "absent";
  } else if (presentRoll < presentChance && hazard !== "tracking_presence") {
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

  const deadEndBaitNoul = state.depth >= 2 && rng() < 0.58 ? 0.72 : rng() * 0.35;
  const advancesExitNoul = state.depth >= 5 && rng() < 0.28 ? 0.66 : rng() * 0.4;
  const soundBaitNoul = entityBehavior !== "absent" && rng() < 0.35 ? 0.7 : rng() * 0.3;

  let exitLayout: ExitLayout = pickWeighted<ExitLayout>(rng, [
    { value: "parallel_two", w: 1.5 },
    { value: "t_junction", w: 2.0 },
    { value: "cross", w: 1.1 },
    { value: "loop_side", w: 1.2 },
  ]);
  let exitCount: ExitCount = pickWeighted<ExitCount>(rng, [
    { value: "one", w: 0.12 },
    { value: "two", w: 2.2 },
    { value: "three", w: 1.8 },
    { value: "four", w: 0.55 },
  ]);
  let exitOrientation: ExitOrientation = pickWeighted<ExitOrientation>(rng, [
    { value: "ahead", w: 1.2 },
    { value: "left", w: 0.85 },
    { value: "right", w: 0.85 },
    { value: "split", w: 1.6 },
    { value: "behind_only", w: state.depth >= 8 ? 0.2 : 0.02 },
  ]);
  if (archetype === "dead_end") {
    exitCount = "one";
    exitOrientation = "behind_only";
    exitLayout = "parallel_two";
  } else if (archetype === "exit_foyer") {
    exitCount = "one";
    exitOrientation = "ahead";
    exitLayout = "parallel_two";
  } else if (archetype === "long_hall" || archetype === "hotel_hall") {
    exitLayout = rng() < 0.55 ? "t_junction" : "parallel_two";
    exitCount = exitLayout === "t_junction" ? "two" : rng() < 0.4 ? "three" : "two";
    exitOrientation = exitLayout === "t_junction" ? "split" : "ahead";
  } else if (archetype === "parking_ramp") {
    exitLayout = rng() < 0.5 ? "parallel_two" : "t_junction";
    exitCount = "two";
    exitOrientation = exitLayout === "t_junction" ? "split" : "ahead";
  } else if (exitLayout === "cross") {
    exitCount = "three";
    exitOrientation = "split";
  } else if (exitLayout === "t_junction") {
    exitCount = "two";
    exitOrientation = "split";
  } else if (exitOrientation === "behind_only" && state.depth < 8) {
    exitOrientation = "ahead";
    if (exitCount === "one") exitCount = "two";
  }

  const lightingMood: LightingMood =
    archetype === "poolcore"
      ? "humid_teal"
      : lightingStyle === "almost_dark"
        ? "brownout"
        : lightingStyle === "steady_cool" || archetype === "parking_ramp" || archetype === "machine_room"
          ? "cold_service"
          : archetype === "stairwell"
            ? pickOne(rng, ["cold_service", "brownout"] as const)
            : pickWeighted<LightingMood>(rng, [
                { value: "sick_yellow", w: 2.4 },
                { value: "cold_service", w: 0.55 },
                { value: "humid_teal", w: 0.35 },
                { value: "brownout", w: lightingStyle === "half_dead" ? 0.7 : 0.2 },
              ]);

  const tunnelMood: TunnelMood =
    archetype === "poolcore"
      ? "pool_pipe"
      : archetype === "flooded_lobby"
        ? "damp_service"
        : lighting === "dead"
          ? "dark_throat"
          : pickWeighted<TunnelMood>(rng, [
              { value: "yellow_throat", w: 2.1 },
              { value: "damp_service", w: 0.8 },
              { value: "pool_pipe", w: 0.55 },
              { value: "dark_throat", w: 0.45 },
            ]);
  const tunnelLength: TunnelLength = pickWeighted<TunnelLength>(rng, [
    { value: "short", w: 1.6 },
    { value: "medium", w: 2.0 },
    { value: "long", w: state.depth >= 4 ? 0.7 : 0.25 },
  ]);
  const entityPressure =
    (hazard === "tracking_presence" ? 2.2 : 0.35) +
    state.depth * 0.1 +
    (entityBehavior === "absent" ? 0 : 0.7) +
    rng() * 0.4;

  const poolcoreVariant: PoolcoreVariant =
    archetype !== "poolcore"
      ? "none"
      : pickWeighted(rng, [
          { value: "shallow_puddle_hall" as const, w: 2.2 },
          { value: "empty_pool_hall" as const, w: 1.6 },
          { value: "locker_room" as const, w: 1.1 },
          { value: "flooded_utility" as const, w: 1.0 },
        ]);
  const humidity: Humidity =
    archetype === "poolcore" || archetype === "flooded_lobby"
      ? pickWeighted(rng, [
          { value: "damp" as const, w: 1.6 },
          { value: "heavy" as const, w: 2.0 },
          { value: "dry" as const, w: 0.05 },
        ])
      : pickWeighted(rng, [
          { value: "dry" as const, w: 2.2 },
          { value: "damp" as const, w: 0.7 },
          { value: "heavy" as const, w: 0.15 },
        ]);
  const soundBed: SoundBed =
    archetype === "poolcore"
      ? pickWeighted(rng, [
          { value: "drip" as const, w: 2.6 },
          { value: "silence_ring" as const, w: 0.9 },
          { value: "hvac_hum" as const, w: 0.45 },
          { value: "distant_footsteps" as const, w: 0.35 },
        ])
      : pickWeighted(rng, [
          { value: "hvac_hum" as const, w: 2.0 },
          { value: "drip" as const, w: 0.7 },
          { value: "distant_footsteps" as const, w: 0.8 },
          { value: "silence_ring" as const, w: 0.7 },
        ]);
  const narrativeCrumb: NarrativeCrumb = pickWeighted(rng, [
    { value: "none" as const, w: 2.4 },
    { value: "wrong_door_number" as const, w: 0.7 },
    { value: "wet_footprints" as const, w: humidity === "dry" ? 0.25 : 0.8 },
    { value: "unfinished_notice" as const, w: archetype === "unfinished" ? 1.4 : 0.45 },
  ]);

  return ensureTraversableDecision({
    roomArchetype: archetype,
    size: pickOne(rng, sizePool),
    lighting,
    lightingMood,
    lightingStyle,
    poolcoreVariant,
    humidity,
    soundBed,
    narrativeCrumb,
    exitLayout,
    familiarReturn,
    hazard,
    loot,
    entityPresent: entityBehavior !== "absent",
    entityPresentNoul: entityBehavior === "absent" ? presentRoll * 0.4 : 0.55 + presentRoll * 0.4,
    entityBehavior,
    ambience: ambienceFromSoundBed(soundBed),
    fearIntensity: 0.6 + state.depth * 0.18 + (lighting === "dead" ? 0.7 : 0) + rng() * 0.5,
    layoutMotif: exitLayout === "loop_side" ? "pillar_grid" : pickOne(rng, LAYOUT_MOTIFS),
    exitCount,
    exitOrientation,
    deadEndBait: deadEndBaitNoul >= 0.55,
    deadEndBaitNoul,
    clueBeat,
    advancesExit: advancesExitNoul >= 0.55,
    advancesExitNoul,
    encounterCard,
    cutoffDoor: entityBehavior === "absent" ? "none" : pickOne(rng, CUTOFF_DOORS),
    soundBait: hazard === "audio_lure" || soundBaitNoul >= 0.55,
    soundBaitNoul,
    entityAggression: 0.4 + state.depth * 0.08 + (state.player.noise > 0.45 ? 0.5 : 0),
    entityPressure,
    tunnelLength,
    tunnelMood,
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
    "The water is warmer than the air. That is not a kindness.",
    "Tile grout counts the drips. I stopped counting at four hundred.",
  ];
  return notes[hashString(seed) % notes.length]!;
}
