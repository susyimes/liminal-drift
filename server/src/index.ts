import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITY_TICK_TIMEOUT_MS,
  JEV_MODEL,
  ROOM_PREFETCH_TIMEOUT_MS,
  type CompactGameState,
  type DecideRequest,
  type HealthResponse,
} from "@liminal/shared";
import { decideEntity, decideRoom, hasApiKey } from "./jev.ts";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: resolve(rootDir, ".env.local") });
loadEnv({ path: resolve(rootDir, ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const PORT = Number(process.env.PORT ?? 43134);

const app = new Hono();
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    ok: true,
    service: "liminal-drift",
    model: JEV_MODEL,
    hasKey: hasApiKey(),
    port: PORT,
  };
  return c.json(body);
});

app.post("/api/jev/decide", async (c) => {
  let body: DecideRequest;
  try {
    body = (await c.req.json()) as DecideRequest;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (body?.purpose !== "room" && body?.purpose !== "entity") {
    return c.json({ error: "invalid_purpose" }, 400);
  }
  if (!body.state || typeof body.state !== "object") {
    return c.json({ error: "invalid_state" }, 400);
  }

  const state: CompactGameState = { ...body.state, purpose: body.purpose };
  if (body.purpose === "room") {
    return c.json(await decideRoom(state, ROOM_PREFETCH_TIMEOUT_MS));
  }
  return c.json(await decideEntity(state, ENTITY_TICK_TIMEOUT_MS));
});

app.post("/api/jev/room", async (c) => {
  const body = (await c.req.json()) as DecideRequest;
  const state: CompactGameState = { ...body.state, purpose: "room" };
  return c.json(await decideRoom(state, ROOM_PREFETCH_TIMEOUT_MS));
});

app.post("/api/jev/entity", async (c) => {
  const body = (await c.req.json()) as DecideRequest;
  const state: CompactGameState = { ...body.state, purpose: "entity" };
  return c.json(await decideEntity(state, ENTITY_TICK_TIMEOUT_MS));
});

console.log(`[liminal-drift] server http://127.0.0.1:${PORT}  hasKey=${hasApiKey()}  model=${JEV_MODEL}`);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });
