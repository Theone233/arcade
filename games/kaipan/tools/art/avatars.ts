/**
 * 群友头像：96×96 圆形，8 个人 × 3 种表情（normal 正常 / smug 得意 / awkward 尴尬）。
 * 卡通原创人物，不对应任何真实的人。
 */
import { BLUSH, INK, TEAR, WHITE, type Frag, darken, ellipseD, frag, grained, hiArc, lighten, merge, shape, sparkleD, svgDoc } from './lib/svg.ts';

export const AVATAR_IDS = ['xiaoli', 'laowang', 'zhangjie', 'qunzhu', 'laozhao', 'dav', 'neimu', 'zhuchang', 'kongjun'] as const;
export const AVATAR_EXPR = ['normal', 'smug', 'awkward'] as const;
type AExpr = (typeof AVATAR_EXPR)[number];

export const AVATAR_NAMES: Record<string, string> = {
  xiaoli: '小李（大学生）',
  laowang: '老王（退休教师）',
  zhangjie: '张姐（宝妈）',
  qunzhu: '群主"韭菜收割机"',
  laozhao: '老赵（游资）',
  dav: '大V"股市小诸葛"',
  neimu: '内幕哥',
  zhuchang: '猪场老板',
  kongjun: '空军老周（唱空）',
};

const S = 96;
const HX = 48;
const HY = 52;

function line(d: string, color: string, w: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
}

interface Person {
  bg: string;
  skin: string;
  /** 头后面的头发 */
  hairBack?: (e: AExpr) => Frag;
  /** 衣服（肩膀） */
  clothes: Frag;
  /** 盖在额头上的刘海、帽子 */
  hairFront?: Frag;
  /** 眼睛被眼镜 / 墨镜挡住的处理 */
  eyewear?: 'round' | 'shades';
  /** 最上层的道具 */
  props?: (e: AExpr) => Frag;
  brow?: string;
  /** 胡子等，画在嘴下面 */
  beard?: Frag;
}

function head(skin: string): Frag {
  const ears =
    `<ellipse cx="${HX - 25}" cy="${HY + 3}" rx="5" ry="6" fill="${skin}" stroke="${INK}" stroke-width="3"/>` +
    `<ellipse cx="${HX + 25}" cy="${HY + 3}" rx="5" ry="6" fill="${skin}" stroke="${INK}" stroke-width="3"/>`;
  return merge(frag(ears), shape(ellipseD(HX, HY, 24, 23), { fill: skin, shade: darken(skin, 0.1), shadeOffset: [-3, -4], sw: 3.2 }));
}

function shoulders(color: string, extra = ''): Frag {
  return merge(
    frag(`<rect x="${HX - 7}" y="${HY + 18}" width="14" height="10" fill="#f0c49c" stroke="${INK}" stroke-width="3"/>`),
    shape(`M10 100Q12 80 32 75H64Q84 80 86 100Z`, { fill: color, shadeOffset: [-4, -4], sw: 3.2, extra }),
  );
}

function face(e: AExpr, p: Person): Frag {
  const ex = 9.5;
  const ey = HY + 2;
  const brow = p.brow ?? INK;
  let s = '';
  // 眼睛
  if (p.eyewear !== 'shades') {
    if (e === 'normal') {
      s += `<ellipse cx="${HX - ex}" cy="${ey}" rx="3" ry="3.8" fill="${INK}"/><ellipse cx="${HX + ex}" cy="${ey}" rx="3" ry="3.8" fill="${INK}"/>`;
      s += `<circle cx="${HX - ex - 1}" cy="${ey - 1.4}" r="1.1" fill="${WHITE}"/><circle cx="${HX + ex - 1}" cy="${ey - 1.4}" r="1.1" fill="${WHITE}"/>`;
      s += line(`M${HX - ex - 4} ${ey - 8}q4 -2 8 0M${HX + ex - 4} ${ey - 8}q4 -2 8 0`, brow, 2.6);
    } else if (e === 'smug') {
      // 得意：左眼眨成 ^，右眼半眯，右眉高挑
      s += line(`M${HX - ex - 5} ${ey + 1.5}q5 -7 10 0`, INK, 3.4);
      s += `<path d="M${HX + ex - 4.5} ${ey - 1}h9a4.5 4.5 0 0 1 -9 0z" fill="${INK}"/>` + line(`M${HX + ex - 5.5} ${ey - 1.5}h11`, INK, 3);
      s += line(`M${HX - ex - 5} ${ey - 8}l9 1.5M${HX + ex - 5} ${ey - 10}q5 -5 10 -1`, brow, 3);
    } else {
      // 眼神飘向一边
      s += `<circle cx="${HX - ex}" cy="${ey}" r="4.6" fill="${WHITE}" stroke="${INK}" stroke-width="2.4"/><circle cx="${HX + ex}" cy="${ey}" r="4.6" fill="${WHITE}" stroke="${INK}" stroke-width="2.4"/>`;
      s += `<circle cx="${HX - ex + 2.2}" cy="${ey + 0.5}" r="2.4" fill="${INK}"/><circle cx="${HX + ex + 2.2}" cy="${ey + 0.5}" r="2.4" fill="${INK}"/>`;
      s += line(`M${HX - ex - 5} ${ey - 7}l9 -3M${HX + ex + 5} ${ey - 7}l-9 -3`, brow, 3);
    }
  } else {
    // 墨镜挡住眼睛：表情靠眉毛
    if (e === 'smug') s += line(`M${HX - ex - 5} ${ey - 9}l9 2M${HX + ex - 4} ${ey - 11}q4 -4 9 -1`, brow, 2.6);
    else if (e === 'awkward') s += line(`M${HX - ex - 5} ${ey - 8}l9 -3M${HX + ex + 5} ${ey - 8}l-9 -3`, brow, 2.6);
  }
  // 腮红
  if (e === 'awkward') {
    s += line(`M${HX - 18} ${ey + 8}l3 -3M${HX - 14} ${ey + 8}l3 -3M${HX + 12} ${ey + 8}l3 -3M${HX + 16} ${ey + 8}l3 -3`, '#ff6f8a', 1.8);
  } else {
    s += `<ellipse cx="${HX - 16}" cy="${ey + 8}" rx="4.5" ry="2.6" fill="${BLUSH}" fill-opacity="0.6"/><ellipse cx="${HX + 16}" cy="${ey + 8}" rx="4.5" ry="2.6" fill="${BLUSH}" fill-opacity="0.6"/>`;
  }
  // 鼻子
  s += line(`M${HX} ${ey + 5}q1.5 2 0 3`, darken(p.skin, 0.35), 2);
  // 嘴
  const my = HY + 14;
  if (e === 'normal') s += line(`M${HX - 5} ${my}q5 4 10 0`, INK, 2.8);
  else if (e === 'smug') s += `<path d="M${HX - 8} ${my - 2}Q${HX + 2} ${my + 2} ${HX + 10} ${my - 6}Q${HX + 8} ${my + 7} ${HX - 1} ${my + 5}Q${HX - 6} ${my + 3} ${HX - 8} ${my - 2}Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M${HX - 4} ${my - 0.5}Q${HX + 2} ${my + 1} ${HX + 7} ${my - 3.5}L${HX + 6.5} ${my - 1.5}Q${HX + 1} ${my + 2.5} ${HX - 3.5} ${my + 1}Z" fill="${WHITE}"/>`;
  else s += line(`M${HX - 8} ${my + 1}q2 -3 4 0t4 0t4 0t4 0`, INK, 2.8);
  const out = merge(frag(s), p.beard);
  if (p.eyewear === 'round') {
    out.content += `<circle cx="${HX - ex}" cy="${ey}" r="7.5" fill="#dff4ff" fill-opacity="0.35" stroke="${INK}" stroke-width="2.6"/><circle cx="${HX + ex}" cy="${ey}" r="7.5" fill="#dff4ff" fill-opacity="0.35" stroke="${INK}" stroke-width="2.6"/>` + line(`M${HX - 2} ${ey}h4`, INK, 2.4) + line(`M${HX - ex - 4} ${ey - 3}l3 -2`, '#ffffff', 1.6);
  } else if (p.eyewear === 'shades') {
    // 墨镜款靠墨镜本身表态：尴尬时歪斜下滑，得意时多一道大反光
    const tf = e === 'awkward' ? ` transform="translate(0 3) rotate(-9 ${HX} ${ey})"` : '';
    out.content += `<g${tf}>` +
      `<path d="M${HX - 21} ${ey - 5}H${HX + 21}V${ey - 2}Q${HX + 20} ${ey + 7} ${HX + 11} ${ey + 7}Q${HX + 3} ${ey + 7} ${HX + 2} ${ey}H${HX - 2}Q${HX - 3} ${ey + 7} ${HX - 11} ${ey + 7}Q${HX - 20} ${ey + 7} ${HX - 21} ${ey - 2}Z" fill="#2b2440" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      line(`M${HX - 16} ${ey - 2}l5 0M${HX + 6} ${ey - 2}l5 0`, '#ffffff', 1.8, ' stroke-opacity="0.8"') +
      (e === 'smug' ? line(`M${HX - 17} ${ey + 4}l7 -8M${HX + 5} ${ey + 4}l7 -8`, '#ffffff', 2.6) : '') +
      `</g>`;
  }
  if (e === 'smug') out.content += `<path d="${sparkleD(HX + 24, HY - 16, 7)}" fill="#fff6b0" stroke="${INK}" stroke-width="1.8"/>`;
  if (e === 'awkward') {
    out.content += `<path d="M${HX + 22} ${HY - 22}q-6 9 -6 13a6 6 0 0 0 12 0q0 -4 -6 -13z" fill="${TEAR}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + line(`M${HX + 19} ${HY - 10}q0 2.5 2 3.5`, '#ffffff', 1.8);
    out.content += line(`M${HX - 12} ${HY - 18}v7M${HX - 6} ${HY - 19}v9M${HX} ${HY - 18}v7`, '#6f7fd8', 2.4, ' stroke-opacity="0.8"');
  }
  return out;
}

// 每次调用重新构造：部件里的 clipPath id 由计数器生成，放在模块顶层会让输出依赖导入顺序
function people(): Record<string, Person> {
  return {
  xiaoli: {
    bg: '#b9a6ff',
    skin: '#ffe0c2',
    hairBack: () => shape(`M23 56Q18 26 48 24Q78 26 73 56Q72 44 66 40Q50 34 30 40Q24 46 23 56Z`, { fill: '#3a3048', shade: false, sw: 3 }),
    hairFront: merge(
      shape('M24 48L26 32L33 38L36 24L44 33L50 21L56 32L63 24L66 36L72 32L72 48Q64 36 58 38Q50 34 44 40Q36 34 30 42Z', { fill: '#3a3048', shade: false, sw: 3 }),
      frag(line('M52 23q-2 -9 7 -12', INK, 5) + line('M52 23q-2 -9 7 -12', '#3a3048', 2.4) + hiArc('M34 30l6 -3', 2, 0.5)),
    ),
    clothes: merge(
      shoulders('#ff8a3d', line('M40 76v12M56 76v12', '#ffffff', 2.4) + `<circle cx="40" cy="89" r="2" fill="#ffffff"/><circle cx="56" cy="89" r="2" fill="#ffffff"/>`),
      frag(`<path d="M26 82Q48 64 70 82" fill="none" stroke="${INK}" stroke-width="9"/><path d="M26 82Q48 64 70 82" fill="none" stroke="#5ee0ff" stroke-width="4.5"/><circle cx="25" cy="84" r="7" fill="#5ee0ff" stroke="${INK}" stroke-width="3"/><circle cx="71" cy="84" r="7" fill="#5ee0ff" stroke="${INK}" stroke-width="3"/>`),
    ),
    props: (e) => (e === 'smug' ? frag(`<g transform="translate(74 30) rotate(30)"><path d="M-4 6V-6Q-4 -14 0 -16Q4 -14 4 -6V6Z" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/><path d="M-3 6Q0 12 3 6Z" fill="#ffb020" stroke="${INK}" stroke-width="2"/></g>`) : frag()),
  },
  laowang: {
    bg: '#9ad7a0',
    skin: '#f6cfa8',
    hairBack: () => frag(),
    hairFront: frag(
      `<path d="M25 52Q22 40 28 36Q30 44 32 50Z" fill="#d9dbe2" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><path d="M71 52Q74 40 68 36Q66 44 64 50Z" fill="#d9dbe2" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>` +
        line('M42 30q2 -3 6 -2', darken('#f6cfa8', 0.25), 2) + hiArc('M36 34q4 -4 10 -5', 2.4, 0.7),
    ),
    eyewear: 'round',
    brow: '#9a9aa8',
    beard: frag(`<path d="M41 62q7 -4 14 0q-3 3 -7 2q-4 1 -7 -2z" fill="#d9dbe2" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`),
    clothes: merge(shoulders('#8a9a5b', `<path d="M38 75L48 90L58 75" fill="#ffffff" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` + `<circle cx="48" cy="94" r="1.8" fill="${INK}"/>`)),
    props: () => frag(`<g transform="translate(68 82)"><path d="M-9 -6H9V4Q9 10 0 10Q-9 10 -9 4Z" fill="#ffffff" stroke="${INK}" stroke-width="2.6"/><path d="M-6 -2h12" stroke="#5aa84c" stroke-width="2.4"/>${line('M-3 -10q-2 -3 0 -6M3 -10q-2 -3 0 -6', '#ffffff', 2)}</g>`),
  },
  zhangjie: {
    bg: '#ffb3c6',
    skin: '#ffe0c8',
    hairBack: () => {
      let d = '';
      const pts = 13;
      for (let i = 0; i <= pts; i++) {
        const a = Math.PI + (i / pts) * Math.PI * 1.0;
        const r = 30;
        const x = HX + Math.cos(a) * r;
        const y = HY - 2 + Math.sin(a) * r * 0.95;
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const curls = Array.from({ length: 12 }, (_, i) => {
        const a = Math.PI * 0.85 + (i / 11) * Math.PI * 1.3;
        return `<circle cx="${(HX + Math.cos(a) * 28).toFixed(1)}" cy="${(HY + 2 + Math.sin(a) * 27).toFixed(1)}" r="8" />`;
      }).join('');
      return frag(`<g fill="#8a4f32" stroke="${INK}" stroke-width="3">${curls}</g><g fill="#8a4f32">${curls.replace(/r="8"/g, 'r="6.2"')}</g><path d="${d}Z" fill="#8a4f32"/>`);
    },
    hairFront: frag(
      `<path d="M26 46Q28 26 48 26Q68 26 70 46Q64 36 56 38Q52 32 46 36Q38 32 34 40Q28 40 26 46Z" fill="#8a4f32" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M62 30l6 -4 2 6 -6 2z" fill="#ff5d7a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` + hiArc('M36 32q6 -4 12 -4', 2.4, 0.5),
    ),
    clothes: merge(shoulders('#ff7aa2', `<path d="M38 75Q48 84 58 75" fill="none" stroke="#ffffff" stroke-width="3"/>`), frag(`<circle cx="22" cy="62" r="3" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/><circle cx="74" cy="62" r="3" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`)),
    props: (e) => frag(`<g transform="translate(70 80) rotate(${e === 'awkward' ? -20 : 10})"><rect x="-7" y="-12" width="14" height="24" rx="3" fill="#3a3448" stroke="${INK}" stroke-width="2.6"/><rect x="-4.5" y="-8.5" width="9" height="15" rx="1.5" fill="#9fe08a"/><path d="M-3 -5h6M-3 -1h4" stroke="#ffffff" stroke-width="1.6"/></g>`),
  },
  qunzhu: {
    bg: '#ff9a6b',
    skin: '#ffd9b8',
    hairBack: () => frag(),
    hairFront: merge(
      shape('M24 48Q20 24 44 22Q70 18 74 40Q70 34 60 32Q66 26 52 28Q40 28 30 36Q26 40 24 48Z', { fill: '#2b2440', shade: false, sw: 3 }),
      frag(hiArc('M34 30q10 -6 22 -4', 3, 0.75) + hiArc('M60 30q6 2 8 6', 2.4, 0.6)),
    ),
    clothes: merge(
      shoulders('#e8352e', `<path d="M40 75L48 86L56 75" fill="#fffaf0" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
      frag(`<path d="M34 78Q48 96 62 78" fill="none" stroke="#ffd23f" stroke-width="3.6" stroke-dasharray="3 2.4"/>` + `<circle cx="48" cy="88" r="4" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>`),
    ),
    props: (e) =>
      frag(
        // 直播耳麦
        `<path d="M22 46Q20 22 48 20Q76 22 74 46" fill="none" stroke="${INK}" stroke-width="6"/><path d="M22 46Q20 22 48 20Q76 22 74 46" fill="none" stroke="#3a3448" stroke-width="2.6"/>` +
          `<rect x="17" y="42" width="9" height="15" rx="4" fill="#3a3448" stroke="${INK}" stroke-width="2.4"/>` +
          line('M22 56Q24 66 38 67', INK, 3) + `<ellipse cx="40" cy="67" rx="4" ry="3" fill="#3a3448" stroke="${INK}" stroke-width="2"/>` +
          (e === 'smug' ? `<rect x="50" y="64" width="4" height="4" fill="#ffd23f" stroke="${INK}" stroke-width="1"/>` : ''),
      ),
  },
  laozhao: {
    bg: '#5fc7c0',
    skin: '#eebf94',
    hairBack: () => frag(),
    hairFront: merge(
      shape('M22 44Q22 22 48 22Q74 22 74 40L84 44Q84 48 76 47Q50 40 22 46Z', { fill: '#4a4460', shade: '#3a3448', shadeOffset: [0, -4], sw: 3 }),
      frag(`<circle cx="48" cy="22" r="3" fill="#4a4460" stroke="${INK}" stroke-width="2"/>` + line('M30 34q18 -8 36 0', '#6b6585', 2)),
    ),
    beard: frag(`<g fill="#7a5a48" opacity="0.6">${[[40, 70], [44, 72], [52, 72], [56, 70], [48, 73], [36, 66], [60, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9"/>`).join('')}</g>`),
    clothes: merge(shoulders('#6b4a3a', `<path d="M36 75L44 88L48 78L52 88L60 75" fill="#4a3226" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + line('M48 82V100', '#c9a640', 2))),
    props: (e) => frag(line(`M${e === 'awkward' ? 54 : 52} 66l${e === 'smug' ? 12 : 10} ${e === 'smug' ? -6 : 2}`, '#e8c48a', 2.6)),
  },
  dav: {
    bg: '#7fb6ff',
    skin: '#ffe0c2',
    hairBack: () => frag(`<path d="M24 52Q20 30 48 26Q76 30 72 52Q66 40 48 40Q30 40 24 52Z" fill="#2b2440" stroke="${INK}" stroke-width="3"/>`),
    hairFront: merge(
      shape('M26 38Q26 18 48 16Q70 18 70 38Q60 32 48 32Q36 32 26 38Z', { fill: '#3d5bd6', shadeOffset: [0, -3], sw: 3 }),
      frag(`<path d="M68 34q10 4 12 16q-6 -6 -12 -8z" fill="#3d5bd6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` + line('M30 30q18 -6 36 0', '#ffffff', 2, ' stroke-opacity="0.6"')),
    ),
    beard: frag(`<path d="M45 70q3 6 6 0" fill="#2b2440" stroke="${INK}" stroke-width="1.6"/>`),
    clothes: merge(shoulders('#eaf2ff', `<path d="M36 75L48 92L60 75" fill="none" stroke="#3d5bd6" stroke-width="4"/>`)),
    props: (e) => {
      // 羽扇
      const rot = e === 'smug' ? -10 : e === 'awkward' ? 20 : 0;
      let fan = '';
      for (let i = -3; i <= 3; i++) fan += `<path d="M0 0L${(i * 4.5).toFixed(1)} -26" stroke="#d9e4f5" stroke-width="1.2"/>`;
      return frag(`<g transform="translate(70 90) rotate(${rot})"><path d="M0 0L-16 -24Q0 -34 16 -24Z" fill="#ffffff" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${fan}<rect x="-2.5" y="-2" width="5" height="12" rx="2" fill="#b8773a" stroke="${INK}" stroke-width="2"/></g>`);
    },
  },
  neimu: {
    bg: '#6b5a8f',
    skin: '#f6cfa8',
    hairBack: () => frag(),
    hairFront: merge(
      shape('M14 40Q14 34 26 34Q28 16 48 16Q68 16 70 34Q82 34 82 40Q82 46 48 44Q14 46 14 40Z', { fill: '#3a3448', shade: '#2b2638', shadeOffset: [0, -4], sw: 3 }),
      frag(`<path d="M27 30Q48 36 69 30V34Q48 40 27 34Z" fill="#c9a640"/>`),
    ),
    eyewear: 'shades',
    clothes: merge(
      shoulders('#c9a26a'),
      frag(`<path d="M22 100L30 72L44 80L40 100ZM74 100L66 72L52 80L56 100Z" fill="#b98f58" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
    ),
    props: (e) => (e === 'smug' ? frag(`<path d="M70 70l8 -4M72 76l9 0" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>`) : frag()),
  },
  zhuchang: {
    bg: '#ffc46b',
    skin: '#eebf94',
    hairBack: () => frag(),
    hairFront: merge(
      shape('M14 40Q14 33 26 32Q28 15 48 15Q68 15 70 32Q82 33 82 40Q82 46 48 44Q14 46 14 40Z', { fill: '#f3d27a', shade: '#e0b850', shadeOffset: [0, -4], sw: 3 }),
      frag(`<path d="M25 28Q48 34 71 28V33Q48 39 25 33Z" fill="#6b9a3a"/>` + line('M22 38l5 -2M36 22l4 6M60 22l-4 6M74 38l-5 -2', '#c9a640', 1.8) + `<path d="M58 30l6 -8 3 9z" fill="#ffd23f" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`),
    ),
    clothes: merge(
      shoulders('#ffffff'),
      frag(`<path d="M28 100V82H68V100Z" fill="#4a7fd6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` + line('M34 82L32 74M62 82L64 74', '#4a7fd6', 4) + `<circle cx="36" cy="86" r="2.2" fill="#ffd23f" stroke="${INK}" stroke-width="1.4"/><circle cx="60" cy="86" r="2.2" fill="#ffd23f" stroke="${INK}" stroke-width="1.4"/>`),
    ),
    props: (e) =>
      frag(
        // 怀里探出的小猪
        `<g transform="translate(68 84)"><path d="M-8 -6L-10 -14L-3 -9ZM8 -6L10 -14L3 -9Z" fill="#ffa8bd" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
          `<ellipse cx="0" cy="0" rx="12" ry="10" fill="#ffa8bd" stroke="${INK}" stroke-width="2.6"/><ellipse cx="0" cy="3" rx="5" ry="3.5" fill="#ff7f9f" stroke="${INK}" stroke-width="1.6"/>` +
          `<circle cx="-4.5" cy="-3" r="1.4" fill="${INK}"/><circle cx="4.5" cy="-3" r="1.4" fill="${INK}"/>` +
          (e === 'smug' ? `<path d="M-14 -16l3 4M14 -16l-3 4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` : '') +
          `</g>`,
      ),
  },
  kongjun: {
    bg: '#8fa3bd',
    skin: '#f0c9a0',
    hairBack: () => frag(),
    hairFront: merge(
      shape('M24 48Q20 24 46 21Q74 20 74 46Q70 36 62 34Q50 30 38 34Q28 38 24 48Z', { fill: '#2b2f3a', shade: false, sw: 3 }),
      frag(hiArc('M34 30q10 -6 22 -4', 2.6, 0.6)),
    ),
    eyewear: 'shades',
    brow: '#2b2f3a',
    clothes: merge(
      shoulders('#3d4558', `<path d="M38 75L48 90L58 75" fill="#ffffff" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`),
      frag(`<path d="M48 80L54 86L50 98H46L42 86Z" fill="#3cbf6a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
    ),
    props: (e) =>
      frag(
        // 手里一张向下的绿箭头小牌
        `<g transform="translate(72 84) rotate(${e === 'awkward' ? -14 : 8})"><rect x="-9" y="-10" width="18" height="20" rx="3" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>` +
          `<path d="M0 7L-5 0H-2V-6H2V0H5Z" fill="#3cbf6a" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></g>`,
      ),
  },
};
}

export function avatarSvg(id: string, e: AExpr): string {
  const p = people()[id];
  if (!p) throw new Error(`unknown avatar ${id}`);
  const bg = frag(
    `<clipPath id="av"><circle cx="48" cy="48" r="44.5"/></clipPath>` +
      `<circle cx="48" cy="48" r="45" fill="${p.bg}"/>` +
      `<circle cx="48" cy="48" r="45" fill="none" stroke="${lighten(p.bg, 0.35)}" stroke-width="5" stroke-dasharray="2 7" stroke-linecap="round"/>`,
  );
  const inner = merge(p.hairBack?.(e), p.clothes, head(p.skin), face(e, p), p.hairFront, p.props?.(e));
  // 人物整体放大 1.05 倍（以下巴附近为原点）。v0.3 从 1.18 收回来：帽檐、头发和手持道具都要落在
  // 半径 42 的安全圆内（只有肩膀允许被圆框切掉），聊天里 32px 显示时不会被切边。
  const clipped = frag(`<g clip-path="url(#av)"><g transform="translate(48 60) scale(1.05) translate(-48 -60)">${inner.content}</g></g>`, inner.defs);
  const ring = frag(`<circle cx="48" cy="48" r="45" fill="none" stroke="${INK}" stroke-width="3.2"/>`);
  return svgDoc(S, S, merge(bg, grained(clipped, 0.05, [0, 0, 96, 96]), ring));
}

export function build(write: (rel: string, data: string) => void): number {
  let n = 0;
  for (const id of AVATAR_IDS) {
    for (const e of AVATAR_EXPR) {
      write(`avatars/${id}_${e}.svg`, avatarSvg(id, e));
      n++;
    }
  }
  return n;
}
