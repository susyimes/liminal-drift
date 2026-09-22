export const ROOM_ARCHETYPES = [
  "empty_office",
  "long_hall",
  "flooded_lobby",
  "maze_cubicles",
  "stairwell",
  "dead_end",
  "exit_foyer",
  "poolcore",
  "hotel_hall",
  "parking_ramp",
  "machine_room",
  "empty_classroom",
  "unfinished",
] as const;
export type RoomArchetype = (typeof ROOM_ARCHETYPES)[number];

export const ROOM_SIZES = ["cramped", "standard", "vast"] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];

export const LIGHTING_MODES = ["flickering", "dim", "harsh", "dead"] as const;
export type LightingMode = (typeof LIGHTING_MODES)[number];

export const LIGHTING_STYLES = ["steady_cool", "flicker", "half_dead", "almost_dark"] as const;
export type LightingStyle = (typeof LIGHTING_STYLES)[number];

export const LIGHTING_MOODS = ["sick_yellow", "humid_teal", "cold_service", "brownout"] as const;
export type LightingMood = (typeof LIGHTING_MOODS)[number];

export const TUNNEL_LENGTHS = ["short", "medium", "long"] as const;
export type TunnelLength = (typeof TUNNEL_LENGTHS)[number];

export const TUNNEL_MOODS = ["yellow_throat", "damp_service", "pool_pipe", "dark_throat"] as const;
export type TunnelMood = (typeof TUNNEL_MOODS)[number];

export const POOLCORE_VARIANTS = [
  "none",
  "shallow_puddle_hall",
  "empty_pool_hall",
  "locker_room",
  "flooded_utility",
] as const;
export type PoolcoreVariant = (typeof POOLCORE_VARIANTS)[number];

export const EXIT_LAYOUTS = ["parallel_two", "t_junction", "cross", "loop_side"] as const;
export type ExitLayout = (typeof EXIT_LAYOUTS)[number];

export const HUMIDITIES = ["dry", "damp", "heavy"] as const;
export type Humidity = (typeof HUMIDITIES)[number];

export const SOUND_BEDS = ["hvac_hum", "drip", "distant_footsteps", "silence_ring"] as const;
export type SoundBed = (typeof SOUND_BEDS)[number];

export const NARRATIVE_CRUMBS = ["none", "wrong_door_number", "wet_footprints", "unfinished_notice"] as const;
export type NarrativeCrumb = (typeof NARRATIVE_CRUMBS)[number];

export const HAZARDS = [
  "none",
  "puddle_slip",
  "dark_patch",
  "buzzing_overload",
  "audio_lure",
  "tracking_presence",
  "environmental",
  "low_entity",
] as const;
export type Hazard = (typeof HAZARDS)[number];

export const LOOT_TYPES = ["none", "battery", "keycard", "note"] as const;
export type LootType = (typeof LOOT_TYPES)[number];

export const LAYOUT_MOTIFS = [
  "open_floor",
  "offset_desks",
  "pillar_grid",
  "broken_symmetry",
  "narrow_throat",
] as const;
export type LayoutMotif = (typeof LAYOUT_MOTIFS)[number];

export const EXIT_COUNTS = ["one", "two", "three", "four"] as const;
export type ExitCount = (typeof EXIT_COUNTS)[number];

export const EXIT_ORIENTATIONS = ["ahead", "left", "right", "behind_only", "split"] as const;
export type ExitOrientation = (typeof EXIT_ORIENTATIONS)[number];

export const CLUE_BEATS = [
  "none",
  "note",
  "keycard",
  "false_exit",
  "graffiti",
  "radio_static",
  "wrong_door_number",
  "wet_footprints",
  "unfinished_notice",
] as const;
export type ClueBeat = (typeof CLUE_BEATS)[number];

export const ENTITY_BEHAVIORS = ["stalk", "ambush", "wander", "mimic_door", "absent"] as const;
export type EntityBehavior = (typeof ENTITY_BEHAVIORS)[number];

export const CUTOFF_DOORS = ["entry", "left", "right", "far", "none"] as const;
export type CutoffDoor = (typeof CUTOFF_DOORS)[number];

export const ENCOUNTER_CARDS = [
  "none",
  "locked_gate_needs_key",
  "power_flicker_event",
  "flooded_slow_zone",
  "safe_alcove",
] as const;
export type EncounterCard = (typeof ENCOUNTER_CARDS)[number];

export const AMBIENCES = ["hum", "drip", "footsteps", "silence", "whisper_static"] as const;
export type Ambience = (typeof AMBIENCES)[number];

export const ENTITY_INTENTS = ["chase", "hide", "flank", "hold", "cut_off", "bait"] as const;
export type EntityIntent = (typeof ENTITY_INTENTS)[number];

export const DECIDE_PURPOSES = ["room", "entity"] as const;
export type DecidePurpose = (typeof DECIDE_PURPOSES)[number];

export const GENERATION_SOURCES = ["jev", "fallback"] as const;
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

export const JEV_MODEL = "jev-1.13.0";
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export const WIN_DEPTH = 14;
export const ROOM_PREFETCH_TIMEOUT_MS = 1100;
export const ENTITY_TICK_MS = 420;
export const ENTITY_TICK_TIMEOUT_MS = 480;

export type JevQuestion =
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions: string;
      criteria: string[];
    }
  | {
      type: "noul";
      instructions: string;
      criteria?: { true: string; false: string };
    };

export type JevQuestions = Record<string, JevQuestion>;

export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type JevScoreAnswer = {
  type: "score";
  score: number;
  confidence?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
};

export type JevNoulAnswer = {
  type: "noul";
  noul: number;
};

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;
export type JevAnswers = Record<string, JevAnswer>;

export type JevRequestBody = {
  model: typeof JEV_MODEL;
  state: unknown;
  questions: JevQuestions;
};

export type JevResponseBody = {
  model?: string;
  answers?: JevAnswers;
  usage?: { input_tokens?: number; output_tokens?: number };
  detail?: unknown;
};

export type CompactRoomMemory = {
  id: string;
  archetype: RoomArchetype;
  lighting: LightingMode;
  lightingMood?: LightingMood;
  lightingStyle?: LightingStyle;
  ambience: Ambience;
  hazard: Hazard;
  encounter?: EncounterCard;
  motif?: LayoutMotif;
  poolcoreVariant?: PoolcoreVariant;
  humidity?: Humidity;
  exitLayout?: ExitLayout;
};

export type DriftProgress = {
  exitChance: number;
  lastEncounter: EncounterCard;
  lastClue: ClueBeat;
  notesFound: number;
  roomsSinceEntity: number;
};

export type CompactGameState = {
  purpose: DecidePurpose;
  depth: number;
  roomsVisited: number;
  recentArchetypes: RoomArchetype[];
  currentRoom: CompactRoomMemory | null;
  player: {
    sanity: number;
    battery: number;
    hasKeycard: boolean;
    noise: number;
    moving: boolean;
  };
  entity: {
    known: boolean;
    sameRoom: boolean;
    hops: number;
    los: boolean;
    lastBehavior: EntityBehavior | null;
    lastIntent: EntityIntent | null;
  };
  portal: {
    id: string;
    fromArchetype: RoomArchetype | null;
    direction: "n" | "s" | "e" | "w";
  } | null;
  progress: DriftProgress;
};

export type RoomDecision = {
  roomArchetype: RoomArchetype;
  size: RoomSize;
  lighting: LightingMode;
  lightingMood: LightingMood;
  lightingStyle: LightingStyle;
  poolcoreVariant: PoolcoreVariant;
  humidity: Humidity;
  soundBed: SoundBed;
  narrativeCrumb: NarrativeCrumb;
  exitLayout: ExitLayout;
  familiarReturn: boolean;
  hazard: Hazard;
  loot: LootType;
  entityPresent: boolean;
  entityPresentNoul: number;
  entityBehavior: EntityBehavior;
  ambience: Ambience;
  fearIntensity: number;
  layoutMotif: LayoutMotif;
  exitCount: ExitCount;
  exitOrientation: ExitOrientation;
  deadEndBait: boolean;
  deadEndBaitNoul: number;
  clueBeat: ClueBeat;
  advancesExit: boolean;
  advancesExitNoul: number;
  encounterCard: EncounterCard;
  cutoffDoor: CutoffDoor;
  soundBait: boolean;
  soundBaitNoul: number;
  entityAggression: number;
  entityPressure: number;
  tunnelLength: TunnelLength;
  tunnelMood: TunnelMood;
};

export type EntityDecision = {
  intent: EntityIntent;
  aggression: number;
  cutoffDoor: CutoffDoor;
  soundBait: boolean;
  soundBaitNoul: number;
};

export type RoomLogEntry = {
  depth: number;
  roomId: string;
  source: GenerationSource;
  decision: RoomDecision;
  latencyMs: number;
};

export type DecideRequest = {
  purpose: DecidePurpose;
  state: CompactGameState;
};

export type DecideResponse<T = RoomDecision | EntityDecision> = {
  source: GenerationSource;
  latencyMs: number;
  warning?: string;
  answers?: JevAnswers;
  decision: T;
  model?: string;
};

export type HealthResponse = {
  ok: true;
  service: "liminal-drift";
  model: typeof JEV_MODEL;
  hasKey: boolean;
  port: number;
};
