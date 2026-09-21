export type DoorGeneration = "idle" | "pending" | "ready";

export function initialDoorGeneration(isEntry: boolean, roomId: string): DoorGeneration {
  // The start room has no parent. Marking its "entry" ready-without-decision
  // left that doorway permanently waiting / unsealed into the void.
  return isEntry && roomId !== "start" ? "ready" : "idle";
}

export function doorAwaitingDecision(door: {
  connectedRoomId: string | null;
  isExit?: boolean;
  fake?: boolean;
  isFalseExit?: boolean;
  generation: DoorGeneration;
  decision: unknown;
}): boolean {
  if (door.connectedRoomId || door.isExit || door.fake || door.isFalseExit) return false;
  return door.generation === "idle" || (door.generation === "ready" && !door.decision);
}

export function doorGenerationTimedOut(pendingSince: number, now: number, timeoutMs: number): boolean {
  return pendingSince > 0 && now - pendingSince > timeoutMs + 80;
}
