import { encounterWarrants, motifHint, readProgress } from "./director.ts";
import type { CompactGameState, EncounterCard, JevQuestions } from "./types.ts";

function stateLine(state: CompactGameState): string {
  const progress = readProgress(state);
  const room = state.currentRoom;
  return [
    `depth=${state.depth}`,
    `visited=${state.roomsVisited}`,
    `recent=[${state.recentArchetypes.join(",") || "none"}]`,
    `here=${room?.archetype ?? "void"}/${room?.lighting ?? "?"}/${room?.ambience ?? "?"}`,
    `sanity=${Math.round(state.player.sanity)}`,
    `battery=${state.player.battery}`,
    `keycard=${state.player.hasKeycard}`,
    `noise=${state.player.noise.toFixed(2)}`,
    `moving=${state.player.moving}`,
    `entity known=${state.entity.known} same=${state.entity.sameRoom} hops=${state.entity.hops} los=${state.entity.los} last=${state.entity.lastBehavior ?? "none"}/${state.entity.lastIntent ?? "none"}`,
    `exitChance=${progress.exitChance.toFixed(2)}`,
    `lastEncounter=${progress.lastEncounter}`,
    `lastClue=${progress.lastClue}`,
    `notes=${progress.notesFound}`,
    `quietRooms=${progress.roomsSinceEntity}`,
    `portal=${state.portal ? `${state.portal.direction}:${state.portal.fromArchetype ?? "?"}` : "none"}`,
  ].join(" · ");
}

export function buildRoomQuestions(state: CompactGameState): JevQuestions {
  const progress = readProgress(state);
  const recent = state.recentArchetypes.join(", ") || "none";
  const snap = stateLine(state);

  const questions: JevQuestions = {
    room_archetype: {
      type: "choice",
      instructions: `Director: pick the next Backrooms chamber. ${snap}. Avoid repeating the last two of [${recent}]. exit_foyer stays rare unless exitChance is high and depth>=7. dead_end is a sudden stop, not a joke. Prefer long_hall / maze_cubicles often enough that the building feels endless.`,
      criteria: {
        empty_office: "Yellow office, wet carpet, a few tired desks",
        long_hall: "Fluorescent corridor that lasts too long",
        flooded_lobby: "Wide lobby, standing water, columns",
        maze_cubicles: "Cubicle warren that folds on itself",
        stairwell: "Concrete landing that does not connect correctly",
        dead_end: "Small stained room; only the way you came is real",
        exit_foyer: "Rare cooler foyer with a possible exit — almost never before depth 8 unless exitChance>0.6",
      },
    },
    size: {
      type: "choice",
      instructions: `How large should this room feel? Depth ${state.depth}, last size pressure via recent=${recent}. Vast rooms need fog; cramped rooms need panic. Do not make every late room vast.`,
      criteria: {
        cramped: "Closer walls, harder to turn",
        standard: "Typical liminal office scale",
        vast: "Wrongly large; the far wall is a rumor",
      },
    },
    lighting: {
      type: "choice",
      instructions: `Fluorescent hierarchy for this room. Current lighting=${state.currentRoom?.lighting ?? "unknown"}, sanity=${Math.round(state.player.sanity)}, battery=${state.player.battery}. Dead/dim punish a dying lamp. Harsh is the classic sick yellow. Flicker if the last rooms were too stable.`,
      criteria: {
        flickering: "Tubes strobe and buzz; hierarchy keeps collapsing",
        dim: "Most lamps dead; flashlight is the key light",
        harsh: "Overbright yellow, hard shadows, no comfort",
        dead: "Almost no fixtures; black eats the edges",
      },
    },
    hazard: {
      type: "choice",
      instructions: `Local trap. Prefer none before depth 3 (depth=${state.depth}). If lastEncounter=${progress.lastEncounter} already flooded or flickered, do not stack the same pressure.`,
      criteria: {
        none: "No extra trap",
        puddle_slip: "Slick water steals footing",
        dark_patch: "A lightless pocket that drains sanity",
        buzzing_overload: "Lights scream and raise noise for the entity",
      },
    },
    layout_motif: {
      type: "choice",
      instructions: `How is furniture and negative space arranged? This is art direction, not decoration spam. Current motif=${state.currentRoom?.motif ?? "none"}. Pick a readable composition. ${motifHint("narrow_throat")} is good after open rooms.`,
      criteria: {
        open_floor: "Almost empty; the carpet is the subject",
        offset_desks: "Desks refuse the grid; office memory",
        pillar_grid: "Columns make sightlines fail",
        broken_symmetry: "One wall, one object, something missing",
        narrow_throat: "A choke just after the door, then a wider gut",
      },
    },
    exit_count: {
      type: "choice",
      instructions: `How many REAL outgoing passages besides the entry? Depth ${state.depth}. One keeps the graph linear. Four is rare and should feel wrong. dead_end archetype should be one. Do not open a maze of doors every time.`,
      criteria: {
        one: "A single real way onward",
        two: "A binary choice",
        three: "A small junction",
        four: "Every wall offers a mouth — use sparingly",
      },
    },
    exit_orientation: {
      type: "choice",
      instructions: `Where do those outgoing doors sit relative to the wall the wanderer entered from (portal dir=${state.portal?.direction ?? "?"})? behind_only means no real forward door (dead-end graph). split is left+right.`,
      criteria: {
        ahead: "Straight on, the obvious hall",
        left: "Favors the left wall, maybe ahead if more exits",
        right: "Favors the right wall",
        behind_only: "No real forward door; only the way back",
        split: "Left and right, corridor politics",
      },
    },
    dead_end_bait: {
      type: "noul",
      instructions: `Should extra doorframes be FAKE — painted halls / sealed throats that look like progress? Use more when the player has been moving confidently (moving=${state.player.moving}, quietRooms=${progress.roomsSinceEntity}) and depth>=3. Almost never on a true exit_foyer.`,
      criteria: {
        true: "Bait frames exist; they do not generate rooms",
        false: "Every visible door that isn't locked is a real graph edge",
      },
    },
    loot_or_clue: {
      type: "choice",
      instructions: `Physical pickup on the floor/desk. battery=${state.player.battery}, hasKeycard=${state.player.hasKeycard}, notesFound=${progress.notesFound}. Batteries if battery<40. Keycards uncommon and useless to spam if they already hold one.`,
      criteria: {
        none: "No handheld object",
        battery: "Spare cells for the lamp",
        keycard: "Faded red card for a real lock",
        note: "A scrap from someone who did not leave",
      },
    },
    clue_beat: {
      type: "choice",
      instructions: `Narrative dressing the player can feel. lastClue=${progress.lastClue}. Do not repeat the last clue. false_exit is a painted EXIT on a sealed door. graffiti is wall writing. radio_static is a dead radio that hisses. none if the room should stay mute.`,
      criteria: {
        none: "No extra story object",
        note: "Guarantee a readable note if loot did not already place one",
        keycard: "Guarantee a keycard if they still need one",
        false_exit: "A lying EXIT sign on a sealed frame",
        graffiti: "Yellowed writing on the wallpaper",
        radio_static: "A radio that should not have a station",
      },
    },
    advances_exit: {
      type: "noul",
      instructions: `Does this room secretly advance the wanderer's chance of a true exit foyer later? Current exitChance=${progress.exitChance.toFixed(2)}, depth=${state.depth}, hasKeycard=${state.player.hasKeycard}. True should be uncommon (more likely after depth 5, after notes, or when last rooms were punishment). False keeps them looping.`,
      criteria: {
        true: "The building blinked; increment exit chance and hint it",
        false: "This room does not move them toward the exit graph",
      },
    },
    entity_present: {
      type: "noul",
      instructions: `Is the entity in or immediately using the next room? ${snap}. Higher if noisy, if quietRooms>=3, or if known and hops were already 1. Lower in the first two rooms.`,
      criteria: {
        true: "It is here or arriving with this room",
        false: "This room is empty of the entity",
      },
    },
    entity_behavior: {
      type: "choice",
      instructions: `If involved, how does it use the space? absent if it is not using the room. mimic_door means it waits in a threshold looking like a wrong door. lastBehavior=${state.entity.lastBehavior ?? "none"}.`,
      criteria: {
        stalk: "Keeps one room behind, matching pace",
        ambush: "Waits in a corner or cubicle of the new room",
        wander: "Drifts, may cross the path",
        mimic_door: "Stands in a doorway, still, until approached",
        absent: "Not using this room",
      },
    },
    entity_aggression: {
      type: "score",
      instructions: `If the entity is involved, how committed is it as the room opens? Sanity=${Math.round(state.player.sanity)}, noise=${state.player.noise}. Low if they are sneaking and quiet. High if the lamp is off or they just made noise.`,
      criteria: [
        "Idle, almost furniture",
        "Watching, matching pace",
        "Hunting as soon as it has a heading",
        "Committed to cutting them off",
      ],
    },
    cutoff_door: {
      type: "choice",
      instructions: `Which door should it prefer to cut off, relative to the player's entry? Use none if it is absent or wandering without a plan. sameRoom=${state.entity.sameRoom}.`,
      criteria: {
        entry: "The door they just used — trap them in",
        left: "The left outgoing",
        right: "The right outgoing",
        far: "The far / ahead door",
        none: "No preferred door",
      },
    },
    sound_bait: {
      type: "noul",
      instructions: `Should the room play a false sound (wet steps / knock) away from the entity to pull the player? Better when entity is present but not LOS, or when baiting a dead-end. Depth ${state.depth}.`,
      criteria: {
        true: "Play a directional lie",
        false: "No false audio lure",
      },
    },
    ambience: {
      type: "choice",
      instructions: `Dominant layered bed. Last ambience=${state.currentRoom?.ambience ?? "unknown"}. Do not pick the same bed three times if recent rooms share it. silence is a weapon after hum. whisper_static pairs with radio clues.`,
      criteria: {
        hum: "Fluorescent 60Hz drone",
        drip: "Water you cannot see",
        footsteps: "Wet steps that are not yours",
        silence: "Wrong quiet; ears ring",
        whisper_static: "Radio hiss with almost-words",
      },
    },
    fear_intensity: {
      type: "score",
      instructions: `Sanity pressure for this room. It will drain sanity, widen/narrow FOV slightly, tint the grade, and raise flashlight battery cost. Current sanity=${Math.round(state.player.sanity)}, lighting will stack. Do not max this every room.`,
      criteria: [
        "Quiet unease, almost mundane",
        "Something is off but survivable",
        "Active dread; lights and sound press in",
        "The space wants them gone",
        "Breaking — sensory collapse",
      ],
    },
  };

  const warrants = encounterWarrants(state);
  if (warrants.length > 1) {
    const criteria: Record<string, string | null> = {};
    for (const card of warrants) {
      criteria[card] = encounterCopy(card);
    }
    questions.encounter_card = {
      type: "choice",
      instructions: `Optional encounter card — ONLY if it will change traversal this room. Warrants: ${warrants.join(", ")}. lastEncounter=${progress.lastEncounter}. Prefer none when the graph is already a bait/dead-end or an exit foyer. Do not repeat ${progress.lastEncounter}. hasKeycard=${state.player.hasKeycard}.`,
      criteria,
    };
  }

  return questions;
}

function encounterCopy(card: EncounterCard): string {
  if (card === "locked_gate_needs_key") return "One real outgoing door is barred until the red card";
  if (card === "power_flicker_event") return "On enter, lights die then stutter back";
  if (card === "flooded_slow_zone") return "The whole floor is slow water";
  if (card === "safe_alcove") return "A recess the entity will not enter; sanity eases";
  return "No special encounter; just the room";
}

export function buildEntityQuestions(state: CompactGameState): JevQuestions {
  const snap = stateLine(state);
  return {
    intent: {
      type: "choice",
      instructions: `Entity director tick. ${snap}. cut_off means occupy the preferred door. bait means hold position and let a false sound pull them. hide if they are staring (los=${state.entity.los}) and still. chase if noisy or already close.`,
      criteria: {
        chase: "Close distance now",
        hide: "Break line of sight, wait next door",
        flank: "Take another door into their room",
        hold: "Freeze and listen",
        cut_off: "Move to the cutoff door and hold it",
        bait: "Stay put; the sound lie does the work",
      },
    },
    aggression: {
      type: "score",
      instructions: `How committed is the hunt this tick? ${snap}. Sneaking+still should lower it. Running or lamp-off in the same room should raise it.`,
      criteria: [
        "Passive, almost disinterested",
        "Watching, matching pace",
        "Hunting, speeds up with a heading",
        "Relentless shortest path",
      ],
    },
    cutoff_door: {
      type: "choice",
      instructions: `Preferred door to occupy or threaten this tick, relative to the player's current room entry. hops=${state.entity.hops}. none if hiding or baiting without a door plan.`,
      criteria: {
        entry: "Their way back",
        left: "Left outgoing",
        right: "Right outgoing",
        far: "Far / ahead",
        none: "No door preference",
      },
    },
    sound_bait: {
      type: "noul",
      instructions: `Play a false footstep/knock away from the entity this tick? Good when intent is bait or hide, or when sameRoom=false. Bad if they are already in melee.`,
      criteria: {
        true: "Lie with sound",
        false: "Stay sonically honest",
      },
    },
  };
}

export function buildQuestions(state: CompactGameState): JevQuestions {
  return state.purpose === "entity" ? buildEntityQuestions(state) : buildRoomQuestions(state);
}
