import {
  JEV_ENDPOINT,
  JEV_MODEL,
  buildQuestions,
  fallbackEntityDecision,
  fallbackRoomDecision,
  mapEntityDecision,
  mapRoomDecision,
  type CompactGameState,
  type DecideResponse,
  type EntityDecision,
  type JevRequestBody,
  type JevResponseBody,
  type RoomDecision,
} from "@liminal/shared";

export function hasApiKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export function missingKeyWarning(): string {
  return "No TYPESAFE_API_KEY — using deterministic fallback rooms.";
}

async function callTypeSafe(
  state: CompactGameState,
  timeoutMs: number,
): Promise<{ body: JevResponseBody; latencyMs: number }> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    const err = new Error("missing_key");
    err.name = "missing_key";
    throw err;
  }

  const payload: JevRequestBody = {
    model: JEV_MODEL,
    state,
    questions: buildQuestions(state),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const body = (await response.json().catch(() => ({}))) as JevResponseBody;
    if (!response.ok) {
      const err = new Error(`http_${response.status}`);
      err.name = "http_error";
      throw err;
    }
    if (!body.answers) {
      const err = new Error("empty_answers");
      err.name = "empty_answers";
      throw err;
    }
    return { body, latencyMs };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const err = new Error("timeout");
      err.name = "timeout";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function warningFor(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "missing_key" || error.message === "missing_key") return missingKeyWarning();
    if (error.name === "timeout" || error.message === "timeout") {
      return "Jev timed out — using fallback generation.";
    }
    if (error.name === "http_error") return `Jev HTTP error (${error.message}) — fallback.`;
  }
  return "Jev unreachable — using fallback generation.";
}

export async function decideRoom(
  state: CompactGameState,
  timeoutMs: number,
): Promise<DecideResponse<RoomDecision>> {
  const fallback = fallbackRoomDecision(state, state.portal?.id ?? `d${state.depth}`);
  if (!hasApiKey()) {
    return { source: "fallback", latencyMs: 0, warning: missingKeyWarning(), decision: fallback };
  }
  try {
    const { body, latencyMs } = await callTypeSafe(state, timeoutMs);
    return {
      source: "jev",
      latencyMs,
      answers: body.answers,
      model: body.model ?? JEV_MODEL,
      decision: mapRoomDecision(body.answers, state, fallback),
    };
  } catch (error) {
    return { source: "fallback", latencyMs: timeoutMs, warning: warningFor(error), decision: fallback };
  }
}

export async function decideEntity(
  state: CompactGameState,
  timeoutMs: number,
): Promise<DecideResponse<EntityDecision>> {
  const fallback = fallbackEntityDecision(state);
  if (!hasApiKey()) {
    return { source: "fallback", latencyMs: 0, warning: missingKeyWarning(), decision: fallback };
  }
  try {
    const { body, latencyMs } = await callTypeSafe(state, timeoutMs);
    return {
      source: "jev",
      latencyMs,
      answers: body.answers,
      model: body.model ?? JEV_MODEL,
      decision: mapEntityDecision(body.answers, fallback),
    };
  } catch (error) {
    return { source: "fallback", latencyMs: timeoutMs, warning: warningFor(error), decision: fallback };
  }
}
