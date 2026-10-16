/**
 * 题材徽记：64×64，8 个，彩色填充，底色为题材主色（lib/svg.ts 的 THEME_COLORS）。
 * 造型：贴纸式圆章（白边 + 深色描边）+ 中间的题材图形。
 */
import { INK, THEME_COLORS, WHITE, type Frag, darken, ellipseD, frag, grained, hiArc, lighten, merge, rrectD, shape, sparkleD, svgDoc } from './lib/svg.ts';

function line(d: string, color: string, w: number): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const ICONS: Record<string, (c: string) => Frag> = {
  /** AI：小机器人脑袋 */
  ai: (c) =>
    merge(
      frag(line('M32 18V12', INK, 3) + `<circle cx="32" cy="11" r="3.2" fill="#ffe14a" stroke="${INK}" stroke-width="2.2"/>`),
      shape(rrectD(17, 18, 30, 26, 8), { fill: WHITE, shade: '#dfe3ff', sw: 3 }),
      frag(
        `<rect x="21" y="23" width="22" height="13" rx="6" fill="${darken(c, 0.45)}"/>` +
          `<circle cx="27" cy="29.5" r="2.6" fill="#7df0ff"/><circle cx="37" cy="29.5" r="2.6" fill="#7df0ff"/>` +
          `<rect x="13" y="26" width="4" height="9" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/><rect x="47" y="26" width="4" height="9" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/>` +
          line('M28 40h8', darken(c, 0.3), 2.4),
      ),
    ),
  /** 新能源：叶子里的闪电 */
  newenergy: () =>
    merge(
      shape('M18 46Q14 24 34 16Q46 12 50 14Q52 34 40 44Q30 50 18 46Z', { fill: '#eaffc2', shade: '#c8ec8a', sw: 3 }),
      frag(`<path d="M37 18L26 33H33L28 46L41 29H34Z" fill="#ffe14a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + line('M18 46l-4 4', INK, 3)),
    ),
  /** 大消费：购物袋 + 爱心 */
  consumer: () =>
    merge(
      frag(line('M25 24V20Q25 13 32 13Q39 13 39 20V24', INK, 3.2)),
      shape('M17 23H47L45 48Q45 50 43 50H21Q19 50 19 48Z', { fill: WHITE, shade: '#ffe0cc', sw: 3 }),
      frag(`<path d="M32 44C24 38 23 33 27 31C29.5 30 31.5 31.5 32 33C32.5 31.5 34.5 30 37 31C41 33 40 38 32 44Z" fill="#ff5d7a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
    ),
  /** 医药：胶囊 + 十字 */
  pharma: () => {
    const cap = shape(rrectD(-8, -19, 16, 38, 8), { fill: WHITE, shade: '#dfeee9', sw: 3 });
    return merge(
      frag(`<g transform="translate(36 34) rotate(40)">${cap.content}<path d="M-6.5 0H6.5V11Q6.5 17.5 0 17.5Q-6.5 17.5 -6.5 11Z" fill="#ff7a8a"/><path d="M-8 0H8" stroke="${INK}" stroke-width="3"/>${hiArc('M-3.5 -14v8', 2, 0.9)}</g>`, cap.defs),
      frag(`<path d="M18 16h5v-5h5v5h5v5h-5v5h-5v-5h-5z" fill="${WHITE}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
    );
  },
  /** 金融：一摞金币 */
  finance: () => {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const y = 44 - i * 7;
      s += `<path d="M18 ${y}V${y + 4}A14 5 0 0 0 46 ${y + 4}V${y}" fill="#ffd23f" stroke="${INK}" stroke-width="2.6"/>`;
      s += `<ellipse cx="32" cy="${y}" rx="14" ry="5" fill="#ffe680" stroke="${INK}" stroke-width="2.6"/>`;
    }
    s += `<path d="${sparkleD(46, 18, 6)}" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/>`;
    s += `<path d="M28 30l4 -3 4 3" fill="none" stroke="#e0a020" stroke-width="2.2" stroke-linecap="round"/>`;
    return frag(s);
  },
  /** 低空经济：四旋翼无人机吊着外卖盒 */
  lowalt: () => {
    let s = '';
    for (const x of [16, 48]) {
      s += line(`M${x} 22L32 30`, INK, 4.5) + line(`M${x} 22L32 30`, WHITE, 1.8);
      s += line(`M${x} 22v-5`, INK, 2.6);
      s += `<ellipse cx="${x}" cy="16" rx="11" ry="3.4" fill="#dff4ff" stroke="${INK}" stroke-width="2.2"/>`;
    }
    const body = shape('M22 34Q22 26 32 26Q42 26 42 34Z', { fill: WHITE, shade: '#d6eefb', sw: 2.8 });
    return merge(frag(s), body, frag(line('M26 34L24 39M38 34L40 39', INK, 2.4) + line('M32 34v4', INK, 2) + `<rect x="25" y="38" width="14" height="11" rx="2" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>` + line('M25 42h14', '#e09a1a', 1.6)));
  },
  /** 游戏传媒：手柄 */
  gaming: () =>
    merge(
      shape('M14 34Q14 22 24 22H40Q50 22 50 34Q52 46 45 46Q40 46 37 40H27Q24 46 19 46Q12 46 14 34Z', { fill: WHITE, shade: '#ead9f7', sw: 3 }),
      frag(
        `<path d="M21 31h7M24.5 27.5v7" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>` +
          `<circle cx="39" cy="29" r="2.4" fill="#ff5d7a" stroke="${INK}" stroke-width="1.4"/><circle cx="43.5" cy="33" r="2.4" fill="#5ee0ff" stroke="${INK}" stroke-width="1.4"/><circle cx="39" cy="37" r="2.4" fill="#ffd23f" stroke="${INK}" stroke-width="1.4"/>`,
      ),
    ),
  /** 养猪：猪脸 */
  pig: () =>
    merge(
      frag(`<path d="M17 24L16 12L27 18ZM47 24L48 12L37 18Z" fill="#ffd0dc" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`),
      shape(ellipseD(32, 33, 17, 15), { fill: '#ffd0dc', shade: '#ffb3c6', sw: 3 }),
      frag(
        `<ellipse cx="32" cy="37" rx="7.5" ry="5.5" fill="#ff8fa3" stroke="${INK}" stroke-width="2.2"/><ellipse cx="29.3" cy="37" rx="1.4" ry="2.2" fill="${INK}"/><ellipse cx="34.7" cy="37" rx="1.4" ry="2.2" fill="${INK}"/>` +
          `<circle cx="25" cy="29" r="2" fill="${INK}"/><circle cx="39" cy="29" r="2" fill="${INK}"/>`,
      ),
    ),
};

export function badgeSvg(id: string): string {
  const t = THEME_COLORS[id];
  const icon = ICONS[id];
  if (!t || !icon) throw new Error(`unknown theme ${id}`);
  const c = t.main;
  const base = merge(
    frag(`<circle cx="32" cy="32" r="30.5" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>`),
    shape(ellipseD(32, 32, 25, 25), { fill: c, shade: darken(c, 0.18), shadeOffset: [-4, -5], sw: 2.6 }),
    frag(`<circle cx="32" cy="32" r="21" fill="none" stroke="${lighten(c, 0.4)}" stroke-width="1.6" stroke-dasharray="1.5 3.5" stroke-linecap="round"/>`),
  );
  return svgDoc(64, 64, merge(grained(base, 0.05, [0, 0, 64, 64]), icon(c)));
}

export function build(write: (rel: string, data: string) => void): number {
  for (const id of Object.keys(THEME_COLORS)) write(`themes/${id}.svg`, badgeSvg(id));
  return Object.keys(THEME_COLORS).length;
}
