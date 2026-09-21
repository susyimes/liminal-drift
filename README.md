# Liminal Drift / 阈限漂流

A playable Backrooms horror MVP. You walk first-person through yellowed offices. The next room is not scripted: **TypeSafe Jev (System One)** runs one fat `jev-1.13.0` call of parallel Choice / Score / Noul questions. Those answers become rooms you can walk, sounds you can hear, and an entity that can cut you off.

浏览器里可玩的后室恐怖 MVP。下一间房不是写死的剧本：**TypeSafe Jev（System One，`jev-1.13.0`）** 在开发者给定的选项里做并行 Choice / Score / Noul，客户端再映射成几何、音频、遭遇卡和实体导演。

Craft note: atmosphere, lighting hierarchy, feedback, and audio first — not feature bloat. Thesis: Bilibili BV1q843z1EgF「为什么你的独立游戏充满廉价感？」by 花间莉萝.

工艺备注：先做氛围、灯光层级、反馈和声音，而不是堆系统。参考花间莉萝 BV1q843z1EgF。

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

`npm test` checks director mapping / warrants. `npm run typecheck` typechecks client + server.

## Controls / 操作

| Input | Action |
| --- | --- |
| W A S D / left stick | Walk (subtle head-bob; reduced while sneaking) |
| Mouse / right-side drag | Look (click to lock pointer) |
| Shift / Sneak | Quiet, slower |
| F / LAMP | Flashlight (drain scales with Jev `fear_intensity`) |
| E / USE | Pick up battery, keycard, or note (sound + toast) |
| M | Mute (persisted in `localStorage`) |

**Win:** open a rare exit foyer door (keycard, or depth ≥ 12) **or** survive to **depth 14**.  
**Lose:** the entity reaches you. Game Over lists what Jev (or fallback) chose for each room.

胜利：打开罕见出口（钥匙卡，或深度 ≥ 12），或活到深度 14。失败：实体抓到你。

## Atmosphere / 氛围

Procedural Level-0 direction: yellowed wallpaper noise, wet-carpet sheen, buzzing fixture flicker, yellow fog that thickens in dead/dim rooms, a flashlight cone with a fake volumetric beam, portal static while Jev decides, and a silhouette that twitches instead of a cheap capsule. HUD is cinematic type (Cormorant / 宋) with readable **SANITY / DEPTH / Jev** status — not a debug overlay.

程序化 Level 0：发黄墙纸噪点、湿地毯高光、灯管闪烁、按照明变浓的黄雾、有体积感的手电锥、门洞生成时的静电，以及会抽动的剪影。HUD 用电影感字体，仍能读到神智 / 深度 / Jev。

## What Jev decides / Jev 决定什么

Jev does **not** write prose, images, or free-form maps. One `POST https://api.typesafe.ai/v1/systemone` call (`model: jev-1.13.0`) asks many typed questions in parallel. Instructions are built from compact state (depth, battery, keycard, noise, last encounter, exit chance, entity hops/LOS). Invalid fields fall back field-by-field.

Jev **不**生成文本、图片或自由地图。一次请求并行问多道题；题面随压缩状态变化。非法字段单独回退。

Compact `player.sanity` is **stress 0–100** (same as in-game fear). The HUD shows **SANITY = 100 − fear**.

压缩状态里的 `sanity` 是压力值 0–100（与恐惧相同）。HUD 显示的神智是 `100 − fear`。

### Room prefetch (`purpose: "room"`)

Fired when you approach an unexplored doorway (before you step through). Client waits at most **1100ms**, then falls back. The door shimmers / glitches while the answer is in flight; entering plays a resolve beat.

靠近未探索门洞时预取。最多等 1100ms。等待时门会静电；进门有一次氛围拍点。

| Question | Type | Options / scale | Maps to gameplay |
| --- | --- | --- | --- |
| `room_archetype` | Choice | `empty_office` `long_hall` `flooded_lobby` `maze_cubicles` `stairwell` `dead_end` `exit_foyer` | Geometry template |
| `size` | Choice | `cramped` `standard` `vast` | Footprint + fog scale |
| `lighting` | Choice | `flickering` `dim` `harsh` `dead` | Fixture intensity, flicker, fog density, ambient hierarchy |
| `hazard` | Choice | `none` `puddle_slip` `dark_patch` `buzzing_overload` | Slip, sanity sink, noise |
| `layout_motif` | Choice | `open_floor` `offset_desks` `pillar_grid` `broken_symmetry` `narrow_throat` | Furniture / choke composition |
| `exit_count` | Choice | `one` `two` `three` `four` | How many **real** outgoing doors besides entry |
| `exit_orientation` | Choice | `ahead` `left` `right` `behind_only` `split` | Which walls get those doors |
| `dead_end_bait` | Noul | fake frames vs real graph | Painted/sealed throats that do not generate rooms |
| `loot_or_clue` | Choice | `none` `battery` `keycard` `note` | Physical pickup |
| `clue_beat` | Choice | `none` `note` `keycard` `false_exit` `graffiti` `radio_static` | Note/card guarantee, lying EXIT, wall writing, radio prop + hiss |
| `advances_exit` | Noul | yes / no | Increments `exitChance`; later rooms may become `exit_foyer`; flavor: “air less yellow” |
| `entity_present` | Noul | yes / no | Spawn / involve the entity |
| `entity_behavior` | Choice | `stalk` `ambush` `wander` `mimic_door` `absent` | Start pose; `mimic_door` waits in a jamb |
| `entity_aggression` | Score | 4 levels | Initial hunt speed |
| `cutoff_door` | Choice | `entry` `left` `right` `far` `none` | Door it prefers to occupy |
| `sound_bait` | Noul | yes / no | False wet steps / knock away from the body |
| `ambience` | Choice | `hum` `drip` `footsteps` `silence` `whisper_static` | Layered bed (hum + air + drip + odd noises) |
| `fear_intensity` | Score | 5 levels | Sanity drain, FOV/grade, flashlight drain |
| `encounter_card` | Choice *(omitted unless warranted)* | `none` `locked_gate_needs_key` `power_flicker_event` `flooded_slow_zone` `safe_alcove` | See below |

Encounter cards are **optional**. The question is only attached when compact state warrants it (depth, last card, sanity, archetype). Picking a card that is no longer legal maps to `none`.

遭遇卡是可选题：状态不够时整题不发；非法选项映射为 `none`。

| Encounter | Traversal change |
| --- | --- |
| `locked_gate_needs_key` | One real outgoing door is barred until the red card |
| `power_flicker_event` | On enter, tubes black out then stutter; extra fear |
| `flooded_slow_zone` | Whole floor is slow water |
| `safe_alcove` | Recess the entity will not enter; sanity recovers inside |

### Entity tick (`purpose: "entity"`, ~420ms)

Compact vitals only. Movement is interpolated locally between ticks.

只发送压缩状态。两次 tick 之间本地插值，主循环不阻塞。

| Question | Type | Maps to |
| --- | --- | --- |
| `intent` | Choice `chase` `hide` `flank` `hold` `cut_off` `bait` | Steering: chase player, break LOS, take another door, freeze, occupy cutoff door, or hold while audio lies |
| `aggression` | Score 4 levels | Move speed |
| `cutoff_door` | Choice `entry` `left` `right` `far` `none` | Preferred door this tick |
| `sound_bait` | Noul | False footstep / knock |

State posted to Jev is a JSON summary (`CompactGameState` in `shared/`), never meshes. `progress` carries `exitChance`, last encounter/clue, notes found, rooms since entity.

## Fallback / 回退

| Condition | Behavior |
| --- | --- |
| Missing `TYPESAFE_API_KEY` | Server returns a seeded room/entity decision immediately |
| Timeout / HTTP / proxy down | Same mapper, HUD warning `Jev unreachable` / `timed out` |
| Invalid Jev field | That field is replaced from the seeded fallback; others still apply |
| Unwarranted encounter card | Forced to `none` |

Seed = `depth | roomsVisited | portalId | recentArchetypes | exitChance`. Exit foyers stay rare until late depth **or** a high `exitChance` after `advances_exit`.

## Repo layout / 目录

```
client/   Vite + TypeScript + Three.js first-person
server/   Hono proxy  GET /api/health  POST /api/jev/decide
          optional POST /api/jev/room  POST /api/jev/entity
shared/   Types, Jev question builders, warrants, mapping, fallback RNG
```

Root scripts: `npm run dev` (client + server), `npm run dev:client`, `npm run dev:server`, `npm test`, `npm run typecheck`.

No auth, no multiplayer, no secrets in git. Copy `.env.example` → `.env.local`.
