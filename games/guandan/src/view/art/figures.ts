/**
 * 宫廷牌人物（J 小将 / Q 仕女 / K 帝王）与王牌醒狮头。
 * 全部画在 128×128 的局部坐标里（中心 x=64），由 cards.ts 平移缩放到牌面中央的画框内。
 * 风格：Q 版大头、统一深色描边、平涂 + 一层阴影。
 */
import { C, shade } from './common.ts';

/** 人物配色（随花色） */
export interface FigPalette {
  main: string;
  dark: string;
  light: string;
}

export const SUIT_PALETTES: readonly FigPalette[] = [
  { main: '#2c4a7a', dark: '#1a2c4c', light: '#5f86c0' }, // ♠ 藏青
  { main: '#b3202a', dark: '#7a121a', light: '#e05a5f' }, // ♥ 中国红
  { main: '#2f6b4f', dark: '#1b4331', light: '#5ea283' }, // ♣ 墨绿
  { main: '#c8692a', dark: '#8e4416', light: '#eb9c5c' }, // ♦ 赭橙
];

const SK = '#f9dcbd'; // 肤色
const SK_SH = '#ecba92'; // 肤色阴影
const HAIR = '#2a1f1c';
const LINE = `stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const LINE2 = `stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;

/** 圆脸 + 耳朵 + 脸颊红晕 + 下半脸阴影 */
function face(cx: number, cy: number, rx: number, ry: number, ears = true): string {
  const ear = ears
    ? `<ellipse cx="${cx - rx + 1}" cy="${cy + 4}" rx="6" ry="8" fill="${SK}" ${LINE}/><ellipse cx="${cx + rx - 1}" cy="${cy + 4}" rx="6" ry="8" fill="${SK}" ${LINE}/>`
    : '';
  return `${ear}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${SK}" ${LINE}/>` +
    `<path d="M${cx - rx + 4} ${cy + 8}C${cx - rx + 10} ${cy + ry - 2} ${cx + rx - 10} ${cy + ry - 2} ${cx + rx - 4} ${cy + 8}C${cx + rx - 12} ${cy + ry + 2} ${cx - rx + 12} ${cy + ry + 2} ${cx - rx + 4} ${cy + 8}Z" fill="${SK_SH}" opacity=".55"/>` +
    `<ellipse cx="${cx - rx * 0.55}" cy="${cy + 9}" rx="6" ry="3.6" fill="#f2918a" opacity=".7"/><ellipse cx="${cx + rx * 0.55}" cy="${cy + 9}" rx="6" ry="3.6" fill="#f2918a" opacity=".7"/>`;
}

/** 圆眼（带高光） */
function eye(x: number, y: number, r = 4): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${r * 0.85}" ry="${r * 1.1}" fill="${C.ink}"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.4}" r="${r * 0.35}" fill="#fff"/>`;
}

/** 肩部袍服：交领 + 金边 */
function robe(p: FigPalette, inner: string): string {
  return `<path d="M4 132C6 106 28 94 64 94C100 94 122 106 124 132Z" fill="${p.main}" ${LINE}/>` +
    `<path d="M14 132C18 116 30 108 44 104L52 132Z" fill="${p.dark}" opacity=".45"/>` +
    `<path d="M46 96L64 124L82 96" fill="${inner}" ${LINE2}/>` +
    `<path d="M46 96L64 124L82 96" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -1)" opacity=".95"/>`;
}

/** K：帝王，头戴冕冠，八字胡 */
export function kingFigure(p: FigPalette): string {
  const robeBody = robe(p, '#f6ead2') +
    // 肩上团纹
    `<circle cx="28" cy="114" r="9" fill="${C.gold}" ${LINE2}/><path d="M23 114a5 5 0 1 1 5 5" fill="none" stroke="${C.goldDeep}" stroke-width="2"/>` +
    `<circle cx="100" cy="114" r="9" fill="${C.gold}" ${LINE2}/><path d="M105 114a5 5 0 1 0 -5 5" fill="none" stroke="${C.goldDeep}" stroke-width="2"/>`;
  const head = face(64, 64, 30, 29) +
    // 鬓发
    `<path d="M35 64C33 46 44 38 64 38C84 38 95 46 93 64C90 54 84 49 64 49C44 49 38 54 35 64Z" fill="${HAIR}" ${LINE2}/>` +
    // 眉、眼
    `<path d="M45 55Q52 50 58 54M70 54Q76 50 83 55" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>` +
    eye(52, 64) + eye(76, 64) +
    // 鼻、八字胡、小胡须
    `<path d="M62 71Q64 73 66 71" fill="none" stroke="${SK_SH}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M64 77C60 74 52 74 47 80C53 78 58 80 64 79C70 80 75 78 81 80C76 74 68 74 64 77Z" fill="${HAIR}" stroke="${C.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M60 86Q64 97 68 86Z" fill="${HAIR}"/>`;
  // 冕冠：冠身 + 冕板 + 两侧旒珠
  let beads = '';
  for (const x of [26, 33, 95, 102]) {
    beads += `<line x1="${x}" y1="30" x2="${x}" y2="${x < 64 ? 52 : 52}" stroke="${C.goldDeep}" stroke-width="1.6"/>`;
    for (const y of [36, 43, 50]) beads += `<circle cx="${x}" cy="${y}" r="2.6" fill="${y === 43 ? C.red : C.goldLight}" stroke="${C.ink}" stroke-width="1"/>`;
  }
  const crown = `<path d="M44 42L46 26H82L84 42Z" fill="${p.dark}" ${LINE2}/>` +
    `<rect x="44" y="32" width="40" height="4" fill="${C.gold}"/>` +
    `<circle cx="64" cy="34" r="4.5" fill="${C.red}" stroke="${C.goldLight}" stroke-width="1.6"/>` +
    `<path d="M20 22L108 22L104 30L24 30Z" fill="${C.ink}" ${LINE2}/><path d="M24 24H104" stroke="${C.gold}" stroke-width="2"/>` +
    beads;
  return robeBody + head + crown;
}

/** Q：仕女，高髻插簪、额点花钿、眯眼微笑 */
export function queenFigure(p: FigPalette): string {
  const body = robe(p, '#fff6ea') +
    // 披帛
    `<path d="M10 124C24 112 36 116 44 104" fill="none" stroke="${p.light}" stroke-width="5" stroke-linecap="round" opacity=".9"/>` +
    `<path d="M118 124C104 112 92 116 84 104" fill="none" stroke="${p.light}" stroke-width="5" stroke-linecap="round" opacity=".9"/>`;
  // 后发 + 高髻
  const backHair = `<path d="M30 70C26 44 42 32 64 32C86 32 102 44 98 70C100 84 96 92 90 96L38 96C32 92 28 84 30 70Z" fill="${HAIR}" ${LINE}/>` +
    `<ellipse cx="64" cy="22" rx="20" ry="14" fill="${HAIR}" ${LINE}/>` +
    `<path d="M50 20Q64 12 78 20" fill="none" stroke="#4a3832" stroke-width="2.5" stroke-linecap="round"/>`;
  const head = face(64, 66, 28, 27, false) +
    // 刘海（中分）
    `<path d="M36 64C36 46 48 40 64 40C80 40 92 46 92 64C86 54 74 50 64 46C54 50 42 54 36 64Z" fill="${HAIR}" ${LINE2}/>` +
    // 花钿
    `<path d="M64 52l2.5 3.5l-2.5 3.5l-2.5-3.5Z" fill="${C.red}"/>` +
    // 眯眼、睫毛
    `<path d="M47 66Q52 61 57 66M71 66Q76 61 81 66" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M46 64.5l-3-2M82 64.5l3-2" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M48 57Q52 55 56 57M72 57Q76 55 80 57" fill="none" stroke="#5a4038" stroke-width="2" stroke-linecap="round"/>` +
    // 樱桃小口
    `<path d="M60 79Q64 77 68 79Q64 84 60 79Z" fill="${C.red}" stroke="${C.redDeep}" stroke-width="1"/>`;
  // 金簪 + 步摇 + 红花
  const pins = `<path d="M74 18L100 6" stroke="${C.gold}" stroke-width="3.4" stroke-linecap="round"/><circle cx="100" cy="6" r="3.5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.2"/>` +
    `<path d="M96 8V22M92 10V24" stroke="${C.goldDeep}" stroke-width="1.4"/><circle cx="96" cy="24" r="2.6" fill="${C.red}"/><circle cx="92" cy="26" r="2.6" fill="${C.goldLight}"/>` +
    `<g transform="translate(44 26)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="4.6" ry="7" cy="-6" fill="${p.light === '#e05a5f' ? '#f5c242' : '#e8505a'}" stroke="${C.ink}" stroke-width="1.2" transform="rotate(${a})"/>`).join('')}<circle r="3.4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1"/></g>`;
  return backHair + body + head + pins;
}

/** J：小将，戴盔红缨、护心镜、浓眉咧嘴 */
export function jackFigure(p: FigPalette): string {
  // 甲胄：肩甲鳞纹 + 护心镜
  let scales = '';
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const x = 12 + i * 8 + r * 2;
      const y = 108 + r * 8;
      scales += `<path d="M${x} ${y}q4 6 8 0" fill="none" stroke="${C.gold}" stroke-width="1.8" opacity=".85"/>`;
      scales += `<path d="M${128 - x} ${y}q-4 6 -8 0" fill="none" stroke="${C.gold}" stroke-width="1.8" opacity=".85"/>`;
    }
  }
  const body = `<path d="M4 132C6 106 28 94 64 94C100 94 122 106 124 132Z" fill="${p.main}" ${LINE}/>` +
    `<path d="M14 132C18 116 30 108 44 104L52 132Z" fill="${p.dark}" opacity=".45"/>` + scales +
    `<path d="M44 96Q64 106 84 96" fill="none" stroke="${C.red}" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="64" cy="118" r="11" fill="${C.gold}" ${LINE2}/><circle cx="64" cy="118" r="6.5" fill="${C.goldLight}" stroke="${C.goldDeep}" stroke-width="1.6"/><circle cx="61" cy="115" r="2" fill="#fff"/>`;
  const head = face(64, 66, 29, 28) +
    // 浓眉（上挑）、圆眼、咧嘴
    `<path d="M44 55L58 59M84 55L70 59" stroke="${C.ink}" stroke-width="4.6" stroke-linecap="round"/>` +
    eye(52, 66, 4.4) + eye(76, 66, 4.4) +
    `<path d="M55 79Q64 89 73 79Z" fill="#8a2a22" ${LINE2}/><path d="M57 80.5Q64 83 71 80.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`;
  // 头盔：盔身 + 金色帽檐 + 顶尖 + 红缨
  let tassel = '';
  const tr = [[-12, -2], [-8, -9], [-2, -12], [4, -12], [10, -8], [13, -1], [0, -4]] as const;
  for (const [dx, dy] of tr) tassel += `<ellipse cx="${64 + dx}" cy="${16 + dy}" rx="7" ry="5.4" fill="${C.redLight}" transform="rotate(${dx * 4} ${64 + dx} ${16 + dy})"/>`;
  const helmet = `<path d="M30 60C30 34 44 24 64 24C84 24 98 34 98 60L92 58C90 46 80 42 64 42C48 42 38 46 36 58Z" fill="${shade(p.main, -0.15)}" ${LINE}/>` +
    `<path d="M40 34C48 28 56 27 62 27" fill="none" stroke="${p.light}" stroke-width="3.2" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M34 50C44 44 54 42 64 42C74 42 84 44 94 50L96 58C86 52 76 49 64 49C52 49 42 52 32 58Z" fill="${C.gold}" ${LINE2}/>` +
    `<circle cx="64" cy="46" r="3.6" fill="${C.red}" stroke="${C.ink}" stroke-width="1.2"/>` +
    `<path d="M60 26L64 14L68 26Z" fill="${C.gold}" ${LINE2}/>` +
    `<g stroke="${C.ink}" stroke-width="2.2">${tassel}</g>` +
    `<g>${tassel.replace(/rx="7" ry="5.4"/g, 'rx="4.5" ry="3.2"').replace(new RegExp(C.redLight, 'g'), C.red)}</g>`;
  return body + head + helmet;
}

/** 王牌醒狮头：big=大王（红金），否则小王（墨灰） */
export function lionHead(big: boolean): string {
  const mane = big ? C.red : '#33333d';
  const maneDark = big ? C.redDeep : '#1c1c22';
  const faceC = big ? '#f2c14e' : '#b8bcc4';
  const faceSh = big ? '#d99a2b' : '#8d929b';
  const fur = '#fffaf0';
  const nose = big ? '#e8505a' : '#5b5d66';
  const accent = big ? '#2f8a5f' : '#6c7280';
  // 鬃毛：一圈圆鳞
  let ring = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = 64 + Math.cos(a) * 50;
    const y = 66 + Math.sin(a) * 47;
    ring += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14"/>`;
  }
  return `<g fill="${mane}" ${LINE}>${ring}</g><ellipse cx="64" cy="66" rx="50" ry="47" fill="${mane}"/>` +
    `<ellipse cx="64" cy="76" rx="48" ry="34" fill="${maneDark}" opacity=".35"/>` +
    // 脸
    `<path d="M22 62C22 34 40 24 64 24C88 24 106 34 106 62C106 92 90 108 64 108C38 108 22 92 22 62Z" fill="${faceC}" ${LINE}/>` +
    `<path d="M26 74C30 96 44 106 64 106C84 106 98 96 102 74C96 92 82 100 64 100C46 100 32 92 26 74Z" fill="${faceSh}" opacity=".7"/>` +
    // 额前宝镜 + 独角
    `<path d="M56 30L64 10L72 30Z" fill="${accent}" ${LINE2}/>` +
    `<circle cx="64" cy="36" r="9" fill="${big ? C.goldLight : '#e6e8ec'}" ${LINE2}/><circle cx="61" cy="33" r="3" fill="#fff"/>` +
    // 白绒眉
    `<path d="M30 52C32 40 44 38 56 46C50 52 40 56 30 52Z" fill="${fur}" ${LINE2}/><path d="M98 52C96 40 84 38 72 46C78 52 88 56 98 52Z" fill="${fur}" ${LINE2}/>` +
    // 大眼
    `<ellipse cx="46" cy="62" rx="10" ry="9" fill="#fff" ${LINE2}/><ellipse cx="82" cy="62" rx="10" ry="9" fill="#fff" ${LINE2}/>` +
    `<circle cx="48" cy="63" r="5.4" fill="${C.ink}"/><circle cx="80" cy="63" r="5.4" fill="${C.ink}"/><circle cx="50" cy="61" r="1.8" fill="#fff"/><circle cx="82" cy="61" r="1.8" fill="#fff"/>` +
    // 鼻
    `<ellipse cx="64" cy="76" rx="11" ry="8" fill="${nose}" ${LINE2}/><ellipse cx="60" cy="73" rx="3.5" ry="2.2" fill="#fff" opacity=".7"/>` +
    // 大嘴 + 牙
    `<path d="M40 86C48 104 80 104 88 86C78 92 50 92 40 86Z" fill="#7a1a1a" ${LINE2}/>` +
    `<path d="M46 89L50 95L54 90.5M74 90.5L78 95L82 89" fill="#fff" stroke="${C.ink}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M54 98Q64 102 74 98" fill="none" stroke="#e8505a" stroke-width="3" stroke-linecap="round"/>` +
    // 腮边白绒
    `<path d="M22 70C14 76 16 88 26 90C24 84 26 76 30 74Z" fill="${fur}" ${LINE2}/><path d="M106 70C114 76 112 88 102 90C104 84 102 76 98 74Z" fill="${fur}" ${LINE2}/>`;
}
