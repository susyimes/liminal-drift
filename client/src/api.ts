import {
  fallbackEntityDecision,
  fallbackRoomDecision,
  type CompactGameState,
  type DecideResponse,
  type EntityDecision,
  type HealthResponse,
  type RoomDecision,
} from "@liminal/shared";

async function postDecide<T>(
  purpose: "room" | "entity",
  state: CompactGameState,
  timeoutMs: number,
): Promise<DecideResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    watchdogTimer = setTimeout(() => reject(new Error("decide_timeout")), timeoutMs + 60);
  });
  try {
    const request = (async () => {
      const response = await fetch("/api/jev/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, state: { ...state, purpose } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`proxy_${response.status}`);
      const payload = (await response.json()) as DecideResponse<T>;
      if (!payload || typeof payload !== "object" || !payload.decision) {
        throw new Error("invalid_decision");
      }
      return payload;
    })();
    return await Promise.race([request, watchdog]);
  } finally {
    clearTimeout(timer);
    if (watchdogTimer) clearTimeout(watchdogTimer);
  }
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function requestRoom(
  state: CompactGameState,
  timeoutMs: number,
): Promise<DecideResponse<RoomDecision>> {
  const fallback = fallbackRoomDecision(state, state.portal?.id ?? `d${state.depth}`);
  try {
    return await postDecide<RoomDecision>("room", state, timeoutMs);
  } catch {
    return {
      source: "fallback",
      latencyMs: timeoutMs,
      warning: "Jev proxy unreachable — using fallback generation.",
      decision: fallback,
    };
  }
}

export async function requestEntity(
  state: CompactGameState,
  timeoutMs: number,
): Promise<DecideResponse<EntityDecision>> {
  const fallback = fallbackEntityDecision(state);
  try {
    return await postDecide<EntityDecision>("entity", state, timeoutMs);
  } catch {
    return {
      source: "fallback",
      latencyMs: timeoutMs,
      warning: "Jev proxy unreachable — entity using fallback.",
      decision: fallback,
    };
  }
}
