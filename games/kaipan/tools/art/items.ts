/**
 * 道具图标：64×64，24 个，id 与 src/core/content/items.ts 一致。
 * 造型：按道具类别着色的圆角方贴纸（战法 = 暖桃、工具 = 天蓝、人脉 = 淡紫）+ 一件大号彩色物件，
 * 物件可以略微出框，40px 下仍要一眼认出。不用 <text>，数字和符号都是路径。
 */
import { INK, WHITE, type Frag, darken, ellipseD, frag, grained, hiArc, lighten, merge, rrectD, shape, smoothClosed, sparkleD, starD, svgDoc } from './lib/svg.ts';

function line(d: string, color: string, w: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
}

/** 外描边 + 内色线：粗线条物件（旗杆、吸管、胡须） */
function rod(d: string, color: string, w = 3.2): string {
  return line(d, INK, w + 3.4) + line(d, color, w);
}

export type ItemKind = 'tactic' | 'tool' | 'network';

export const ITEM_KIND: Record<string, ItemKind> = {
  longtou: 'tactic', genfeng: 'tactic', baima: 'tactic', yaogu: 'tactic', lianban: 'tactic', dixi: 'tactic',
  zhisun: 'tactic', zhiying: 'tactic', extra_slot: 'tool', double_buy: 'tool', margin: 'tool', ipo: 'tool',
  credit: 'tool', paid_group: 'network', notebook: 'network', mood_meter: 'network', hot_money: 'tactic',
  value_eye: 'tactic', fan_qunzhu: 'network', diversify: 'tactic', fomo: 'tool', night_review: 'network',
  crowd_fund: 'tool', rumor_mill: 'network',
  short_permit: 'tool', sunglasses: 'tactic', banker: 'network', pyramid: 'tactic',
};

export const ITEM_NAMES: Record<string, string> = {
  longtou: '龙头战法', genfeng: '跟风大法', baima: '白马信仰', yaogu: '妖股猎人', lianban: '连板梦', dixi: '低吸大师',
  zhisun: '止损单', zhiying: '止盈单', extra_slot: '多开一格', double_buy: '手快', margin: '两融账户', ipo: '打新中签',
  credit: '信用卡', paid_group: '付费群', notebook: '老王的小本本', mood_meter: '情绪指标', hot_money: '游资席位',
  value_eye: '价值眼光', fan_qunzhu: '反着信群主', diversify: '分散投资', fomo: 'FOMO 体质', night_review: '熬夜复盘',
  crowd_fund: '众筹炒股', rumor_mill: '小道消息',
  short_permit: '押跌许可证', sunglasses: '空军墨镜', banker: '银行有熟人', pyramid: '越涨越加',
};

export const ITEM_IDS = Object.keys(ITEM_KIND);

const KIND_TINT: Record<ItemKind, string> = { tactic: '#ffd9bd', tool: '#cfe6ff', network: '#e4d8ff' };

const GOLD = '#ffd23f';
const RED = '#ff5a4a';
const GREEN = '#3cbf6a';

function coin(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GOLD}" stroke="${INK}" stroke-width="2.6"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.68}" fill="none" stroke="#e0a020" stroke-width="1.8"/>` +
    `<path d="${starD(cx, cy + r * 0.04, r * 0.42)}" fill="#f0a020"/>` + hiArc(`M${cx - r * 0.6} ${cy - r * 0.2}q${r * 0.2} ${-r * 0.4} ${r * 0.5} ${-r * 0.5}`, 1.8, 0.8);
}

function arrow(cx: number, cy: number, up: boolean, color: string, s = 1): string {
  const d = up ? 'M0 -9L8 0H3.5V8H-3.5V0H-8Z' : 'M0 9L8 0H3.5V-8H-3.5V0H-8Z';
  return `<path transform="translate(${cx} ${cy}) scale(${s})" d="${d}" fill="${color}" stroke="${INK}" stroke-width="${(2.2 / s).toFixed(2)}" stroke-linejoin="round"/>`;
}

/** 圆形小徽标（物件右下角的补充符号） */
function badge(cx: number, cy: number, r: number, inner: string, fill = WHITE): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="2.4"/>` + inner;
}

function crown(cx: number, cy: number, s: number): string {
  return `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-14 7L-15 -7L-7 0L0 -12L7 0L15 -7L14 7Z" fill="${GOLD}" stroke="${INK}" stroke-width="${(3 / s).toFixed(2)}" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="-12" r="2.6" fill="#ff5d7a" stroke="${INK}" stroke-width="${(1.6 / s).toFixed(2)}"/></g>`;
}

function heartD(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + 6 * s}C${cx - 7 * s} ${cy + 1 * s} ${cx - 7 * s} ${cy - 4 * s} ${cx - 3.5 * s} ${cy - 5 * s}C${cx - 1.6 * s} ${cy - 5.6 * s} ${cx - 0.4 * s} ${cy - 4.4 * s} ${cx} ${cy - 3.2 * s}C${cx + 0.4 * s} ${cy - 4.4 * s} ${cx + 1.6 * s} ${cy - 5.6 * s} ${cx + 3.5 * s} ${cy - 5 * s}C${cx + 7 * s} ${cy - 4 * s} ${cx + 7 * s} ${cy + 1 * s} ${cx} ${cy + 6 * s}Z`;
}

const ICONS: Record<string, () => Frag> = {
  /** 龙头战法：戴小皇冠的 Q 版龙头 */
  longtou: () => {
    const horn = (sx: number) => rod(`M${32 + sx * 9} 22L${32 + sx * 15} 8M${32 + sx * 13} 13L${32 + sx * 19} 11`, GOLD, 3.4);
    const mane = (sx: number) => `<path d="M${32 + sx * 15} 26L${32 + sx * 26} 24L${32 + sx * 21} 32L${32 + sx * 27} 38L${32 + sx * 16} 40Z" fill="#56c45a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
    const head = shape(smoothClosed([[32, 17], [46, 22], [50, 36], [44, 50], [32, 54], [20, 50], [14, 36], [18, 22]]), { fill: '#ff6a4d', sw: 3 });
    const face =
      `<ellipse cx="32" cy="44" rx="12" ry="7.5" fill="#ffb08a" stroke="${INK}" stroke-width="2.4"/>` +
      `<ellipse cx="27.5" cy="43" rx="1.8" ry="2.4" fill="${INK}"/><ellipse cx="36.5" cy="43" rx="1.8" ry="2.4" fill="${INK}"/>` +
      `<circle cx="25" cy="31" r="5" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/><circle cx="39" cy="31" r="5" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/>` +
      `<circle cx="26" cy="32" r="2.6" fill="${INK}"/><circle cx="38" cy="32" r="2.6" fill="${INK}"/>` +
      line('M20 25l7 2M44 25l-7 2', INK, 2.4) +
      rod('M21 46Q12 46 10 52', GOLD, 1.8) + rod('M43 46Q52 46 54 52', GOLD, 1.8);
    return merge(frag(horn(-1) + horn(1) + mane(-1) + mane(1)), head, frag(face + crown(32, 14, 0.5)));
  },
  /** 跟风大法：迎风飘的跟风小黄旗 */
  genfeng: () => {
    const cloth = shape('M22 12Q33 5 43 12Q50 17 56 13L54 36Q47 41 40 34Q31 27 22 34Z', { fill: '#ffcf3a', shadeOffset: [-3, -3], sw: 3 });
    return merge(
      frag(line('M8 24h8M6 32h10M10 40h6', '#7fc8ff', 3) + rod('M21 56L22 10', '#c98a4a', 3)),
      cloth,
      frag(`<path d="${starD(36, 22, 6)}" fill="${WHITE}"/><circle cx="22" cy="9" r="3.6" fill="${GOLD}" stroke="${INK}" stroke-width="2.2"/>` + line('M36 48q6 -3 12 0t12 0', '#7fc8ff', 3)),
    );
  },
  /** 白马信仰：打领带的白马侧脸（各部件先统一描外轮廓，再整体上色） */
  baima: () => {
    const parts = [
      'M30 58L22 40L44 30L48 58Z', // 脖子
      ellipseD(32, 26, 14, 12),
      'M12 44Q4 40 7 32Q10 26 20 24L28 34Q24 44 12 44Z', // 鼻吻
      'M24 18L22 4L32 14Z', // 耳朵
    ];
    const outline = parts.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`).join('');
    const fill = parts.map((d) => `<path d="${d}" fill="#fffdf7"/>`).join('');
    let mane = '';
    for (const [x, y, r] of [[38, 12, 6], [45, 18, 6], [49, 27, 6], [51, 37, 6], [52, 47, 6], [52, 56, 5]] as const) {
      mane += `<circle cx="${x}" cy="${y}" r="${r}" fill="#8fa8d8" stroke="${INK}" stroke-width="2.6"/>`;
    }
    const details =
      `<path d="M30 58L24 44" stroke="#dfe6f0" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M36 14Q44 20 44 30" fill="none" stroke="#dfe6f0" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M24 9L26 15" stroke="#ffb3c0" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="26" cy="25" r="3" fill="${INK}"/><circle cx="25" cy="24" r="1" fill="${WHITE}"/>` +
      `<ellipse cx="10" cy="35" rx="1.6" ry="2.2" fill="${INK}"/>` + line('M9 40q4 2 8 0', INK, 1.8) +
      `<ellipse cx="22" cy="32" rx="3.4" ry="2" fill="#ff8fa3" fill-opacity="0.6"/>`;
    const tie = `<path d="M28 46l12 -3 1 5 -10 3z" fill="${WHITE}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M31 48h8l-2 4h-4z" fill="#4b62c8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M33 52h4l2 8h-8z" fill="#3047a8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    return frag(mane + outline + fill + details + tie + `<path d="${sparkleD(10, 12, 5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6"/>`);
  },
  /** 妖股猎人：准星里的闪电 */
  yaogu: () =>
    frag(
      `<circle cx="32" cy="32" r="22" fill="#fff6ea" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="32" r="15" fill="none" stroke="${RED}" stroke-width="3.4"/>` +
        line('M32 6V16M32 48V58M6 32H16M48 32H58', INK, 3.4) +
        `<path d="M36 13L22 34H31L27 51L43 27H34L38 13Z" fill="#ffe14a" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
    ),
  /** 连板梦：一级比一级高的红色涨停板 + 月亮星星 */
  lianban: () => {
    let s = `<path d="M18 8a9 9 0 1 0 9 12a7 7 0 1 1 -9 -12z" fill="${GOLD}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="${starD(34, 12, 3.4)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.2"/>`;
    const tops = [44, 38, 31, 24, 16];
    tops.forEach((t, i) => {
      const x = 9 + i * 10;
      s += line(`M${x + 4} ${t - 4}V${t}`, INK, 2);
      s += `<rect x="${x}" y="${t}" width="8" height="${55 - t}" rx="1.5" fill="${RED}" stroke="${INK}" stroke-width="2.4"/>`;
      s += line(`M${x + 2.5} ${t + 3}v${Math.max(3, (55 - t) * 0.4)}`, '#ffb3a8', 1.6);
    });
    return frag(s + arrow(50, 8, true, RED, 0.7));
  },
  /** 低吸大师：贴着向下箭头的饮料杯和吸管 */
  dixi: () => {
    const cup = shape('M16 26H48L43 57Q43 59 41 59H23Q21 59 21 57Z', { fill: '#8fe0ff', shade: '#62c4ea', sw: 3, extra: hiArc('M21 32l2 18', 2.6, 0.7) });
    return merge(
      frag(rod('M36 28L42 8L52 6', '#ff7a9a', 3.4)),
      cup,
      frag(`<rect x="13" y="22" width="38" height="7" rx="3.5" fill="${WHITE}" stroke="${INK}" stroke-width="2.6"/>` + arrow(32, 43, false, GREEN, 1.15)),
    );
  },
  /** 止损单：红色八角停止牌 + 绿色向下小徽标 */
  zhisun: () => {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = ((22.5 + i * 45) * Math.PI) / 180;
      d += `${i ? 'L' : 'M'}${(30 + Math.cos(a) * 23).toFixed(1)} ${(30 + Math.sin(a) * 23).toFixed(1)}`;
    }
    const sign = shape(d + 'Z', { fill: '#ef4a3c', sw: 3, extra: `<rect x="17" y="26" width="26" height="8" rx="3" fill="${WHITE}"/>` + hiArc('M14 22l5 -6', 2.6, 0.6) });
    return merge(sign, frag(badge(48, 48, 10, arrow(48, 48, false, GREEN, 0.85))));
  },
  /** 止盈单：扎口的钱袋 + 红色向上小徽标 */
  zhiying: () => {
    const bag = shape('M20 28Q8 56 31 57Q54 56 42 28Z', { fill: '#f6c02f', sw: 3, extra: `<path d="${starD(31, 44, 7)}" fill="#e0a020"/>` + hiArc('M18 40q1 -6 4 -9', 2.6, 0.6) });
    const top = `<path d="M22 24L17 11L25 15L31 9L37 15L45 11L40 24Z" fill="#f6c02f" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      `<rect x="19" y="23" width="24" height="6" rx="3" fill="#b8773a" stroke="${INK}" stroke-width="2.4"/>`;
    return merge(bag, frag(top + badge(49, 47, 10, arrow(49, 48, true, RED, 0.85))));
  },
  /** 多开一格：三格已占 + 一格虚线加号 */
  extra_slot: () => {
    const cell = (x: number, y: number, c: string) => shape(rrectD(x, y, 21, 21, 5), { fill: c, sw: 2.8, shadeOffset: [-2, -3], extra: `<circle cx="${x + 7.5}" cy="${y + 10}" r="1.6" fill="${INK}"/><circle cx="${x + 13.5}" cy="${y + 10}" r="1.6" fill="${INK}"/>` });
    return merge(
      cell(8, 8, '#1fbfe8'), cell(35, 8, '#ff7a33'), cell(8, 35, '#9ad13c'),
      frag(`<rect x="35" y="35" width="21" height="21" rx="5" fill="${WHITE}" fill-opacity="0.7" stroke="${INK}" stroke-width="2.6" stroke-dasharray="4 3"/>` +
        `<path d="M45.5 39v13M39 45.5h13" stroke="${GREEN}" stroke-width="4.4" stroke-linecap="round"/>`),
    );
  },
  /** 手快：伸出食指点击的手 + 残影和速度线 */
  double_buy: () => {
    const handD = 'M28 12Q28 7 32 7Q36 7 36 12V28L44 28Q50 29 50 35V46Q50 57 38 57H30Q22 57 20 50L15 38Q14 34 17 33Q20 32 22 35L26 40V12Z';
    const ghost = `<path d="${handD}" transform="translate(-9 3)" fill="#ffe0c2" fill-opacity="0.45" stroke="${INK}" stroke-opacity="0.35" stroke-width="2.4"/>`;
    const hand = shape(handD, { fill: '#ffe0c2', shade: '#f2c49c', sw: 3, extra: line('M36 30v8M43 30v8', '#d9a07a', 1.8) });
    return merge(frag(ghost + line('M4 26h6M3 34h7M5 42h5', '#7fc8ff', 3)), hand, frag(line('M32 1v2M24 4l1.5 1.8M40 4l-1.5 1.8', RED, 2.4)));
  },
  /** 两融账户：撬棍杠杆，左端小砝码压下去，右端撬起一摞金币 */
  margin: () => {
    let coins = '';
    for (let i = 0; i < 3; i++) {
      const y = 30 - i * 5;
      coins += `<path d="M38 ${y}v3a9 3.5 0 0 0 18 0v-3" fill="#f0a020" stroke="${INK}" stroke-width="2"/><ellipse cx="47" cy="${y}" rx="9" ry="3.5" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>`;
    }
    const lever =
      `<rect x="3" y="24" width="12" height="10" rx="2" fill="#5a6070" stroke="${INK}" stroke-width="2.4"/>` +
      `<rect x="2" y="34" width="58" height="7" rx="3" fill="#c98a4a" stroke="${INK}" stroke-width="2.6"/>` + coins;
    return merge(
      shape('M24 45L14 58H34Z', { fill: '#9aa6c0', sw: 2.8 }),
      frag(`<g transform="rotate(-22 32 38)">${lever}</g>` + arrow(10, 22, false, RED, 0.7) + line('M52 4v4M57 8l-3 2M46 6l1 3', INK, 2)),
    );
  },
  /** 打新中签：签筒里蹦出一支带星的红签 */
  ipo: () => {
    const sticks = [[22, 12, -14], [28, 10, -5], [36, 11, 6], [41, 14, 15]].map(([x, y, r]) => `<rect x="${x! - 2.5}" y="${y}" width="5" height="34" rx="2" fill="#e8c88a" stroke="${INK}" stroke-width="2" transform="rotate(${r} ${x} 44)"/>`).join('');
    const lucky = `<g transform="rotate(10 40 30)"><rect x="37" y="2" width="6" height="34" rx="2.5" fill="${RED}" stroke="${INK}" stroke-width="2.2"/><path d="${starD(40, 8, 4)}" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/></g>`;
    const tube = shape('M16 30H48L46 56Q46 59 43 59H21Q18 59 18 56Z', { fill: '#d9534a', sw: 3, extra: `<rect x="16.5" y="36" width="31" height="5" fill="${GOLD}"/>` + line('M17 36H47M17.5 41H46.5', INK, 1.6) + hiArc('M22 46v7', 2.4, 0.5) });
    return merge(frag(sticks + lucky), tube, frag(`<path d="${sparkleD(54, 8, 5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6"/><path d="${sparkleD(52, 24, 3.5)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.4"/>`));
  },
  /** 信用卡：斜放的蓝色卡片 + 芯片 */
  credit: () => {
    const card = shape(rrectD(6, 17, 52, 33, 6), {
      fill: '#4f7cff', sw: 3,
      extra: `<rect x="6" y="24" width="52" height="7" fill="#2f3b80"/><rect x="12" y="35" width="11" height="9" rx="2" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>` +
        line('M12 39.5h11M17.5 35v9', '#e0a020', 1.2) + line('M28 44h6M37 44h6M46 44h6', '#cfe0ff', 2.4) + hiArc('M10 21h14', 2.4, 0.55),
    });
    return merge(frag(`<g transform="rotate(-12 32 34)">${card.content}</g>`, card.defs), frag(coin(50, 52, 8)));
  },
  /** 付费群：戴皇冠的群聊气泡 + 金币 */
  paid_group: () => {
    const bubble = shape('M14 12H44Q52 12 52 20V34Q52 42 44 42H24L14 50L16 42Q8 41 8 34V20Q8 12 14 12Z', { fill: '#7ad86a', sw: 3 });
    return merge(bubble, frag([20, 30, 40].map((x) => `<circle cx="${x}" cy="27" r="3.2" fill="${WHITE}"/>`).join('') + crown(14, 10, 0.48) + coin(48, 48, 10)));
  },
  /** 老王的小本本：螺旋小本 + 满页红笔勾 + 红笔 */
  notebook: () => {
    const book = shape(rrectD(14, 7, 34, 48, 4), {
      fill: '#c97b4a', sw: 3,
      extra: `<rect x="21" y="13" width="22" height="34" rx="2" fill="#fffaf0" stroke="${INK}" stroke-width="1.8"/>` +
        line('M24 19l2 2 4 -4M24 27l2 2 4 -4M24 35l2 2 4 -4', RED, 2) + line('M33 19h7M33 27h7M33 35h5', '#e8a0a0', 2),
    });
    const rings = [12, 20, 28, 36, 44, 50].map((y) => `<ellipse cx="14" cy="${y}" rx="4" ry="2" fill="none" stroke="${INK}" stroke-width="2.2"/>`).join('');
    return merge(book, frag(rings + `<g transform="rotate(40 46 46)"><rect x="43" y="26" width="6" height="30" rx="2" fill="${RED}" stroke="${INK}" stroke-width="2.2"/><path d="M43 56L46 62L49 56Z" fill="#ffe0c2" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></g>`));
  },
  /** 情绪指标：冷到热四色仪表盘 */
  mood_meter: () => {
    const cx = 32, cy = 42, r = 21;
    const seg = (a0: number, a1: number, c: string) => {
      const p = (a: number) => `${(cx + Math.cos((a * Math.PI) / 180) * r).toFixed(1)} ${(cy + Math.sin((a * Math.PI) / 180) * r).toFixed(1)}`;
      return `<path d="M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}" fill="none" stroke="${c}" stroke-width="9"/>`;
    };
    const base = shape(`M${cx - 29} ${cy + 4}A29 29 0 0 1 ${cx + 29} ${cy + 4}V${cy + 12}H${cx - 29}Z`, { fill: '#fff6ea', sw: 3 });
    return merge(
      base,
      frag(`<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${INK}" stroke-width="13"/>` +
        seg(180, 225, '#5ab0ff') + seg(225, 270, '#5fd08a') + seg(270, 315, '#ffd23f') + seg(315, 360, '#ff5a4a') +
        rod(`M${cx} ${cy}L${cx + 13} ${cy - 13}`, '#3a3448', 2.4) + `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>`),
    );
  },
  /** 游资席位：冒火的金币冲过来 */
  hot_money: () => {
    const flame = shape('M22 54Q6 50 8 34Q10 24 18 18Q16 28 22 30Q22 18 32 8Q32 20 40 24Q44 16 42 10Q56 22 54 38Q52 52 40 56Z', { fill: '#ff7a33', shade: '#e8452e', sw: 3 });
    const inner = `<path d="M26 54Q16 50 18 40Q20 34 24 32Q26 38 30 38Q30 30 36 24Q40 34 44 36Q48 50 38 54Z" fill="#ffc93a"/>`;
    return merge(flame, frag(inner + coin(32, 42, 12) + line('M2 50h5M3 58h7', '#ff7a33', 3)));
  },
  /** 价值眼光：瞳孔是金币的眼睛 */
  value_eye: () => {
    const eye = shape('M4 32Q32 6 60 32Q32 58 4 32Z', { fill: WHITE, shade: '#dfe6f0', sw: 3 });
    return merge(
      frag(line('M14 16l-3 -5M24 11l-1 -6M34 10V4M44 12l2 -6M52 18l4 -4', INK, 2.6)),
      eye,
      frag(coin(32, 32, 12) + `<circle cx="27" cy="27" r="2.6" fill="${WHITE}"/>` + `<path d="${sparkleD(54, 48, 6)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.6"/>`),
    );
  },
  /** 反着信群主：喇叭 + 掉头箭头 */
  fan_qunzhu: () => {
    const horn = shape('M10 32L12 26H20L44 12V52L20 38H12Z', { fill: '#ff8a3d', sw: 3, extra: hiArc('M24 26l14 -8', 2.4, 0.6) });
    return merge(
      frag(`<rect x="15" y="36" width="8" height="16" rx="3" fill="#5a6070" stroke="${INK}" stroke-width="2.4" transform="rotate(-10 19 44)"/>`),
      horn,
      frag(`<ellipse cx="45" cy="32" rx="5" ry="20" fill="#ffc29a" stroke="${INK}" stroke-width="2.8"/>` +
        line('M58 30Q60 12 46 8Q36 6 30 12', INK, 7) + line('M58 30Q60 12 46 8Q36 6 30 12', '#5aa0ff', 3.4) +
        `<path d="M24 8L33 4L31 15Z" fill="#5aa0ff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
    );
  },
  /** 分散投资：四色分开的饼图 */
  diversify: () => {
    const cx = 31, cy = 33, r = 22;
    const cols = ['#1fbfe8', '#9ad13c', '#ff7a33', '#cc4fe0'];
    let s = '';
    for (let i = 0; i < 4; i++) {
      const a0 = -90 + i * 90, a1 = a0 + 90;
      const mid = ((a0 + 45) * Math.PI) / 180;
      const off = i === 1 ? 5 : 1.4;
      const ox = cx + Math.cos(mid) * off, oy = cy + Math.sin(mid) * off;
      const p = (a: number) => `${(ox + Math.cos((a * Math.PI) / 180) * r).toFixed(1)} ${(oy + Math.sin((a * Math.PI) / 180) * r).toFixed(1)}`;
      s += `<path d="M${ox.toFixed(1)} ${oy.toFixed(1)}L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z" fill="${cols[i]}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`;
    }
    return frag(s + hiArc('M15 24q4 -8 12 -10', 2.6, 0.6));
  },
  /** FOMO 体质：狂响的闹钟 + 汗 */
  fomo: () => {
    const bells = `<circle cx="17" cy="15" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.6"/><circle cx="45" cy="15" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.6"/>` +
      line('M20 54l-4 6M42 54l4 6', INK, 3.4);
    const body = shape(ellipseD(31, 36, 20, 20), { fill: '#ff6a5a', sw: 3, extra: `<circle cx="31" cy="36" r="14" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` + line('M31 36V26M31 36L38 40', INK, 2.8) + `<circle cx="31" cy="36" r="2" fill="${INK}"/>` });
    return merge(frag(bells + line('M4 30l4 2M3 40l5 0M56 30l-4 2M58 40l-5 0', INK, 2.4)), body, frag(`<path d="M54 10q-5 7 -5 10a5 5 0 0 0 10 0q0 -3 -5 -10z" fill="#7fd3ff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`));
  },
  /** 熬夜复盘：月亮下冒热气的咖啡杯，杯上一根小 K 线 */
  night_review: () => {
    const mug = shape('M12 28H42V50Q42 57 35 57H19Q12 57 12 50Z', {
      fill: WHITE, shade: '#dfe6f0', sw: 3,
      extra: `<ellipse cx="27" cy="30" rx="13" ry="3" fill="#8a5a3a"/>` + line('M17 48l5 -5 4 3 8 -9', RED, 2.4) + hiArc('M16 36v8', 2.4, 0.5),
    });
    return merge(
      frag(`<path d="M50 6a10 10 0 1 0 8 15a8 8 0 1 1 -8 -15z" fill="${GOLD}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
        `<path d="${starD(38, 10, 3.4)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.2"/>` + line('M20 22q-3 -4 0 -8M28 22q-3 -4 0 -8M36 22q-3 -4 0 -8', '#b8a6c8', 2.6) +
        line('M42 34Q52 34 52 42Q52 50 42 50', INK, 7) + line('M42 34Q52 34 52 42Q52 50 42 50', WHITE, 3)),
      mug,
    );
  },
  /** 众筹炒股：亲戚们凑的一叠红包 */
  crowd_fund: () => {
    const env = (x: number, y: number, r: number) => {
      const e = shape(rrectD(-13, -17, 26, 34, 4), { fill: '#e8352e', sw: 2.8, extra: `<path d="M-13 -9Q0 0 13 -9" fill="none" stroke="#a8201a" stroke-width="2"/><circle cx="0" cy="-3" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>` });
      return frag(`<g transform="translate(${x} ${y}) rotate(${r})">${e.content}</g>`, e.defs);
    };
    return merge(env(20, 36, -14), env(44, 36, 14), env(32, 32, 0), frag(coin(12, 12, 6) + coin(52, 12, 6) + coin(32, 7, 5)));
  },
  /** 小道消息：大耳朵 + 冒问号的悄悄话气泡 */
  rumor_mill: () => {
    const ear = shape('M30 58Q22 58 20 50Q19 44 14 38Q8 30 10 22Q14 8 28 8Q42 8 44 22Q46 32 38 38Q34 42 36 50Q36 58 30 58Z', {
      fill: '#ffd2b0', shade: '#f0b08a', sw: 3,
      extra: line('M22 24Q24 16 30 16Q36 17 36 24Q36 30 30 32Q26 34 28 40', '#d9876a', 2.6),
    });
    const bubble = shape('M42 4H58Q62 4 62 8V20Q62 24 58 24H50L44 29L45 24H42Q38 24 38 20V8Q38 4 42 4Z', { fill: WHITE, shade: '#e6e0f0', sw: 2.6 });
    return merge(
      ear,
      bubble,
      frag([45, 50, 55].map((x) => `<circle cx="${x}" cy="14" r="1.9" fill="${INK}"/>`).join('') + line('M46 36q4 2 6 6M48 30q6 2 10 8', '#9b7fd8', 2.4)),
    );
  },
  /** 押跌许可证：盖章的证件，上面一支向下的绿箭头 */
  short_permit: () =>
    merge(
      shape(rrectD(10, 10, 44, 42, 5), {
        fill: WHITE, shade: '#e6ecf5', sw: 3,
        extra: `<rect x="10" y="10" width="44" height="9" fill="#3cbf6a" stroke="${INK}" stroke-width="2.4"/>` + line('M17 28h18M17 35h12', '#9aa6b8', 2.6),
      }),
      frag(arrow(44, 34, false, GREEN, 1.4) + `<circle cx="46" cy="49" r="8" fill="none" stroke="${RED}" stroke-width="3" stroke-opacity="0.9"/>` + line('M42 49l3 3 5 -6', RED, 2.6)),
    ),
  /** 空军墨镜：大墨镜 */
  sunglasses: () =>
    merge(
      frag(line('M6 26L12 28M58 26L52 28', INK, 3.2)),
      shape('M8 24H56V32Q55 46 44 46Q35 46 34 34H30Q29 46 20 46Q9 46 8 32Z', { fill: '#2b2440', sw: 3, extra: line('M13 30l7 0M38 30l7 0', WHITE, 2.4, ' stroke-opacity="0.85"') + line('M14 38l6 -8M39 38l6 -8', WHITE, 2.2, ' stroke-opacity="0.5"') }),
      frag(arrow(32, 56, false, GREEN, 0.8)),
    ),
  /** 银行有熟人：小银行楼 + 握手的爱心 */
  banker: () =>
    merge(
      shape('M8 24L32 8L56 24Z', { fill: '#ffd23f', sw: 3 }),
      shape(rrectD(12, 26, 40, 24, 2), { fill: '#f4ecd8', sw: 3, extra: [18, 28, 38].map((x) => `<rect x="${x}" y="28" width="6" height="18" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`).join('') }),
      shape(rrectD(6, 50, 52, 7, 2), { fill: '#c9a640', sw: 2.8 }),
      frag(`<path d="${heartD(48, 18, 1.5)}" fill="#ff5d7a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
    ),
  /** 越涨越加：一级比一级高的金币柱 */
  pyramid: () => {
    const bar = (x: number, h: number, c: string) => shape(rrectD(x, 56 - h, 12, h, 2), { fill: c, sw: 2.8 });
    return merge(
      bar(8, 14, '#9ad13c'), bar(22, 26, '#6fcf5a'), bar(36, 38, '#3cbf6a'),
      frag(arrow(52, 14, true, RED, 1.1) + coin(14, 38, 5) + coin(28, 26, 5) + coin(42, 14, 5)),
    );
  },
};

function tile(kind: ItemKind): Frag {
  const c = KIND_TINT[kind];
  return grained(
    shape(rrectD(4, 4, 56, 56, 14), {
      fill: c,
      shade: darken(c, 0.08),
      shadeOffset: [-4, -5],
      sw: 3,
      extra: `<path d="${rrectD(8, 8, 48, 48, 11)}" fill="none" stroke="${lighten(c, 0.6)}" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>`,
    }),
    0.06,
    [0, 0, 64, 64],
  );
}

export function itemSvg(id: string): string {
  const icon = ICONS[id];
  const kind = ITEM_KIND[id];
  if (!icon || !kind) throw new Error(`unknown item ${id}`);
  return svgDoc(64, 64, merge(tile(kind), icon()));
}

export function build(write: (rel: string, data: string) => void): number {
  for (const id of ITEM_IDS) write(`items/${id}.svg`, itemSvg(id));
  return ITEM_IDS.length;
}
