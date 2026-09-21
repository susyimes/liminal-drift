import type { CompactGameState, JevQuestions } from "./types.ts";

export function buildRoomQuestions(state: CompactGameState): JevQuestions {
  const recent = state.recentArchetypes.join(", ") || "none";
  return {
    room_archetype: {
      type: "choice",
      instructions: `Choose the next Backrooms room the wanderer steps into. Recent rooms: ${recent}. Depth ${state.depth}. Avoid repeating the last two rooms. exit_foyer must stay rare (almost never before depth 8; still uncommon after). dead_end is for sudden stops. long_hall and maze_cubicles should appear often enough to feel endless.`,
      criteria: {
        empty_office: "Open yellow office with a few desks and wet carpet",
        long_hall: "Oppressive fluorescent corridor that stretches too far",
        flooded_lobby: "Wide lobby with standing water and columns",
        maze_cubicles: "Cubicle warren that folds back on itself",
        stairwell: "Concrete stair landing that does not connect correctly",
        dead_end: "Small stained room with only the way you came",
        exit_foyer: "Rare cooler foyer with a possible exit door — use sparingly",
      },
    },
    size: {
      type: "choice",
      instructions: "How large should this room feel relative to its archetype?",
      criteria: {
        cramped: "Closer walls, harder to turn, more panic",
        standard: "Typical liminal scale",
        vast: "Wrongly large for an office, fog eats the far wall",
      },
    },
    lighting: {
      type: "choice",
      instructions: "Pick the fluorescent lighting mood. Dead or flickering raises fear.",
      criteria: {
        flickering: "Tubes strobe and buzz",
        dim: "Most lamps are dead; flashlight needed",
        harsh: "Overbright sick yellow, hard shadows",
        dead: "Almost no fixtures left, black at the edges",
      },
    },
    hazard: {
      type: "choice",
      instructions: "Optional local hazard. Prefer none early (depth < 3).",
      criteria: {
        none: "No extra trap",
        puddle_slip: "Slick water that steals footing",
        dark_patch: "A lightless pocket that drains sanity",
        buzzing_overload: "Lights scream and draw the entity",
      },
    },
    loot_or_clue: {
      type: "choice",
      instructions: `Maybe place a useful object. Player battery=${state.player.battery}, hasKeycard=${state.player.hasKeycard}. Keycards should be uncommon. Batteries more likely if battery < 40.`,
      criteria: {
        none: "Empty",
        battery: "Spare flashlight cells",
        keycard: "Faded red access card for an exit lock",
        note: "A scrap of writing from someone who did not leave",
      },
    },
    entity_present: {
      type: "noul",
      instructions: `Is the following thing in or immediately using this next room? Depth ${state.depth}, already known=${state.entity.known}, player noise=${state.player.noise}.`,
      criteria: {
        true: "It is here or arriving with this room",
        false: "This room is empty of the entity",
      },
    },
    entity_behavior: {
      type: "choice",
      instructions: "If the entity is involved with this room, how does it use the space? Choose absent if it is not using the room.",
      criteria: {
        stalk: "Keeps one room behind, matching the player's pace",
        ambush: "Waits in a corner or cubicle of the new room",
        wander: "Drifts without a plan, may cross the player's path",
        absent: "Not using this room",
      },
    },
    ambience: {
      type: "choice",
      instructions: "Dominant sound bed for the room.",
      criteria: {
        hum: "Fluorescent 60Hz drone",
        drip: "Water hitting carpet somewhere you cannot see",
        footsteps: "Wet steps that are not yours",
        silence: "Wrong quiet, ears ring",
        whisper_static: "Radio hiss with almost-words",
      },
    },
    fear_intensity: {
      type: "score",
      instructions: "How hard should this room lean on the wanderer's sanity?",
      criteria: [
        "Quiet unease, almost mundane",
        "Something is off but survivable",
        "Active dread, lights and sound press in",
        "The space wants the player gone",
        "Breaking — entity pressure and sensory collapse",
      ],
    },
  };
}

export function buildEntityQuestions(state: CompactGameState): JevQuestions {
  return {
    intent: {
      type: "choice",
      instructions: `Choose the entity's next movement intent. Player room=${state.currentRoom?.id ?? "?"}, sameRoom=${state.entity.sameRoom}, hops=${state.entity.hops}, los=${state.entity.los}, sanity=${state.player.sanity}, noise=${state.player.noise}, moving=${state.player.moving}.`,
      criteria: {
        chase: "Close distance now; player is exposed or noisy",
        hide: "Break line of sight, wait in an adjacent room",
        flank: "Take another door into the player's room",
        hold: "Freeze and listen",
      },
    },
    aggression: {
      type: "score",
      instructions: "How committed is the hunt this tick?",
      criteria: [
        "Passive, almost disinterested",
        "Watching, matching pace",
        "Hunting, speeds up when it has a heading",
        "Relentless, will take the shortest path",
      ],
    },
  };
}

export function buildQuestions(state: CompactGameState): JevQuestions {
  return state.purpose === "entity" ? buildEntityQuestions(state) : buildRoomQuestions(state);
}
