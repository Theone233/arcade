/**
 * 好玩素材的画（0.7.0）：表情、道具、命中效果，全是手写的 SVG 字符串（viewBox 0 0 100 100），不用 emoji 字体、不引外部图片。
 * 风格：圆脸、方脸的小动物，深棕描边、平涂、少细节，手机上缩到 40 像素也认得出。
 * 这个文件只有字符串，不碰 DOM，浏览器、Node、workerd 里都能引用（测试在 workerd 里检查它们）。
 */

const O = '#3b2a1f';
const SW = 'stroke="#3b2a1f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
const LINE = `fill="none" ${SW}`;

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">${body}</svg>`;

const blush = (fill = '#ff9a9a'): string =>
  `<ellipse cx="27" cy="62" rx="7" ry="4" fill="${fill}" opacity=".55"/><ellipse cx="73" cy="62" rx="7" ry="4" fill="${fill}" opacity=".55"/>`;
const catEars = (fill: string): string =>
  `<path d="M16 38L20 8L44 22Z" fill="${fill}" ${SW}/><path d="M84 38L80 8L56 22Z" fill="${fill}" ${SW}/>` +
  `<path d="M22 28L23 16L33 22Z" fill="#ffb3a7"/><path d="M78 28L77 16L67 22Z" fill="#ffb3a7"/>`;
const bearEars = (fill: string): string =>
  `<circle cx="22" cy="22" r="12" fill="${fill}" ${SW}/><circle cx="78" cy="22" r="12" fill="${fill}" ${SW}/>` +
  `<circle cx="22" cy="22" r="5" fill="#e79a7a"/><circle cx="78" cy="22" r="5" fill="#e79a7a"/>`;
const roundFace = (fill: string): string => `<circle cx="50" cy="54" r="40" fill="${fill}" ${SW}/>`;
const squareFace = (fill: string): string => `<rect x="12" y="16" width="76" height="76" rx="22" fill="${fill}" ${SW}/>`;
const heart = (x: number, y: number, s: number, fill = '#ff5577'): string =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6C-6-2-16 2-12 10L0 22L12 10C16 2 6-2 0 6Z" fill="${fill}" ${SW.replace('4"', '2.5"')}/>`;

/**
 * 表情包：顺序固定，只往后加（游戏按"自己的起始编号 + 下标"映射到 emote 的 id，改顺序会让新旧页面对不上）。
 * 得意、狗头、大哭、流汗、震惊、坏笑、比心、生气、睡着、鼓掌、笑哭、墨镜
 */
export const STICKERS = ['smug', 'doge', 'cry', 'sweat', 'shock', 'sly', 'love', 'angry', 'sleep', 'clap', 'lol', 'cool'] as const;
export type StickerId = (typeof STICKERS)[number];

const STICKER_BODY: Record<StickerId, string> = {
  // 得意（猫）：眯眼、挑眉、歪嘴笑
  smug:
    catEars('#ffd36b') + roundFace('#ffd36b') + blush() +
    `<path d="M26 40L42 36M74 40L58 36" ${LINE}/><path d="M27 52Q35 46 43 52M57 52Q65 46 73 52" ${LINE}/>` +
    `<path d="M27 52H43M57 52H73" ${LINE}/><path d="M38 68Q52 76 66 64" ${LINE}/>`,
  // 狗头（柴犬）：斜眼看人
  doge:
    `<path d="M14 44L18 10L42 26Z" fill="#e8a14e" ${SW}/><path d="M86 44L82 10L58 26Z" fill="#e8a14e" ${SW}/>` +
    roundFace('#f2b45a') + `<ellipse cx="50" cy="68" rx="26" ry="20" fill="#fff4e2" ${SW}/>` +
    `<ellipse cx="34" cy="46" rx="8" ry="6" fill="#fff"/><ellipse cx="66" cy="46" rx="8" ry="6" fill="#fff"/>` +
    `<circle cx="39" cy="46" r="3.5" fill="${O}"/><circle cx="71" cy="46" r="3.5" fill="${O}"/>` +
    `<path d="M26 36Q34 32 42 36M58 36Q66 32 74 36" ${LINE}/>` +
    `<ellipse cx="50" cy="60" rx="6" ry="4.5" fill="${O}"/><path d="M50 64V70M42 72Q50 78 58 72" ${LINE}/>`,
  // 大哭（熊）：闭眼张嘴，两道眼泪
  cry:
    bearEars('#e8c49a') + roundFace('#f6d9ae') +
    `<path d="M26 50Q34 42 42 50M58 50Q66 42 74 50" ${LINE}/>` +
    `<path d="M30 54Q24 72 30 92M70 54Q76 72 70 92" fill="none" stroke="#5ab4f0" stroke-width="7" stroke-linecap="round" opacity=".9"/>` +
    `<path d="M36 70Q50 58 64 70Q50 84 36 70Z" fill="#8a2b1f" ${SW}/>`,
  // 流汗：豆眼、一字嘴、额头一滴汗
  sweat:
    roundFace('#ffe08a') + `<path d="M28 40L40 44M72 40L60 44" ${LINE}/>` +
    `<circle cx="36" cy="52" r="4" fill="${O}"/><circle cx="64" cy="52" r="4" fill="${O}"/><path d="M40 70H60" ${LINE}/>` +
    `<path d="M80 18Q90 34 80 40Q70 34 80 18Z" fill="#7cc8f5" ${SW.replace('4"', '3"')}/>`,
  // 震惊（方脸）：大眼、O 嘴、额头发青
  shock:
    squareFace('#fff1b8') + `<path d="M30 22V34M42 20V32M58 20V32M70 22V34" stroke="#7aa6e8" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="34" cy="50" r="10" fill="#fff" ${SW}/><circle cx="66" cy="50" r="10" fill="#fff" ${SW}/>` +
    `<circle cx="34" cy="50" r="3" fill="${O}"/><circle cx="66" cy="50" r="3" fill="${O}"/>` +
    `<ellipse cx="50" cy="74" rx="8" ry="10" fill="#8a2b1f" ${SW}/>`,
  // 坏笑（狐狸）：一只眼眨、咧嘴
  sly:
    `<path d="M12 46L18 6L44 24Z" fill="#f08a3c" ${SW}/><path d="M88 46L82 6L56 24Z" fill="#f08a3c" ${SW}/>` +
    roundFace('#f59a4c') + `<path d="M22 66Q50 100 78 66Q64 60 50 66Q36 60 22 66Z" fill="#fff4e2"/>` +
    `<path d="M26 48Q34 42 42 48" ${LINE}/><circle cx="64" cy="48" r="5" fill="${O}"/><path d="M56 38L72 40" ${LINE}/>` +
    `<path d="M34 64Q50 82 68 62Z" fill="#8a2b1f" ${SW}/><path d="M40 66H62" stroke="#fff" stroke-width="3"/>`,
  // 比心：笑眼，旁边两颗心
  love:
    roundFace('#ffd36b') + blush() + `<path d="M26 50Q34 42 42 50M58 50Q66 42 74 50" ${LINE}/>` +
    `<path d="M38 66Q50 78 62 66" ${LINE}/>` + heart(84, 12, 1.1) + heart(14, 18, 0.8),
  // 生气：红脸、倒八眉、冒气
  angry:
    roundFace('#ff8a64') + `<path d="M24 38L42 46M76 38L58 46" ${LINE}/>` +
    `<circle cx="36" cy="54" r="4" fill="${O}"/><circle cx="64" cy="54" r="4" fill="${O}"/><path d="M36 76Q50 64 64 76" ${LINE}/>` +
    `<path d="M74 14Q78 20 74 24M84 16Q88 22 84 26M70 22H80" fill="none" stroke="#d62b2b" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="16" cy="20" r="6" fill="#fff" opacity=".85"/><circle cx="10" cy="12" r="4" fill="#fff" opacity=".7"/>`,
  // 睡着（熊）：闭眼、鼻涕泡、Z
  sleep:
    bearEars('#c9b0e8') + roundFace('#e2d2f6') +
    `<path d="M28 52H42M58 52H72" ${LINE}/><circle cx="50" cy="70" r="4" fill="${O}"/>` +
    `<circle cx="62" cy="66" r="7" fill="#bfe6ff" stroke="#5ab4f0" stroke-width="2.5" opacity=".9"/>` +
    `<path d="M70 8H84L70 22H84M86 30H94L86 38H94" fill="none" stroke="#6a5acd" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 鼓掌：张嘴笑，两只手
  clap:
    roundFace('#ffd36b') + blush() + `<path d="M28 48Q35 40 42 48M58 48Q65 40 72 48" ${LINE}/>` +
    `<path d="M38 60Q50 74 62 60Z" fill="#8a2b1f" ${SW}/>` +
    `<ellipse cx="24" cy="82" rx="10" ry="14" transform="rotate(-25 24 82)" fill="#ffd36b" ${SW}/>` +
    `<ellipse cx="76" cy="82" rx="10" ry="14" transform="rotate(25 76 82)" fill="#ffd36b" ${SW}/>` +
    `<path d="M8 66L14 70M10 56L16 62M92 66L86 70M90 56L84 62" stroke="#f5b400" stroke-width="4" stroke-linecap="round"/>`,
  // 笑哭：笑眼带泪、大笑
  lol:
    roundFace('#ffd36b') + `<path d="M26 46Q34 38 42 46M58 46Q66 38 74 46" ${LINE}/>` +
    `<path d="M20 50Q12 58 16 64Q22 62 22 54M80 50Q88 58 84 64Q78 62 78 54" fill="#7cc8f5" stroke="#3a8fd0" stroke-width="2.5"/>` +
    `<path d="M30 58Q50 90 70 58Z" fill="#8a2b1f" ${SW}/><path d="M38 72Q50 80 62 72" fill="#ff8a8a"/>`,
  // 墨镜（方脸）：酷
  cool:
    squareFace('#ffc46b') + `<path d="M18 44H82" ${LINE}/>` +
    `<rect x="22" y="40" width="24" height="16" rx="6" fill="${O}"/><rect x="54" y="40" width="24" height="16" rx="6" fill="${O}"/>` +
    `<path d="M27 45L33 45" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/><path d="M59 45L65 45" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M40 72Q52 78 64 68" ${LINE}/>`,
};

export function stickerSvg(id: StickerId): string {
  return wrap(STICKER_BODY[id]);
}

/** 道具：扔向别人头像的东西，顺序固定、只往后加（同 STICKERS）。臭鸡蛋和鸡蛋同一个画法换颜色，命中时多几缕臭气。 */
export const PROPS = ['tomato', 'egg', 'stinkyEgg', 'slipper', 'bomb', 'rose', 'like', 'cheers'] as const;
export type PropId = (typeof PROPS)[number];

const PROP_BODY: Record<PropId, string> = {
  tomato:
    `<circle cx="50" cy="56" r="34" fill="#e8402e" ${SW}/><ellipse cx="38" cy="44" rx="10" ry="6" fill="#fff" opacity=".35"/>` +
    `<path d="M50 24L42 14L50 18L58 12L56 22L66 22L54 28Z" fill="#4caf50" ${SW.replace('4"', '3"')}/>`,
  egg: `<ellipse cx="50" cy="54" rx="27" ry="35" fill="#fff8ec" ${SW}/><ellipse cx="40" cy="40" rx="7" ry="10" fill="#fff" opacity=".8"/>`,
  stinkyEgg:
    `<ellipse cx="50" cy="54" rx="27" ry="35" fill="#e2e6b8" ${SW}/><circle cx="40" cy="62" r="4" fill="#9a8a4a"/><circle cx="60" cy="46" r="3" fill="#9a8a4a"/>` +
    `<path d="M72 18Q78 12 74 6M82 24Q88 18 84 12" fill="none" stroke="#6fbf3a" stroke-width="4" stroke-linecap="round"/>`,
  slipper:
    `<path d="M32 10Q52 2 68 14Q78 42 72 72Q64 96 46 94Q28 90 28 66Q24 36 32 10Z" fill="#4a8be0" ${SW}/>` +
    `<path d="M36 70Q50 64 64 70" fill="none" stroke="#2f6bbf" stroke-width="3"/><path d="M38 28Q50 50 62 28" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`,
  bomb:
    `<circle cx="46" cy="60" r="30" fill="#2b2b2b" ${SW}/><ellipse cx="36" cy="50" rx="8" ry="5" fill="#fff" opacity=".35"/>` +
    `<rect x="56" y="24" width="16" height="14" rx="3" transform="rotate(35 64 31)" fill="#6b6b6b" ${SW}/>` +
    `<path d="M70 24Q78 14 88 16" fill="none" stroke="#a0763a" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M88 8L90 14L96 16L90 18L88 24L86 18L80 16L86 14Z" fill="#ffd23f" stroke="#ff8a00" stroke-width="1.5"/>`,
  rose:
    `<path d="M50 52V94" stroke="#3f9b4a" stroke-width="6" stroke-linecap="round"/><path d="M50 74Q34 66 30 76Q40 84 50 78" fill="#4caf50" ${SW.replace('4"', '3"')}/>` +
    `<path d="M50 14Q30 16 28 36Q30 56 50 58Q70 56 72 36Q70 16 50 14Z" fill="#e8344e" ${SW}/>` +
    `<path d="M40 30Q50 22 60 30Q56 42 50 44Q42 40 40 30Z" fill="#c21d3a"/><path d="M44 34Q50 30 56 34" fill="none" stroke="#ff8aa0" stroke-width="3" stroke-linecap="round"/>`,
  like:
    `<circle cx="50" cy="50" r="42" fill="#3d8bfd" ${SW}/><path d="M28 48H38V78H28Z" fill="#fff" ${SW.replace('4"', '3"')}/>` +
    `<path d="M40 48L52 24Q58 20 61 28L57 44H72Q79 46 77 54L73 74Q71 78 65 78H40Z" fill="#fff" ${SW.replace('4"', '3"')}/>`,
  cheers:
    `<rect x="24" y="30" width="40" height="58" rx="6" fill="#f5b52e" ${SW}/><path d="M64 44Q80 44 80 58Q80 72 64 72" fill="none" ${SW}/>` +
    `<path d="M22 32Q24 16 36 20Q42 10 52 18Q64 14 66 30Z" fill="#fff" ${SW}/><path d="M34 46V78M46 46V78M56 46V78" stroke="#ffd77a" stroke-width="3"/>`,
};

export function propSvg(id: PropId): string {
  return wrap(PROP_BODY[id]);
}

// ---------- 命中效果用的小件（fun.ts 组合、上动画） ----------

/** 番茄爆开的汁水：一大摊不规则红色加几块果肉（带籽） */
export const SPLAT_TOMATO = wrap(
  `<path d="M50 18Q58 30 70 22Q70 36 86 38Q76 48 88 60Q72 60 74 76Q62 68 54 84Q48 70 34 80Q34 66 16 64Q28 54 14 42Q30 40 28 24Q42 32 50 18Z" fill="#d93a28" opacity=".92"/>` +
    `<circle cx="18" cy="24" r="5" fill="#d93a28"/><circle cx="86" cy="22" r="4" fill="#d93a28"/><circle cx="90" cy="76" r="5" fill="#d93a28"/><circle cx="12" cy="80" r="4" fill="#d93a28"/>` +
    `<path d="M40 44Q48 38 54 46Q50 54 42 52Z" fill="#f0705a"/><circle cx="46" cy="47" r="1.8" fill="#ffe08a"/>` +
    `<path d="M58 58Q66 54 68 62Q62 68 58 64Z" fill="#f0705a"/><circle cx="62" cy="61" r="1.6" fill="#ffe08a"/>`,
);
/** 鸡蛋糊上去：蛋清加蛋黄；臭鸡蛋的蛋清发绿 */
export const splatEgg = (stinky: boolean): string =>
  wrap(
    `<path d="M50 20Q66 18 74 30Q90 36 82 52Q88 68 70 72Q60 86 46 76Q28 82 24 66Q10 56 22 44Q18 26 36 28Q40 20 50 20Z" fill="${stinky ? '#eef2c8' : '#fffaf0'}" opacity=".93" stroke="${stinky ? '#c8d08a' : '#efe2c8'}" stroke-width="2"/>` +
      `<circle cx="50" cy="48" r="15" fill="${stinky ? '#c9b23a' : '#ffb81f'}"/><ellipse cx="45" cy="43" rx="5" ry="3" fill="#fff" opacity=".6"/>`,
  );
/** 往下流的一道（蛋清带一点黄） */
export const DRIP = wrap(`<path d="M40 0Q34 44 44 74Q50 90 58 74Q66 44 60 0Z" fill="#fff6d8" opacity=".95" stroke="#e8c870" stroke-width="4"/><ellipse cx="50" cy="74" rx="6" ry="8" fill="#ffd25a"/>`);
/** 蛋壳碎片 */
export const SHELL = wrap(`<path d="M10 60L30 30L44 48L58 26L74 50L90 40L80 76L20 80Z" fill="#fff8ec" ${SW}/>`);
/** 臭气：一缕绿色的波浪线 */
export const STINK = wrap(`<path d="M50 96Q26 80 50 64Q74 48 50 32Q26 16 50 2" fill="none" stroke="#3f8f1f" stroke-width="13" stroke-linecap="round" opacity=".55"/><path d="M50 96Q26 80 50 64Q74 48 50 32Q26 16 50 2" fill="none" stroke="#8ee05a" stroke-width="6" stroke-linecap="round"/>`);
/** 汁水、泡沫的小圆点 */
export const dot = (fill: string, stroke = 'none'): string => wrap(`<circle cx="50" cy="50" r="40" fill="${fill}" stroke="${stroke}" stroke-width="8"/>`);
/** 小星星（拖鞋打中、点赞、碰杯） */
export const STAR = wrap(`<path d="M50 4L62 36L96 38L70 60L80 94L50 74L20 94L30 60L4 38L38 36Z" fill="#ffd23f" stroke="#e08a00" stroke-width="4" stroke-linejoin="round"/>`);
/** 爆炸：两层锯齿 */
export const BURST = wrap(
  `<path d="M50 0L58 30L84 12L70 40L100 46L72 58L90 84L60 70L50 100L40 70L10 84L28 58L0 46L30 40L16 12L42 30Z" fill="#ff8a1f"/>` +
    `<path d="M50 20L56 40L74 30L64 48L84 52L64 58L74 74L56 64L50 82L44 64L26 74L36 58L16 52L36 48L26 30L44 40Z" fill="#ffe14d"/>`,
);
/** 烟 */
export const SMOKE = wrap(`<circle cx="36" cy="58" r="26" fill="#8a8a8a"/><circle cx="62" cy="48" r="28" fill="#9a9a9a"/><circle cx="54" cy="70" r="22" fill="#7a7a7a"/>`);
/** 熏黑：盖在头像上的一团黑，炸完淡掉 */
export const SOOT = wrap(`<circle cx="50" cy="50" r="48" fill="#1a1a1a"/>`);
/** 花瓣 */
export const PETAL = wrap(`<path d="M50 6Q86 30 50 94Q14 30 50 6Z" fill="#e8344e" stroke="#c21d3a" stroke-width="4"/>`);
/** 引信上的火花 */
export const SPARK = wrap(`<path d="M50 0L58 38L100 50L58 62L50 100L42 62L0 50L42 38Z" fill="#ffd23f" stroke="#ff6a00" stroke-width="4"/>`);
