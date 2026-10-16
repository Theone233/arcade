/**
 * 股票小人的五官（多套共用）。所有部件按"脸中心 + 缩放"摆放，直接画在 128×128 画布坐标里，
 * 这样每个分层文件都和身体同尺寸、同原点，画面层叠放时不需要再对齐。
 *
 * 表情：calm 平静 / happy 开心 / limitup 涨停（墨镜） / worried 发愁（流汗） /
 *       limitdown 跌停（哭） / delisted 退市（X 眼，整体变灰由合成时处理）
 */
import { BLUSH, INK, TEAR, WHITE, type Frag, frag, nid, sparkleD } from './svg.ts';

export const EXPRESSIONS = ['calm', 'happy', 'limitup', 'worried', 'limitdown', 'delisted'] as const;
export type Expr = (typeof EXPRESSIONS)[number];

export const EXPR_LABEL: Record<Expr, string> = {
  calm: '平静',
  happy: '开心',
  limitup: '涨停',
  worried: '发愁',
  limitdown: '跌停',
  delisted: '退市',
};

export interface FaceStyle {
  /** 脸中心（两眼连线中点） */
  x: number;
  y: number;
  /** 整体缩放 */
  s: number;
  /** 半眼距（未缩放），默认 14 */
  gap?: number;
  /** 嘴相对眼线的下移（未缩放），默认 11 */
  mouthDy?: number;
  /** normal 普通 / sleepy 平静时半睁眼（躺平）/ shades 常戴墨镜（辣条） */
  eyeKind?: 'normal' | 'sleepy' | 'shades';
  /** 汗滴放在哪一侧 */
  sweatSide?: 1 | -1;
  /** 头顶（放灵魂、闪光的参考点） */
  headTopY?: number;
  /** 不画腮红 */
  noCheeks?: boolean;
  /** 妖股闪电标记相对脸中心的位置（未缩放），默认 (0, -19)：额头正中 */
  markDx?: number;
  markDy?: number;
}

/** 把局部坐标（以脸中心为原点、未缩放）包进 transform */
function at(fs: FaceStyle, inner: string): string {
  return `<g transform="translate(${fs.x} ${fs.y}) scale(${fs.s})">${inner}</g>`;
}

const LW = 3.4;

function dotEye(cx: number, rx = 4.3, ry = 5.5, hi = true): string {
  return (
    `<ellipse cx="${cx}" cy="0" rx="${rx}" ry="${ry}" fill="${INK}"/>` +
    (hi ? `<circle cx="${cx - rx * 0.32}" cy="${-ry * 0.38}" r="${rx * 0.4}" fill="${WHITE}"/>` : '')
  );
}

function shades(gap: number, kind: 'dark' | 'gold' | 'cracked', dy = 0): Frag {
  const f = frag();
  const gid = nid('sg');
  const top = kind === 'gold' ? '#fff1a8' : '#5a4f86';
  const bot = kind === 'gold' ? '#e08a1a' : '#1f1a33';
  f.defs.set(
    gid,
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${-7 + dy}" x2="0" y2="${7 + dy}"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`,
  );
  const w = kind === 'gold' ? 11.5 : 10.5;
  const lens = (cx: number) =>
    `<path d="M${cx - w} ${-6 + dy}h${w * 2}q1 0 0.6 2l-1.6 7q-1 4-5 4h${-(w * 2 - 12)}q-4 0-5-4l-1.6-7q-0.4-2 0.6-2z" fill="url(#${gid})" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"/>`;
  let s =
    `<path d="M${-gap - w - 3} ${-4 + dy}L${-gap - w} ${-5 + dy}M${gap + w} ${-5 + dy}L${gap + w + 3} ${-4 + dy}" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>` +
    lens(-gap) +
    lens(gap) +
    `<path d="M${-gap + w - 2} ${-4 + dy}q${gap - w + 2} -3 ${2 * (gap - w + 2)} 0" fill="none" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`;
  // 镜片反光
  s += `<path d="M${-gap - 6} ${-3 + dy}l5 0M${-gap - 7} ${0 + dy}l3 0M${gap - 6} ${-3 + dy}l5 0" stroke="#ffffff" stroke-opacity="${kind === 'gold' ? 0.95 : 0.7}" stroke-width="2.2" stroke-linecap="round"/>`;
  if (kind === 'cracked') {
    s += `<path d="M${gap - 4} ${-5 + dy}l3 4-4 2 3 5M${-gap + 2} ${-5 + dy}l-2 5 3 2" fill="none" stroke="#e8e8f0" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  f.content = s;
  return f;
}

/** 眼睛层（含眉毛）。墨镜也算在眼睛层里。 */
export function eyes(e: Expr, fs: FaceStyle): Frag {
  const g = fs.gap ?? 14;
  const kind = fs.eyeKind ?? 'normal';
  const out = frag();
  let s = '';
  const browSad = `<path d="M${-g - 7} -8l9 -4M${g + 7} -8l-9 -4" stroke="${INK}" stroke-width="${LW - 0.4}" stroke-linecap="round" transform="translate(0 -3)"/>`;
  if (kind === 'shades' && e !== 'worried') {
    const k = e === 'limitup' ? 'gold' : e === 'delisted' ? 'cracked' : 'dark';
    const sf = shades(g, k);
    for (const [a, b] of sf.defs) out.defs.set(a, b);
    s += sf.content;
    if (e === 'happy') s += `<path d="M${-g - 7} -13q7 -5 13 -1M${g + 7} -13q-7 -5 -13 -1" fill="none" stroke="${INK}" stroke-width="${LW - 0.4}" stroke-linecap="round"/>`;
    if (e === 'limitdown') s += `<path d="M${-g - 7} -10l9 -4M${g + 7} -10l-9 -4" stroke="${INK}" stroke-width="${LW - 0.4}" stroke-linecap="round"/>`;
    out.content = at(fs, s);
    return out;
  }
  switch (e) {
    case 'calm':
      if (kind === 'sleepy') {
        // 半睁眼：上眼皮压一半
        for (const cx of [-g, g]) {
          s += `<path d="M${cx - 5} -0.5a5 5 0 0 0 10 0z" fill="${INK}"/><path d="M${cx - 6.5} -0.8h13" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`;
        }
      } else {
        s += dotEye(-g) + dotEye(g);
      }
      break;
    case 'happy':
      // ∩ 笑眼 + 小闪光
      s += `<path d="M${-g - 6} 2q6 -11 12 0M${g - 6} 2q6 -11 12 0" fill="none" stroke="${INK}" stroke-width="${LW + 0.4}" stroke-linecap="round"/>`;
      break;
    case 'limitup': {
      const sf = shades(g, 'gold');
      for (const [a, b] of sf.defs) out.defs.set(a, b);
      s += sf.content;
      break;
    }
    case 'worried':
      if (kind === 'shades') {
        // 墨镜滑到鼻梁上，露出发愁的小眼睛
        const sf = shades(g, 'dark', 9);
        for (const [a, b] of sf.defs) out.defs.set(a, b);
        s += dotEye(-g, 3, 3.6, false) + dotEye(g, 3, 3.6, false) + browSad + sf.content;
      } else {
        s += dotEye(-g, 3.4, 4.4) + dotEye(g, 3.4, 4.4) + browSad;
      }
      break;
    case 'limitdown':
      // > < 紧闭的哭眼
      s += `<path d="M${-g - 6} -5l9 5-9 5M${g + 6} -5l-9 5 9 5" fill="none" stroke="${INK}" stroke-width="${LW + 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<path d="M${-g - 8} -14l10 -3M${g + 8} -14l-10 -3" stroke="${INK}" stroke-width="${LW - 0.6}" stroke-linecap="round"/>`;
      break;
    case 'delisted':
      s += `<path d="M${-g - 5} -5l10 10M${-g + 5} -5l-10 10M${g - 5} -5l10 10M${g + 5} -5l-10 10" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`;
      break;
  }
  out.content = at(fs, s);
  return out;
}

/** 眨眼帧：闭眼弧线。墨镜款用一道反光代替。 */
export function eyesBlink(fs: FaceStyle): Frag {
  const g = fs.gap ?? 14;
  if (fs.eyeKind === 'shades') {
    const sf = shades(g, 'dark');
    const shine = `<path d="M${-g - 9} 3l7 -9M${-g - 4} 4l7 -9M${g - 9} 3l7 -9M${g - 4} 4l7 -9" stroke="#ffffff" stroke-opacity="0.9" stroke-width="2.4" stroke-linecap="round"/>`;
    return frag(at(fs, sf.content + shine), sf.defs);
  }
  return frag(at(fs, `<path d="M${-g - 5.5} -0.5q5.5 5 11 0M${g - 5.5} -0.5q5.5 5 11 0" fill="none" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`));
}

export function mouth(e: Expr, fs: FaceStyle): Frag {
  const m = fs.mouthDy ?? 11;
  let s = '';
  switch (e) {
    case 'calm':
      s = `<path d="M-5 ${m}q5 4.5 10 0" fill="none" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`;
      break;
    case 'happy':
      s =
        `<path d="M-8 ${m - 2}h16q0 11 -8 11t-8 -11z" fill="${INK}" stroke="${INK}" stroke-width="${LW - 1}" stroke-linejoin="round"/>` +
        `<path d="M-4.5 ${m + 6.5}q4.5 -4 9 0q-2 2.6 -4.5 2.6t-4.5 -2.6z" fill="#ff7a8a"/>`;
      break;
    case 'limitup':
      s =
        `<path d="M-12 ${m - 3}q12 3 24 0q-2 14 -12 14t-12 -14z" fill="${INK}" stroke="${INK}" stroke-width="${LW - 1}" stroke-linejoin="round"/>` +
        `<path d="M-10 ${m - 1.6}q10 2.6 20 0l-0.6 3.4q-9.4 2 -18.8 0z" fill="${WHITE}"/>` +
        `<path d="M-5 ${m + 8}q5 -4 10 0q-2 2.8 -5 2.8t-5 -2.8z" fill="#ff7a8a"/>`;
      break;
    case 'worried':
      s = `<path d="M-8 ${m + 2}q2 -3 4 0t4 0t4 0t4 0" fill="none" stroke="${INK}" stroke-width="${LW - 0.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'limitdown':
      s =
        `<path d="M-8 ${m + 9}q0 -11 8 -11t8 11q-4 -2 -8 -2t-8 2z" fill="${INK}" stroke="${INK}" stroke-width="${LW - 1}" stroke-linejoin="round"/>` +
        `<path d="M-4 ${m + 7.4}q4 -3 8 0q-4 -0.8 -8 0z" fill="#ff7a8a"/>`;
      break;
    case 'delisted':
      s = `<path d="M-6 ${m + 1}h12" stroke="${INK}" stroke-width="${LW}" stroke-linecap="round"/>`;
      break;
  }
  return frag(at(fs, s));
}

export function cheeks(fs: FaceStyle): Frag {
  if (fs.noCheeks) return frag();
  const g = (fs.gap ?? 14) + 8;
  return frag(
    at(fs, `<ellipse cx="${-g}" cy="7" rx="5.5" ry="3.3" fill="${BLUSH}" fill-opacity="0.6"/><ellipse cx="${g}" cy="7" rx="5.5" ry="3.3" fill="${BLUSH}" fill-opacity="0.6"/>`),
  );
}

/** 表情特效层：涨停闪光、发愁汗滴、跌停泪流、退市灵魂 */
export function faceFx(e: Expr, fs: FaceStyle): Frag {
  const g = fs.gap ?? 14;
  const side = fs.sweatSide ?? 1;
  let s = '';
  switch (e) {
    case 'limitup':
      s =
        `<path d="${sparkleD(g + 15, -13, 7)}" fill="#fff6b0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="${sparkleD(-g - 16, -16, 4.5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
      break;
    case 'worried': {
      const x = side * (g + 17);
      s =
        `<path d="M${x} -20q-6.5 9 -6.5 13a6.5 6.5 0 0 0 13 0q0 -4 -6.5 -13z" fill="${TEAR}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
        `<path d="M${x - 2.6} -8q0 2.6 2.4 3.4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>`;
      break;
    }
    case 'limitdown':
      // 两道宽泪流 + 飞出的泪珠
      for (const sx of [-1, 1]) {
        const x0 = sx * g;
        s += `<path d="M${x0 - 4} 5q-1 10 -2 22q4 3 8 0q-1 -12 -2 -22z" fill="${TEAR}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" transform="translate(${sx * 1} 0)"/>`;
        s += `<circle cx="${sx * (g + 13)}" cy="-6" r="2.8" fill="${TEAR}" stroke="${INK}" stroke-width="1.6"/>`;
      }
      break;
    case 'delisted': {
      // 头顶飘出的小魂
      const top = fs.headTopY !== undefined ? (fs.headTopY - fs.y) / fs.s : -34;
      s =
        `<g transform="translate(${g + 6} ${top - 2})" opacity="0.92"><path d="M-7 4a7 7 0 0 1 14 0v7q-2 -2 -3.5 0t-3.5 0t-3.5 0t-3.5 0z" fill="#f4f6ff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle cx="-2.4" cy="3.6" r="1.2" fill="${INK}"/><circle cx="2.4" cy="3.6" r="1.2" fill="${INK}"/></g>`;
      break;
    }
    default:
      return frag();
  }
  return frag(at(fs, s));
}
