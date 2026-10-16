/**
 * 交流的编号表（DESIGN.md 第 6 节）：短语、表情包、道具共用 kit 的 emote id。
 * 0–15 短语（view/text.ts 的 PHRASES），16–27 表情包（kit `STICKERS` 的顺序），28–35 道具（kit `PROPS` 的顺序）。
 * 上线以后只往后加，不改不删（新旧页面要对得上）；张数、顺序和 kit 对得上由 test/emotes.test.ts 检查。
 * 不 import kit 的 fun（那是浏览器的画面代码，房间用不到），表情和道具的名字在这里抄一份。
 */
export const PHRASE_COUNT = 16;
export const STICKER_BASE = PHRASE_COUNT;
export const STICKER_COUNT = 12;
export const PROP_BASE = STICKER_BASE + STICKER_COUNT;
export const PROP_COUNT = 8;
export const EMOTES = PROP_BASE + PROP_COUNT;

/** 短语的编号（文字在 view/text.ts 的 PHRASES，下标一致） */
export const PHRASE = {
  makeWay: 0,
  slipped: 1,
  steady: 2,
  noBrakes: 3,
  nextLap: 4,
  niceDrive: 5,
  outOfHeat: 6,
  go: 7,
  followMe: 8,
  soClose: 9,
  thanks: 10,
  again: 11,
  getOffMyTail: 12,
  nextCorner: 13,
  hurry: 14,
  weCanWin: 15,
} as const;

/** 和 kit 的 STICKERS、PROPS 同样的顺序 */
export const STICKER_NAMES = ['smug', 'doge', 'cry', 'sweat', 'shock', 'sly', 'love', 'angry', 'sleep', 'clap', 'lol', 'cool'] as const;
export const PROP_NAMES = ['tomato', 'egg', 'stinkyEgg', 'slipper', 'bomb', 'rose', 'like', 'cheers'] as const;

export function sticker(name: (typeof STICKER_NAMES)[number]): number {
  return STICKER_BASE + STICKER_NAMES.indexOf(name);
}

export function prop(name: (typeof PROP_NAMES)[number]): number {
  return PROP_BASE + PROP_NAMES.indexOf(name);
}
