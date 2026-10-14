import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  detectLocale, loadLocale, setLocale, getLocale, t, messages, message, renderCopy,
  LANGUAGE_STORAGE_KEY, onLocaleChange,
} from "../client/src/i18n.ts";
import { DECISION_LABELS, decisionLabel, FLAVOR_ZH, flavorText, roomDescription, generationWarning, depthHudText } from "../client/src/game/copy.ts";
import { ROOM_ARCHETYPES, TUNNEL_MOODS, LIGHTING_MODES, LIGHTING_STYLES, LIGHTING_MOODS,
  POOLCORE_VARIANTS, EXIT_LAYOUTS, HUMIDITIES, SOUND_BEDS, NARRATIVE_CRUMBS, HAZARDS,
  ENTITY_BEHAVIORS, AMBIENCES, TUNNEL_LENGTHS, fallbackRoomDecision, notesFor, graffitiFor, defaultProgress,
  type CompactGameState } from "../shared/src/index.ts";

test("locale selection respects preference order, variants and fallback", () => {
  assert.equal(detectLocale(["zh-TW", "en-US"]), "zh-CN");
  assert.equal(detectLocale(["en-US", "zh-CN"]), "en");
  assert.equal(detectLocale(["fr-FR", "zh-CN", "en-US"]), "zh-CN");
  assert.equal(detectLocale([], "ZH-hans"), "zh-CN");
  assert.equal(detectLocale([], "ja"), "en");
  assert.equal(detectLocale(), "en");
});

test("saved choices override browser language; denied storage stays usable", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  setLocale("zh-CN", storage);
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "zh-CN");
  assert.equal(loadLocale(storage, ["en-US"]), "zh-CN");
  values.set(LANGUAGE_STORAGE_KEY, "garbage");
  assert.equal(loadLocale(storage, ["en-US"]), "en");
  const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(loadLocale(blocked, ["zh-CN"]), "zh-CN");
  assert.doesNotThrow(() => setLocale("en", blocked));
  assert.equal(getLocale(), "en");
  assert.equal(loadLocale(undefined, ["en-US"]), "en");
});

test("existing copy references update on language switch without recreating state", () => {
  const savedStatus = message("death");
  let refreshes = 0;
  const unsubscribe = onLocaleChange(() => { refreshes += 1; });
  setLocale("zh-CN");
  assert.equal(renderCopy(savedStatus), "它悄无声息地走完了最后几步。");
  assert.equal(depthHudText(7), "深度 7");
  setLocale("en");
  assert.equal(renderCopy(savedStatus), "It closed the last few steps without a sound.");
  assert.equal(refreshes, 2);
  unsubscribe();
});

test("every static UI and rendered decision label has both translations", () => {
  for (const pair of Object.values(messages)) assert.ok(pair[0].trim() && pair[1].trim());
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(match[1]! in messages, match[1]);
  for (const id of [...ROOM_ARCHETYPES, ...TUNNEL_MOODS, ...LIGHTING_MODES, ...LIGHTING_STYLES,
    ...LIGHTING_MOODS, ...POOLCORE_VARIANTS, ...EXIT_LAYOUTS, ...HUMIDITIES, ...SOUND_BEDS,
    ...NARRATIVE_CRUMBS, ...HAZARDS, ...ENTITY_BEHAVIORS, ...AMBIENCES, ...TUNNEL_LENGTHS]) {
    assert.ok(DECISION_LABELS[id], id);
    assert.match(decisionLabel(id, "zh-CN"), /\p{Script=Han}/u, id);
    assert.doesNotMatch(decisionLabel(id, "en"), /\p{Script=Han}/u, id);
  }
});

test("seeded notes and graffiti preserve canonical identity while localizing presentation", () => {
  const notes = new Set<string>(), graffiti = new Set<string>();
  for (let i = 0; i < 1000; i += 1) {
    notes.add(notesFor(String(i))); graffiti.add(graffitiFor(String(i)));
  }
  assert.equal(notes.size, 12); assert.equal(graffiti.size, 8);
  for (const canonical of [...notes, ...graffiti]) {
    assert.ok(FLAVOR_ZH[canonical], canonical);
    assert.equal(flavorText(canonical, "en"), canonical);
    assert.match(flavorText(canonical, "zh-CN"), /\p{Script=Han}/u);
  }
});

test("generated decision descriptions render coherently in each language without mutations", () => {
  const state: CompactGameState = { purpose: "room", depth: 4, roomsVisited: 4, recentArchetypes: [], currentRoom: null,
    player: { sanity: 20, battery: 70, hasKeycard: false, noise: 0, moving: false },
    entity: { known: false, sameRoom: false, hops: 4, los: false, lastBehavior: null, lastIntent: null },
    portal: null, progress: defaultProgress() };
  const decision = fallbackRoomDecision(state, "locale-test");
  const canonical = JSON.stringify(decision);
  setLocale("zh-CN");
  assert.match(roomDescription(decision), /房间逐渐安定/);
  assert.doesNotMatch(roomDescription(decision), /empty_office|The room|Hazard/);
  assert.match(generationWarning("Jev HTTP error (403) — fallback.")!, /本地生成/);
  setLocale("en");
  assert.match(roomDescription(decision), /The room settles/);
  assert.doesNotMatch(roomDescription(decision), /\p{Script=Han}/u);
  assert.match(generationWarning("Generation timed out — using fallback.")!, /took too long/);
  assert.equal(generationWarning(null), null);
  assert.equal(JSON.stringify(decision), canonical);
  assert.equal(t("title"), "Liminal Drift");
});


test("HUD refresh localizes an expired opening hint during its visible fade", async () => {
  const { Ui } = await import("../client/src/ui.ts");
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const nodes = new Map<string, { textContent: string; style: { width: string }; classList: { add: (...values: string[]) => void; remove: (...values: string[]) => void; toggle: (value: string, enabled: boolean) => void } }>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: "", style: { width: "" }, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(id)!;
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { lang: "en" }, getElementById: node } });
  try {
    const ui = Object.create(Ui.prototype) as InstanceType<typeof Ui>;
    const snapshot = { sanity: 100, battery: 100, depthLabel: "DEPTH 1", vibe: "Empty office", hasKeycard: false,
      status: "", hint: t("opening", "en"), source: "fallback", latencyMs: 0, jevCalls: 0, fallbackCalls: 0,
      warning: "old warning", toast: "old pickup" } as Parameters<Ui["paint"]>[0];
    setLocale("en"); ui.paint(snapshot);
    assert.equal(node("open-hint").textContent, "Walk ahead. Find a door.");
    setLocale("zh-CN"); ui.paint({ ...snapshot, hint: null, toast: null, warning: null });
    assert.equal(node("open-hint").textContent, "往前走。找一扇门。");
    assert.equal(node("pickup-toast").textContent, "");
    assert.equal(node("warn-line").textContent, "");
  } finally {
    setLocale("en");
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
