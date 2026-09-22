import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultProgress, encounterAllowed, encounterWarrants, ensureTraversableDecision, planDoorWalls } from "./director.ts";
import { fallbackEntityDecision, fallbackRoomDecision, mapEntityDecision, mapRoomDecision } from "./decisions.ts";
import { buildQuestions } from "./questions.ts";
import {
  CLUE_BEATS,
  CUTOFF_DOORS,
  ENCOUNTER_CARDS,
  ENTITY_BEHAVIORS,
  ENTITY_INTENTS,
  EXIT_COUNTS,
  EXIT_LAYOUTS,
  HUMIDITIES,
  JEV_MODEL,
  LAYOUT_MOTIFS,
  LIGHTING_MOODS,
  LIGHTING_STYLES,
  NARRATIVE_CRUMBS,
  POOLCORE_VARIANTS,
  ROOM_ARCHETYPES,
  SOUND_BEDS,
  TUNNEL_LENGTHS,
  TUNNEL_MOODS,
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
  assert.ok(early.lighting_mood);
  assert.ok(early.entity_pressure);
  assert.ok(early.tunnel_length);
  assert.ok(early.tunnel_mood);
  assert.ok(early.lighting_style);
  assert.ok(early.exit_layout);
  assert.ok(early.poolcore_variant);
  assert.ok(early.humidity);
  assert.ok(early.sound_bed);
  assert.ok(early.narrative_crumb);
  assert.ok("poolcore" in (early.room_archetype.criteria ?? {}));
  assert.ok("hotel_hall" in (early.room_archetype.criteria ?? {}));
  assert.ok("empty_classroom" in (early.room_archetype.criteria ?? {}));
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
  assert.ok(LIGHTING_MOODS.includes(decision.lightingMood));
  assert.ok(TUNNEL_LENGTHS.includes(decision.tunnelLength));
  assert.ok(TUNNEL_MOODS.includes(decision.tunnelMood));
  assert.ok(LIGHTING_STYLES.includes(decision.lightingStyle));
  assert.ok(EXIT_LAYOUTS.includes(decision.exitLayout));
  assert.ok(POOLCORE_VARIANTS.includes(decision.poolcoreVariant));
  assert.ok(HUMIDITIES.includes(decision.humidity));
  assert.ok(SOUND_BEDS.includes(decision.soundBed));
  assert.ok(NARRATIVE_CRUMBS.includes(decision.narrativeCrumb));
  assert.equal(typeof decision.familiarReturn, "boolean");
  assert.equal(typeof decision.entityPressure, "number");
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
      lighting_mood: { type: "choice", choice: "humid_teal" },
      lighting_style: { type: "choice", choice: "half_dead" },
      exit_layout: { type: "choice", choice: "t_junction" },
      poolcore_variant: { type: "choice", choice: "none" },
      humidity: { type: "choice", choice: "damp" },
      sound_bed: { type: "choice", choice: "drip" },
      narrative_crumb: { type: "choice", choice: "wet_footprints" },
      tunnel_length: { type: "choice", choice: "long" },
      tunnel_mood: { type: "choice", choice: "pool_pipe" },
      entity_pressure: { type: "score", score: 2.4 },
    },
    s,
    fallback,
  );
  assert.equal(mapped.roomArchetype, "maze_cubicles");
  assert.equal(mapped.lightingMood, "humid_teal");
  assert.equal(mapped.lightingStyle, "half_dead");
  assert.equal(mapped.exitLayout, "t_junction");
  assert.equal(mapped.humidity, "damp");
  assert.equal(mapped.soundBed, "drip");
  assert.equal(mapped.narrativeCrumb, "wet_footprints");
  assert.equal(mapped.tunnelLength, "long");
  assert.equal(mapped.tunnelMood, "pool_pipe");
  assert.equal(mapped.entityPressure, 2.4);
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

test("early fallback rooms always keep a real forward exit", () => {
  for (let depth = 1; depth <= 6; depth += 1) {
    for (let i = 0; i < 40; i += 1) {
      const decision = fallbackRoomDecision(state({ depth, roomsVisited: depth }), `p-${depth}-${i}`);
      assert.notEqual(decision.roomArchetype, "dead_end");
      if (depth < 2) assert.equal(decision.deadEndBait, false);
      assert.notEqual(decision.exitOrientation, "behind_only");
      const planned = planDoorWalls("s", decision);
      const forward = planned.real.filter((wall) => wall !== "s");
      assert.ok(forward.length >= 1, `depth ${depth} seed ${i} has no forward door`);
      assert.ok(forward.length >= 2, `depth ${depth} seed ${i} is still a single-portal room`);
      if (decision.deadEndBait) {
        assert.ok(planned.fake.length <= 1);
        assert.ok(forward.length >= 2, `bait stole a real exit at depth ${depth} seed ${i}`);
      }
    }
  }
});

test("poolcore is a legal archetype and fallback can emit it", () => {
  assert.ok(ROOM_ARCHETYPES.includes("poolcore"));
  let seen = false;
  for (let i = 0; i < 80; i += 1) {
    const decision = fallbackRoomDecision(state({ depth: 5, roomsVisited: 5 }), `pool-${i}`);
    if (decision.roomArchetype === "poolcore") {
      seen = true;
      assert.equal(decision.lightingMood, "humid_teal");
      assert.equal(decision.tunnelMood, "pool_pipe");
      break;
    }
  }
  assert.equal(seen, true, "fallback never rolled poolcore in 80 tries");
});

test("two-exit halls also open a side throat, not only ahead", () => {
  const planned = planDoorWalls("s", {
    roomArchetype: "long_hall",
    exitCount: "two",
    exitOrientation: "ahead",
    deadEndBait: false,
  });
  const forward = planned.real.filter((wall) => wall !== "s");
  assert.ok(forward.includes("n"));
  assert.ok(forward.length >= 2);
});

test("deadEndBait paints an extra throat and keeps two real exits", () => {
  const tee = planDoorWalls("s", {
    roomArchetype: "empty_office",
    exitCount: "two",
    exitOrientation: "split",
    deadEndBait: true,
    exitLayout: "t_junction",
  });
  assert.ok(tee.real.filter((wall) => wall !== "s").length >= 2);
  assert.ok(tee.fake.length === 1);
  assert.ok(tee.fake.includes("n"));

  const onlyOne = planDoorWalls("s", {
    roomArchetype: "long_hall",
    exitCount: "one",
    exitOrientation: "ahead",
    deadEndBait: true,
  });
  assert.ok(onlyOne.real.filter((wall) => wall !== "s").length >= 2);
  assert.ok(onlyOne.fake.length <= 1);

  const behind = planDoorWalls("s", {
    roomArchetype: "empty_office",
    exitCount: "one",
    exitOrientation: "behind_only",
    deadEndBait: false,
  });
  assert.ok(behind.real.includes("n"));
});

test("T / cross / loop layouts stay multi-exit graphs", () => {
  const tee = planDoorWalls("s", {
    roomArchetype: "hotel_hall",
    exitCount: "two",
    exitOrientation: "split",
    deadEndBait: false,
    exitLayout: "t_junction",
  });
  assert.deepEqual(new Set(tee.real.filter((wall) => wall !== "s")), new Set(["e", "w"]));

  const cross = planDoorWalls("s", {
    roomArchetype: "empty_office",
    exitCount: "three",
    exitOrientation: "split",
    deadEndBait: false,
    exitLayout: "cross",
  });
  assert.equal(cross.real.filter((wall) => wall !== "s").length, 3);

  const loop = planDoorWalls("s", {
    roomArchetype: "parking_ramp",
    exitCount: "two",
    exitOrientation: "left",
    deadEndBait: true,
    exitLayout: "loop_side",
  });
  assert.ok(loop.real.filter((wall) => wall !== "s").length >= 2);
});

test("ensureTraversableDecision strips early dead-ends from Jev answers", () => {
  const s = state({ depth: 1, roomsVisited: 1 });
  const fallback = fallbackRoomDecision(s, "p3");
  const mapped = mapRoomDecision(
    {
      room_archetype: { type: "choice", choice: "dead_end" },
      dead_end_bait: { type: "noul", noul: 0.95 },
      exit_orientation: { type: "choice", choice: "behind_only" },
    },
    s,
    fallback,
  );
  assert.notEqual(mapped.roomArchetype, "dead_end");
  assert.equal(mapped.deadEndBait, false);
  const planned = planDoorWalls("s", mapped);
  assert.ok(planned.real.some((wall) => wall !== "s"));
  const late = ensureTraversableDecision(
    { ...mapped, roomArchetype: "dead_end", deadEndBait: true, exitOrientation: "behind_only" },
    10,
  );
  assert.equal(late.roomArchetype, "dead_end");
});

test("fallback can emit a familiar same-kind return", () => {
  let seen = false;
  for (let i = 0; i < 80; i += 1) {
    const decision = fallbackRoomDecision(state({ depth: 5, roomsVisited: 5 }), `fam-${i}`);
    if (decision.familiarReturn) {
      seen = true;
      assert.ok(["empty_office", "long_hall"].includes(decision.roomArchetype));
      break;
    }
  }
  assert.equal(seen, true, "fallback never marked a familiar return");
});

test("poolcore fallback leans wet and empty, not a jump scare", () => {
  let seen = false;
  for (let i = 0; i < 100; i += 1) {
    const decision = fallbackRoomDecision(state({ depth: 6, roomsVisited: 6 }), `wet-${i}`);
    if (decision.roomArchetype === "poolcore") {
      seen = true;
      assert.notEqual(decision.poolcoreVariant, "none");
      assert.ok(decision.humidity === "damp" || decision.humidity === "heavy");
      assert.ok(["drip", "silence_ring", "hvac_hum", "distant_footsteps"].includes(decision.soundBed));
      break;
    }
  }
  assert.equal(seen, true);
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
