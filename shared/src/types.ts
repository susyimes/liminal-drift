export const ROOM_ARCHETYPES = [
  "empty_office",
  "long_hall",
  "flooded_lobby",
  "maze_cubicles",
  "stairwell",
  "dead_end",
  "exit_foyer",
] as const;

export type RoomArchetype = (typeof ROOM_ARCHETYPES)[number];

export const ROOM_SIZES = ["cramped", "standard", "vast"] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];

export const LIGHTING_MODES = ["flickering", "dim", "harsh", "dead"] as const;
export type LightingMode = (typeof LIGHTING_MODES)[number];

export const HAZARDS = ["none", "puddle_slip", "dark_patch", "buzzing_overload"] as const;
export type Hazard = (typeof HAZARDS)[number];

export const LOOT_TYPES = ["none", "battery", "keycard", "note"] as const;
export type LootType = (typeof LOOT_TYPES)[number];

export const ENTITY_BEHAVIORS = ["stalk", "ambush", "wander", "absent"] as const;
export type EntityBehavior = (typeof ENTITY_BEHAVIORS)[number];

export const AMBIENCES = ["hum", "drip", "footsteps", "silence", "whisper_static"] as const;
export type Ambience = (typeof AMBIENCES)[number];

export const ENTITY_INTENTS = ["chase", "hide", "flank", "hold"] as const;
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
  ambience: Ambience;
  hazard: Hazard;
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
};

export type RoomDecision = {
  roomArchetype: RoomArchetype;
  size: RoomSize;
  lighting: LightingMode;
  hazard: Hazard;
  loot: LootType;
  entityPresent: boolean;
  entityPresentNoul: number;
  entityBehavior: EntityBehavior;
  ambience: Ambience;
  fearIntensity: number;
};

export type EntityDecision = {
  intent: EntityIntent;
  aggression: number;
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
