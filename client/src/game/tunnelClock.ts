import { tunnelLengthFor } from "./directorFeel.ts";
import { TUNNEL_EXIT_T } from "./transit.ts";

/** Inclusive walk-only band. Hold, generation wait, and settle are outside this. */
export const TUNNEL_WALK_MS_MIN = 800;
export const TUNNEL_WALK_MS_MAX = 1400;

/** Destination-tuned targets. Yellow offices sit short; poolcore sits long. */
export const TUNNEL_WALK_MS = {
  short: 880,
  medium: 1120,
  long: 1340,
} as const;

export type TunnelWalkKind = keyof typeof TUNNEL_WALK_MS;

export type TunnelClockPhase = "hold" | "wait" | "walk";

export type TunnelClockReport = {
  /** Wall-clock ms of the throat walk only. */
  walkMs: number;
  holdMs: number;
  waitMs: number;
  length: TunnelWalkKind;
  dest: string | null;
  source: string;
};

export function tunnelWalkKind(
  dest?: string | null,
  requested?: TunnelWalkKind,
): TunnelWalkKind {
  return tunnelLengthFor(dest, requested);
}

export function tunnelWalkDurationMs(
  dest?: string | null,
  requested?: TunnelWalkKind,
): number {
  return TUNNEL_WALK_MS[tunnelWalkKind(dest, requested)];
}

/**
 * Hold is the 0.5s jamb beat. Wait is dest-not-ready (Jev / fallback).
 * Walk starts only after both are clear so generation lag cannot stretch it.
 */
export function tunnelClockPhase(holdRemain: number, destReady: boolean): TunnelClockPhase {
  if (holdRemain > 0) return "hold";
  if (!destReady) return "wait";
  return "walk";
}

/** EaseInOut on normalized *time* so stride feel does not change duration. */
export function tunnelWalkEase(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

export function tunnelWalkU(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

export function tunnelWalkProgress(startProgress: number, u: number, exitProgress = TUNNEL_EXIT_T): number {
  return startProgress + (exitProgress - startProgress) * tunnelWalkEase(u);
}

export function walkMsInBand(walkMs: number): boolean {
  return walkMs >= TUNNEL_WALK_MS_MIN && walkMs <= TUNNEL_WALK_MS_MAX;
}

/**
 * `armGenerationHold(ms)` is a duration for the *next* Wait phase.
 * Start the clock when the throat wait begins, not when arm() is called —
 * otherwise stepUnexploredDoor's prefetch loop can burn the deadline and
 * lastTunnelReport().waitMs stays 0.
 */
export function beginArmedWait(now: number, pendingMs: number): { holdUntil: number; waitStartedAt: number } {
  const ms = Math.max(0, pendingMs);
  if (ms <= 0) return { holdUntil: 0, waitStartedAt: 0 };
  return { holdUntil: now + ms, waitStartedAt: now };
}

export function tunnelWaitMs(waitStartedAt: number, walkStartedAt: number): number {
  if (waitStartedAt <= 0 || walkStartedAt <= 0) return 0;
  return Math.round(Math.max(0, walkStartedAt - waitStartedAt));
}

/**
 * When armed, Wait is exactly the arm. Dest / Jev / prefetch latency must
 * not add on top (playtest hook: waitMs === armedMs ± 100).
 */
export function waitMsForCrossing(opts: { armedMs: number; destReadyMs?: number }): number {
  if (opts.armedMs > 0) return Math.max(0, Math.round(opts.armedMs));
  return Math.max(0, Math.round(opts.destReadyMs ?? 0));
}

export function armedWaitInSlop(waitMs: number, armedMs: number, slop = 100): boolean {
  return Math.abs(waitMs - armedMs) <= slop;
}
