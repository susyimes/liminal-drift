import { getLocale, t, type Locale } from "../i18n.ts";
import type { RoomDecision } from "@liminal/shared";
import type { RoomArchetype } from "@liminal/shared";

const VIBE_ZH: Record<RoomArchetype, string> = {
  empty_office: "空置办公室",
  long_hall: "长廊",
  flooded_lobby: "积水大堂",
  maze_cubicles: "隔间迷宫",
  stairwell: "楼梯间",
  dead_end: "死路",
  exit_foyer: "出口门厅",
  poolcore: "池核",
  hotel_hall: "酒店走廊",
  parking_ramp: "停车坡道",
  machine_room: "机房",
  empty_classroom: "空教室",
  unfinished: "未完工",
};

export function roomVibeZh(archetype: RoomArchetype | string): string {
  return VIBE_ZH[archetype as RoomArchetype] ?? archetype.replaceAll("_", " ");
}

export function roomVibeHud(archetype: RoomArchetype | string): string {
  return decisionLabel(archetype);
}

/** HUD vibe follows the room just entered, not a jamb-overlap currentId. */
export function hudVibeArchetype(
  lastEnteredArchetype: string | null | undefined,
  occupyingArchetype: string | null | undefined,
  currentArchetype: string,
): string {
  return lastEnteredArchetype ?? occupyingArchetype ?? currentArchetype;
}

export function depthHudText(depth: number): string {
  return `${t("depth")} ${depth}`;
}

export function tunnelVibeHud(mood: string): string {
  return decisionLabel(mood);
}

export const OPENING_HINT = "往前走。找一扇门。"; // Legacy source copy; runtime uses message("opening").

/** Presentation labels only. Model choices and seeded content remain canonical. */
export const DECISION_LABELS: Record<string, readonly [string, string]> = {
  empty_office: ["Empty office", "空置办公室"], long_hall: ["Long hall", "长廊"],
  flooded_lobby: ["Flooded lobby", "积水大堂"], maze_cubicles: ["Cubicle maze", "隔间迷宫"],
  stairwell: ["Stairwell", "楼梯间"], dead_end: ["Dead end", "死路"], exit_foyer: ["Exit foyer", "出口门厅"],
  poolcore: ["Pool halls", "池核"], hotel_hall: ["Hotel hall", "酒店走廊"], parking_ramp: ["Parking ramp", "停车坡道"],
  machine_room: ["Machine room", "机房"], empty_classroom: ["Empty classroom", "空教室"], unfinished: ["Unfinished room", "未完工房间"],
  yellow_throat: ["Yellow passage", "黄喉通道"], damp_service: ["Damp service passage", "潮湿后勤通道"],
  pool_pipe: ["Pool pipe", "池核管道"], dark_throat: ["Dark passage", "暗喉通道"],
  flickering: ["Flickering lights", "闪烁灯光"], dim: ["Dim lights", "昏暗灯光"], harsh: ["Harsh lights", "刺眼灯光"], dead: ["No lights", "灯光熄灭"],
  steady_cool: ["Steady cool light", "稳定冷光"], flicker: ["Flicker", "频闪"], half_dead: ["Half the lights out", "半数灯光熄灭"], almost_dark: ["Almost dark", "近乎黑暗"],
  sick_yellow: ["Sickly yellow", "病态黄光"], humid_teal: ["Humid teal", "潮湿青光"], cold_service: ["Cold utility light", "冰冷后勤灯光"], brownout: ["Power dip", "电压骤降"],
  none: ["None", "无"], shallow_puddle_hall: ["Shallow puddle hall", "浅水走廊"], empty_pool_hall: ["Empty pool hall", "空泳池大厅"], locker_room: ["Locker room", "更衣室"], flooded_utility: ["Flooded utility room", "积水设备间"],
  parallel_two: ["Parallel doors", "双平行门"], t_junction: ["T-junction", "丁字路口"], cross: ["Crossroads", "十字路口"], loop_side: ["Side loop", "侧向回环"],
  dry: ["Dry", "干燥"], damp: ["Damp", "潮湿"], heavy: ["Heavy humidity", "湿气浓重"],
  hvac_hum: ["Ventilation hum", "通风嗡鸣"], drip: ["Drips", "滴水"], distant_footsteps: ["Distant footsteps", "远处脚步"], silence_ring: ["Ringing silence", "耳鸣般的寂静"],
  hum: ["Hum", "嗡鸣"], footsteps: ["Footsteps", "脚步声"], silence: ["Silence", "寂静"], whisper_static: ["Whispers in static", "杂音中的低语"],
  wrong_door_number: ["Wrong door number", "错误门牌"], wet_footprints: ["Wet footprints", "潮湿脚印"], unfinished_notice: ["Unfinished notice", "未写完的告示"],
  puddle_slip: ["Slippery puddles", "水洼打滑"], dark_patch: ["Dark patch", "黑暗区域"], buzzing_overload: ["Electrical overload", "电流过载"], audio_lure: ["Sound lure", "声音诱饵"], tracking_presence: ["Tracking presence", "跟踪者"], environmental: ["Environmental danger", "环境危险"], low_entity: ["Distant presence", "遥远异物"],
  stalk: ["Stalking", "尾随"], ambush: ["Ambush", "伏击"], wander: ["Wandering", "游荡"], mimic_door: ["Door mimic", "伪装成门"], absent: ["Absent", "不在场"],
  short: ["Short", "短"], medium: ["Medium", "中"], long: ["Long", "长"],
};
export function decisionLabel(id: string, locale: Locale = getLocale()): string {
  const label = DECISION_LABELS[id];
  return label ? label[locale === "zh-CN" ? 1 : 0] : (locale === "zh-CN" ? "未知" : "Unknown");
}
export function roomDescription(d: RoomDecision): string {
  const bits = [decisionLabel(d.roomArchetype), decisionLabel(d.lighting), decisionLabel(d.ambience)];
  if (d.entityPresent) bits.push(decisionLabel(d.entityBehavior));
  const sentences = [`${t("settles")}: ${bits.join(" · ")}.`];
  if (d.hazard !== "none") sentences.push(`${t("hazard")}: ${decisionLabel(d.hazard)}.`);
  if (d.deadEndBait) sentences.push(t("paintFlavor"));
  if (d.advancesExit) sentences.push(t("airFlavor"));
  if (d.encounterCard === "power_flicker_event") sentences.push(t("flickerFlavor"));
  if (d.encounterCard === "flooded_slow_zone") sentences.push(t("floodFlavor"));
  if (d.encounterCard === "safe_alcove") sentences.push(t("safeFlavor"));
  if (d.encounterCard === "locked_gate_needs_key") sentences.push(t("gateFlavor"));
  if (d.clueBeat === "radio_static") sentences.push(t("radioFlavor"));
  if (d.clueBeat === "graffiti") sentences.push(t("graffitiFlavor"));
  if (d.roomArchetype === "poolcore") sentences.push(t("poolFlavor"));
  return sentences.join(" ");
}
export function generationWarning(warning: string | null): string | null {
  if (!warning) return null;
  return /timed out|timeout/i.test(warning) ? t("timeoutWarning") : t("localWarning");
}
export const FLAVOR_ZH: Record<string, string> = {
  "If the hum stops, do not look up.": "如果嗡鸣停止，别抬头。",
  "I counted 400 doors. None of them were the first one.": "我数过 400 扇门。没有一扇是最初那扇。",
  "It walks when you walk. I tested this. I should not have tested this.": "你走，它就走。我试过。我不该试的。",
  "The carpet is wet on purpose. It keeps the sound.": "地毯是故意弄湿的。它留住声音。",
  "Yellow is not a color here. It is a rule.": "在这里，黄色不是颜色。它是一条规则。",
  "Battery dying. If you find this I am not ahead of you.": "电池快没电了。如果你找到这张纸，我不在你前面。",
  "The exit sign was a painting. The lock was real.": "出口标志是画上去的，门锁却是真的。",
  "Don't run in the cubicles. It likes the corners.": "别在隔间里跑。它喜欢拐角。",
  "A door that shimmers is still deciding. Wait or it invents you.": "闪烁的门还在犹豫。等一等，否则它会把你也编进去。",
  "It stood in the jamb until I said hello. Then it had joints.": "它站在门框里，直到我说了声你好。然后它长出了关节。",
  "The water is warmer than the air. That is not a kindness.": "水比空气暖。这不是善意。",
  "Tile grout counts the drips. I stopped counting at four hundred.": "瓷砖缝数着水滴。我数到四百就停了。",
  "THE HUM IS A DOOR": "嗡鸣是一扇门",
  "DO NOT TRUST PAINTED HALLS": "别信画出来的走廊",
  "IT LEARNED THE CARD READER": "它学会了读卡器",
  "YELLOW IS A RULE": "黄色是一条规则",
  "IF IT MIMICS A DOOR, WAIT": "若它伪装成门，等待",
  "I LEFT THE KEY IN A ROOM THAT FOLDED": "钥匙留在折叠的房间里",
  "COUNT THE LIGHTS. STOP AT THIRTEEN.": "数灯，数到十三就停",
  "THE EXIT SIGN LIES FIRST": "出口标志先说了谎",
};
export function flavorText(canonical: string, locale: Locale = getLocale()): string {
  return locale === "zh-CN" ? FLAVOR_ZH[canonical] ?? "墙上的文字已经模糊。" : canonical;
}
