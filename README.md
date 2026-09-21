# Liminal Drift / 阈限漂流

A playable Backrooms horror MVP. You walk first-person through yellowed offices. The next room is not scripted: **TypeSafe Jev (System One)** picks a layout, lighting, hazard, loot, ambience, and whether something is using the space. Those answers are mapped onto room templates you can actually walk.

浏览器里可玩的后室恐怖 MVP。你在第一人称里穿过发黄的办公室。下一间房不是写死的剧本：**TypeSafe Jev（System One）** 只在开发者给定的选项里做 Choice / Score / Noul，客户端再把答案映射成房间模板、道具和实体意图。

## Run locally / 本地运行

```bash
cp .env.example .env.local
# optional: put a TypeSafe key in .env.local
# TYPESAFE_API_KEY=...

npm install
npm run dev
```

| Process | URL | Port |
| --- | --- | --- |
| Client (Vite) | http://127.0.0.1:43133 | **43133** |
| Server (Hono) | http://127.0.0.1:43134 | **43134** |

The browser never sees `TYPESAFE_API_KEY`. Vite proxies `/api/*` to the Node server. Without a key, on timeout, or on HTTP error, the game keeps running on **deterministic fallback rooms** and the HUD shows a non-blocking warning.

浏览器永远拿不到密钥。没有 key、超时或接口失败时，用确定性 fallback 房间继续玩，HUD 只给非阻断提示。

## Controls / 操作

| Input | Action |
| --- | --- |
| W A S D / left stick | Walk |
| Mouse / right-side drag | Look (click to lock pointer) |
| Shift / Sneak | Quiet, slower |
| F / LAMP | Flashlight (drains battery) |
| E / USE | Pick up battery, keycard, or note |
| M | Mute fluorescent hum and footsteps |

**Win:** open a rare exit foyer door (keycard, or depth ≥ 12) **or** survive to **depth 14**.  
**Lose:** the entity reaches you. Game Over lists what Jev (or fallback) chose for each room.

胜利：打开罕见出口（钥匙卡，或深度 ≥ 12），或活到深度 14。失败：实体抓到你。结束画面会复盘 Jev / fallback 的选择。

## What Jev decides / Jev 决定什么

Jev does **not** write prose, images, or free-form maps. One `POST https://api.typesafe.ai/v1/systemone` call (`model: jev-1.13.0`) asks several typed questions in parallel. The server maps answers onto concrete templates.

Jev **不**生成文本、图片或自由地图。一次请求并行问多道题，再映射到代码里的房间模板。

### Room prefetch (`purpose: "room"`)

Fired when you approach an unexplored doorway (before you step through). Client waits at most **1100ms**, then falls back. The door shimmers while the answer is in flight.

靠近未探索门洞时预取（进门前）。客户端最多等 1100ms，超时 fallback。等待时门会闪静电。

| Question | Type | Options / scale | Maps to |
| --- | --- | --- | --- |
| `room_archetype` | Choice | `empty_office` `long_hall` `flooded_lobby` `maze_cubicles` `stairwell` `dead_end` `exit_foyer` | Geometry template |
| `size` | Choice | `cramped` `standard` `vast` | Footprint scale |
| `lighting` | Choice | `flickering` `dim` `harsh` `dead` | Fixture intensity / flicker |
| `hazard` | Choice | `none` `puddle_slip` `dark_patch` `buzzing_overload` | Slip, sanity sink, noise |
| `loot_or_clue` | Choice | `none` `battery` `keycard` `note` | Pickup spawn |
| `entity_present` | Noul | yes/no probability | Spawn / involve the entity |
| `entity_behavior` | Choice | `stalk` `ambush` `wander` `absent` | Where it waits or follows |
| `ambience` | Choice | `hum` `drip` `footsteps` `silence` `whisper_static` | Web Audio bed |
| `fear_intensity` | Score | 5 levels, calm → breaking | Sanity drain multiplier |

### Entity tick (`purpose: "entity"`, ~420ms)

Compact vitals only (room id, hops, LOS proxy, fear, noise). Movement is interpolated locally between ticks so the render loop never waits on the network.

只发送压缩状态。两次 tick 之间本地插值移动，主循环不阻塞。

| Question | Type | Maps to |
| --- | --- | --- |
| `intent` | Choice `chase` `hide` `flank` `hold` | Steering target |
| `aggression` | Score 4 levels | Move speed |

State posted to Jev is a JSON summary (`CompactGameState` in `shared/`), never meshes.

## Fallback / 回退

| Condition | Behavior |
| --- | --- |
| Missing `TYPESAFE_API_KEY` | Server returns a seeded room/entity decision immediately |
| Timeout / HTTP / proxy down | Same mapper, HUD warning `Jev unreachable` / `timed out` |
| Invalid Jev field | That field is replaced from the seeded fallback; others still apply |

Seed = `depth | roomsVisited | portalId | recentArchetypes`. Exit foyers stay rare until late depth.

## Repo layout / 目录

```
client/   Vite + TypeScript + Three.js first-person
server/   Hono proxy  GET /api/health  POST /api/jev/decide
          optional POST /api/jev/room  POST /api/jev/entity
shared/   Types, Jev question builders, answer mapping, fallback RNG
```

Root scripts: `npm run dev` (client + server), `npm run dev:client`, `npm run dev:server`.

No auth, no multiplayer, no secrets in git. Copy `.env.example` → `.env.local`.
