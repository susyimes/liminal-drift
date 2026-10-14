export type Locale = "en" | "zh-CN";
export const LANGUAGE_STORAGE_KEY = "liminal-drift.language";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function detectLocale(languages: readonly string[] = [], language = ""): Locale {
  const ordered = languages.length ? languages : [language];
  for (const preferred of ordered) {
    if (/^zh(?:-|$)/i.test(preferred)) return "zh-CN";
    if (/^en(?:-|$)/i.test(preferred)) return "en";
  }
  return "en";
}
export function loadLocale(storage: StorageLike | undefined, languages: readonly string[], language = ""): Locale {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch { /* Private browsing may deny storage. */ }
  return detectLocale(languages, language);
}
function browserStorage(): StorageLike | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
let locale: Locale = loadLocale(browserStorage(), typeof navigator === "undefined" ? [] : navigator.languages,
  typeof navigator === "undefined" ? "" : navigator.language);
const listeners = new Set<() => void>();
export function getLocale(): Locale { return locale; }
export function setLocale(next: Locale, storage = browserStorage()): void {
  locale = next;
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Selection remains usable this session. */ }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const messages = {
  title: ["Liminal Drift", "阈限漂流"],
  subtitle: ["The halls remember", "走廊仍记得你"],
  eyebrow: ["LEVEL 0 · FLUORESCENT LIMINAL", "第 0 层 · 荧光阈限"],
  intro: ["The next room is not written down. Something in the walls chooses the layout, the lights, and whether you are still alone.", "下一间房没有剧本。墙里的东西会选定布局、灯光，以及你是否仍独自一人。"],
  walk: ["walk", "行走"], sneak: ["sneak", "潜行"], mouse: ["Mouse", "鼠标"],
  look: ["look · click to lock pointer", "观察 · 点击锁定鼠标"],
  flashlight: ["flashlight", "手电"], pickup: ["pick up", "拾取"], muteAction: ["mute", "静音"],
  goal: ["Reach depth 14, or open a rare exit. If it catches you, the drift ends.", "到达深度 14，或开启罕见的出口。被它抓住，漂流便会结束。"],
  start: ["Enter the halls", "进入走廊"], again: ["Drift again", "再次漂流"],
  mute: ["Mute", "静音"], unmute: ["Unmute", "开启声音"],
  pauseHint: ["Click to look · Esc releases the mouse", "点击观察 · Esc 释放鼠标"],
  sanity: ["SANITY", "神智"], lamp: ["LAMP", "手电"], use: ["USE", "使用"],
  depth: ["DEPTH", "深度"], card: ["KEYCARD", "钥匙卡"], noCard: ["NO CARD", "无卡"],
  language: ["Language", "语言"], checking: ["Checking room generation…", "正在检查房间生成状态…"],
  localGeneration: ["Local generation ready. The halls will keep unfolding.", "本地生成已就绪。走廊将继续延展。"],
  onlineGeneration: ["Online generation ready", "在线生成已就绪"],
  localSource: ["Local", "本地"], onlineSource: ["Online", "在线"],
  localWarning: ["Using local generation. Keep exploring.", "正在使用本地生成。请继续探索。"],
  timeoutWarning: ["Room generation took too long. Continuing with a locally generated room.", "房间生成等待过久，将继续探索本地生成的房间。"],
  deadKicker: ["THE DRIFT CLOSES", "漂流终止"], exitKicker: ["A THRESHOLD", "跨越阈限"], depthKicker: ["DEPTH MARK", "深度印记"],
  deadTitle: ["It found you", "它找到你了"], exitTitle: ["A door opened", "一扇门打开了"], depthTitle: ["You outlasted the halls", "你熬过了走廊"],
  generation: ["Generation", "生成记录"], director: ["The choices that shaped your drift.", "这些选择塑造了你的漂流。"],
  tunnel: ["tunnel", "通道"], crumb: ["clue", "线索"], familiar: ["familiar", "似曾相识"], yes: ["yes", "是"], no: ["no", "否"],
  opening: ["Walk ahead. Find a door.", "往前走。找一扇门。"],
  hum: ["The hum does not come from the ceiling.", "嗡鸣并非来自天花板。"],
  yellow: ["Yellow forever. The tubes remember a building.", "黄色无尽。灯管记得这里曾是一栋楼。"],
  inventing: ["The throat is still inventing the next room.", "通道还在构想下一间房。"],
  connecting: ["A connecting hall. Keep walking.", "这是一条连接走廊。继续走。"],
  deciding: ["The doorway is still deciding what it is.", "门口还在决定自己是什么。"],
  lockHesitates: ["The lock hesitates.", "门锁犹豫了。"], lockCard: ["The lock wants a card.", "门锁需要一张卡。"],
  painted: ["The hallway is wallpaper. Someone wanted you to believe in a door.", "走廊只是墙纸。有人想让你相信那里有一扇门。"],
  presence: ["It is in the room with you.", "它就在这间房里，与你同在。"],
  death: ["It closed the last few steps without a sound.", "它悄无声息地走完了最后几步。"],
  victory: ["You walked far enough that the building lost interest.", "你走得足够远，这栋楼终于失去了兴趣。"],
  exitCard: ["The card still worked. The air on the other side was wrong in a kinder way.", "卡还能用。另一边的空气依然不对劲，却温柔了一些。"],
  exitOpen: ["The lock had given up before you arrived.", "在你到达之前，门锁就已放弃。"],
  findCard: ["A painted EXIT. The lock is real. Find a card, or go deeper.", "出口标志是画上去的，门锁却是真的。找张卡，或继续深入。"],
  batteryToast: ["Cells. The lamp has a little more night.", "电池。手电还能陪你熬过一小段黑夜。"],
  batteryStatus: ["Spare cells. The lamp has a little more night in it.", "备用电池。手电里又多了一小段黑夜。"],
  cardToast: ["A faded red card.", "一张褪色的红卡。"],
  cardStatus: ["A faded red card. Something here still believes in doors.", "一张褪色的红卡。这里还有东西相信门的存在。"],
  settles: ["The room settles", "房间逐渐安定"], hazard: ["Hazard", "危险"],
  paintFlavor: ["Some throats are only paint.", "有些通道只是油漆。"],
  airFlavor: ["The air is slightly less yellow.", "空气里的黄色淡了一些。"],
  flickerFlavor: ["The tubes fail, then argue.", "灯管熄灭，随即争吵起来。"],
  floodFlavor: ["The carpet is a shallow sea.", "地毯成了一片浅海。"],
  safeFlavor: ["A recess that does not want it.", "这处凹室不愿容纳它。"],
  gateFlavor: ["A gate waits for red plastic.", "一道门在等待红色塑料。"],
  radioFlavor: ["A radio found a station that is not a station.", "收音机找到了一个不算电台的电台。"],
  graffitiFlavor: ["Someone wrote on the rule.", "有人在规则上留下了字。"],
  poolFlavor: ["The tile is sweating.", "瓷砖正在冒汗。"],
} as const;
export type MessageKey = keyof typeof messages;
export function t(key: MessageKey, selected = locale): string { return messages[key][selected === "zh-CN" ? 1 : 0]; }
export type Copy = string | (() => string);
export function renderCopy(copy: Copy): string { return typeof copy === "function" ? copy() : copy; }
export function message(key: MessageKey): () => string { return () => t(key); }
