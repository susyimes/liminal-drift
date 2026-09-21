import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultProgress, encounterAllowed, encounterWarrants } from "./director.ts";
import { fallbackEntityDecision, fallbackRoomDecision, mapEntityDecision, mapRoomDecision } from "./decisions.ts";
import { buildQuestions } from "./questions.ts";
import {
  CLUE_BEATS,
  CUTOFF_DOORS,
  ENCOUNTER_CARDS,
  ENTITY_BEHAVIORS,
  ENTITY_INTENTS,
  EXIT_COUNTS,
  JEV_MODEL,
  LAYOUT_MOTIFS,
  type CompactGameState,
} from "./types.ts";

function state(over: Partial<CompactGameState> = {}): CompactGameState {
  return {
    purpose: "room",
    depth: 6,
    roomsVisited: 6,
    recentArchetypes: ["empty_office", "long_hall"],
    currentRoom: {
      id: "r1",
      archetype: "empty_office",
      lighting: "flickering",
      ambience: "hum",
      hazard: "none",
      encounter: "none",
      motif: "offset_desks",
    },
    player: { sanity: 48, battery: 62, hasKeycard: false, noise: 0.2, moving: true },
    entity: {
      known: true,
      sameRoom: false,
      hops: 2,
      los: false,
      lastBehavior: "stalk",
      lastIntent: "hold",
    },
    portal: { id: "d-n", fromArchetype: "empty_office", direction: "n" },
    progress: defaultProgress(),
    ...over,
  };
}

test("jev model stays pinned", () => {
  assert.equal(JEV_MODEL, "jev-1.13.0");
});

test("room questions are a fat systemone set and encounter is optional", () => {
  const early = buildQuestions(
    state({
      depth: 1,
      roomsVisited: 1,
      entity: {
        known: false,
        sameRoom: false,
        hops: 8,
        los: false,
        lastBehavior: null,
        lastIntent: null,
      },
    }),
  );
  assert.ok(early.room_archetype);
  assert.ok(early.layout_motif);
  assert.ok(early.fear_intensity);
  assert.ok(early.advances_exit);
  assert.equal(early.encounter_card, undefined);

  const late = buildQuestions(state({ depth: 8, roomsVisited: 8, player: { sanity: 70, battery: 20, hasKeycard: false, noise: 0.6, moving: true } }));
  assert.ok(late.encounter_card);
  const keys = Object.keys(late.encounter_card.criteria ?? {});
  assert.ok(keys.includes("none"));
  for (const key of keys) assert.ok(ENCOUNTER_CARDS.includes(key as (typeof ENCOUNTER_CARDS)[number]));
});

test("fallback rooms fill every director field with legal enums", () => {
  const decision = fallbackRoomDecision(state(), "portal-a");
  assert.ok(LAYOUT_MOTIFS.includes(decision.layoutMotif));
  assert.ok(EXIT_COUNTS.includes(decision.exitCount));
  assert.ok(CLUE_BEATS.includes(decision.clueBeat));
  assert.ok(ENTITY_BEHAVIORS.includes(decision.entityBehavior));
  assert.ok(CUTOFF_DOORS.includes(decision.cutoffDoor));
  assert.ok(encounterAllowed(state(), decision.encounterCard) || decision.encounterCard === "none");
  assert.equal(typeof decision.advancesExit, "boolean");
  assert.equal(typeof decision.deadEndBait, "boolean");
});

test("mapRoomDecision uses fallback when answers are empty and applies valid answers", () => {
  const s = state();
  const fallback = fallbackRoomDecision(s, "p");
  const empty = mapRoomDecision(undefined, s, fallback);
  assert.deepEqual(empty, fallback);

  const mapped = mapRoomDecision(
    {
      room_archetype: { type: "choice", choice: "maze_cubicles" },
      layout_motif: { type: "choice", choice: "narrow_throat" },
      clue_beat: { type: "choice", choice: "graffiti" },
      entity_present: { type: "noul", noul: 0.9 },
      entity_behavior: { type: "choice", choice: "mimic_door" },
      advances_exit: { type: "noul", noul: 0.8 },
      dead_end_bait: { type: "noul", noul: 0.1 },
      encounter_card: { type: "choice", choice: "safe_alcove" },
      fear_intensity: { type: "score", score: 2.2 },
    },
    s,
    fallback,
  );
  assert.equal(mapped.roomArchetype, "maze_cubicles");
  assert.equal(mapped.layoutMotif, "narrow_throat");
  assert.equal(mapped.clueBeat, "graffiti");
  assert.equal(mapped.entityBehavior, "mimic_door");
  assert.equal(mapped.entityPresent, true);
  assert.equal(mapped.advancesExit, true);
  assert.equal(mapped.deadEndBait, false);
  assert.equal(mapped.fearIntensity, 2.2);
  assert.ok(encounterWarrants(s).includes(mapped.encounterCard));
});

test("unwarranted encounter cards collapse to none", () => {
  const s = state({ depth: 1, roomsVisited: 1 });
  const fallback = fallbackRoomDecision(s, "p2");
  const mapped = mapRoomDecision(
    { encounter_card: { type: "choice", choice: "locked_gate_needs_key" } },
    s,
    { ...fallback, encounterCard: "none" },
  );
  assert.equal(mapped.encounterCard, "none");
});

test("entity fallback and mapping include cutoff + bait", () => {
  const s = state({ purpose: "entity" });
  const fallback = fallbackEntityDecision(s);
  assert.ok(ENTITY_INTENTS.includes(fallback.intent));
  assert.ok(CUTOFF_DOORS.includes(fallback.cutoffDoor));
  const mapped = mapEntityDecision(
    {
      intent: { type: "choice", choice: "cut_off" },
      aggression: { type: "score", score: 2.4 },
      cutoff_door: { type: "choice", choice: "entry" },
      sound_bait: { type: "noul", noul: 0.9 },
    },
    fallback,
  );
  assert.equal(mapped.intent, "cut_off");
  assert.equal(mapped.cutoffDoor, "entry");
  assert.equal(mapped.soundBait, true);
  assert.equal(mapped.aggression, 2.4);
});
