/**
 * 人设立绘：240×300 半身像（透明底，胸口以下被画框底边切掉），5 个人设 + 各自的锁定剪影。
 * 画法与群友头像（avatars.ts）一致：圆脸、点眼高光、腮红、粗描边、纸张颗粒，只是更大、细节更多。
 *   personas/<id>.svg          立绘
 *   personas/<id>_locked.svg   剪影 + 问号（成就解锁前显示）
 */
import { BLUSH, INK, WHITE, type Frag, darken, ellipseD, frag, grained, hiArc, lighten, merge, rrectD, shape, sparkleD, starD, svgDoc } from './lib/svg.ts';

export const PERSONA_IDS = ['newbie', 'retiree', 'mom', 'coder', 'youzi'] as const;
export const PERSONA_NAMES: Record<string, string> = {
  newbie: '职场新人阿韭',
  retiree: '退休老周',
  mom: '宝妈芳姐',
  coder: '程序员小码',
  youzi: '游资大佬',
};

const W = 240;
const H = 300;
const HX = 120;
const HY = 120;

function line(d: string, color: string, w: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
}
function rod(d: string, color: string, w: number): string {
  return line(d, INK, w + 4) + line(d, color, w);
}

interface Persona {
  skin: string;
  hairBack?: Frag;
  clothes: Frag;
  hairFront?: Frag;
  /** 脸上的额外部件（眼镜、胡子、黑眼圈），画在五官之后 */
  faceExtra?: Frag;
  /** 眼睛被墨镜挡住 */
  shades?: boolean;
  eyes?: 'dot' | 'smile';
  mouth: 'smile' | 'grin' | 'smirk' | 'nervous';
  brow?: string;
  /** 手和手里的道具（最上层） */
  props: Frag;
  /** 背景装饰（身后的小物件） */
  back?: Frag;
}

function head(skin: string): Frag {
  const ear = (x: number) => `<ellipse cx="${x}" cy="${HY + 8}" rx="11" ry="13" fill="${skin}" stroke="${INK}" stroke-width="4"/><path d="M${x + (x < HX ? 3 : -3)} ${HY + 2}q${x < HX ? -5 : 5} 6 0 12" fill="none" stroke="${darken(skin, 0.25)}" stroke-width="2.4" stroke-linecap="round"/>`;
  return merge(frag(ear(HX - 54) + ear(HX + 54)), shape(ellipseD(HX, HY, 54, 52), { fill: skin, shade: darken(skin, 0.1), shadeOffset: [-6, -7], sw: 4.2 }));
}

function neckAndBody(skin: string, color: string, extra = ''): Frag {
  return merge(
    frag(`<path d="M104 160H136V206H104Z" fill="${darken(skin, 0.08)}" stroke="${INK}" stroke-width="4"/>`),
    shape('M22 304Q24 228 82 208L104 202Q120 214 136 202L158 208Q216 228 218 304Z', { fill: color, shadeOffset: [-8, -6], sw: 4.2, extra }),
  );
}

function face(p: Persona): Frag {
  const ex = 22;
  const ey = HY + 8;
  const brow = p.brow ?? INK;
  let s = '';
  if (!p.shades) {
    if (p.eyes === 'smile') {
      s += line(`M${HX - ex - 8} ${ey + 2}q8 -11 16 0M${HX + ex - 8} ${ey + 2}q8 -11 16 0`, INK, 4.6);
    } else {
      s += `<ellipse cx="${HX - ex}" cy="${ey}" rx="6.4" ry="8" fill="${INK}"/><ellipse cx="${HX + ex}" cy="${ey}" rx="6.4" ry="8" fill="${INK}"/>`;
      s += `<circle cx="${HX - ex - 2}" cy="${ey - 3}" r="2.6" fill="${WHITE}"/><circle cx="${HX + ex - 2}" cy="${ey - 3}" r="2.6" fill="${WHITE}"/>`;
    }
    s += line(`M${HX - ex - 10} ${ey - 18}q10 -5 20 0M${HX + ex - 10} ${ey - 18}q10 -5 20 0`, brow, 4.2);
  }
  s += `<ellipse cx="${HX - 38}" cy="${ey + 20}" rx="10" ry="5.6" fill="${BLUSH}" fill-opacity="0.55"/><ellipse cx="${HX + 38}" cy="${ey + 20}" rx="10" ry="5.6" fill="${BLUSH}" fill-opacity="0.55"/>`;
  s += line(`M${HX} ${ey + 10}q4 5 0 8`, darken(p.skin, 0.35), 3);
  const my = HY + 36;
  switch (p.mouth) {
    case 'smile':
      s += line(`M${HX - 11} ${my}q11 9 22 0`, INK, 4);
      break;
    case 'grin':
      s += `<path d="M${HX - 14} ${my - 3}h28q0 16 -14 16t-14 -16z" fill="${INK}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
        `<path d="M${HX - 7} ${my + 9}q7 -6 14 0q-3 3.5 -7 3.5t-7 -3.5z" fill="#ff7a8a"/><path d="M${HX - 11} ${my - 1.5}h22v3h-22z" fill="${WHITE}"/>`;
      break;
    case 'smirk':
      s += `<path d="M${HX - 14} ${my}Q${HX + 2} ${my + 6} ${HX + 16} ${my - 8}Q${HX + 12} ${my + 10} ${HX - 2} ${my + 8}Q${HX - 10} ${my + 6} ${HX - 14} ${my}Z" fill="${INK}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
        `<path d="M${HX - 7} ${my + 2}Q${HX + 3} ${my + 4} ${HX + 12} ${my - 4}L${HX + 11} ${my - 1}Q${HX + 2} ${my + 5.5} ${HX - 6} ${my + 4}Z" fill="${WHITE}"/>`;
      break;
    case 'nervous':
      s += line(`M${HX - 12} ${my + 2}q11 8 22 -1`, INK, 4) + line(`M${HX + 12} ${my - 1}l3 -2`, INK, 3);
      break;
  }
  return merge(frag(s), p.faceExtra);
}

// ---------------------------------------------------------------- 人设

/** 一把韭菜叶（呆毛 / 菜篮里的韭菜） */
function leekTuft(x: number, y: number, s: number, rot = 0): string {
  const blade = (tx: number, ty: number, bend: number) =>
    `<path d="M-5 0Q${tx / 2 - 5 + bend} ${ty / 2} ${tx} ${ty}Q${tx / 2 + 5 + bend} ${ty / 2} 5 0Z" fill="#62c95a" stroke="${INK}" stroke-width="${(3 / s).toFixed(2)}" stroke-linejoin="round"/>` +
    `<path d="M0 -2Q${tx / 2 + bend * 0.5} ${ty / 2} ${tx * 0.8} ${ty * 0.8}" fill="none" stroke="#d8ffc0" stroke-width="${(2 / s).toFixed(2)}" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${blade(-22, -40, -6)}${blade(4, -50, 2)}${blade(26, -36, 6)}<rect x="-8" y="-4" width="16" height="10" rx="4" fill="#f4f8e8" stroke="${INK}" stroke-width="${(3 / s).toFixed(2)}"/></g>`;
}

function phone(x: number, y: number, rot: number, screen: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-17" y="-30" width="34" height="60" rx="7" fill="#3a3448" stroke="${INK}" stroke-width="3.6"/>` +
    `<rect x="-12.5" y="-24" width="25" height="46" rx="3" fill="${screen}"/>${line('M-8 12L-2 2L3 7L9 -10', '#ff4d4d', 3.2)}${line('M5 -10H9V-6', '#ff4d4d', 3.2)}</g>`;
}

function hand(x: number, y: number, skin: string, r = 13): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${skin}" stroke="${INK}" stroke-width="4"/>`;
}

// 每次调用重新构造：部件里的 clipPath id 由计数器生成，放在模块顶层会让输出依赖导入顺序
function personas(): Record<string, Persona> {
  return {
  /** 职场新人阿韭：头顶一撮韭菜呆毛，白衬衫松领带，挂着工牌，捧着手机看红线 */
  newbie: {
    skin: '#ffe0c2',
    hairBack: frag(`<path d="M64 128Q56 60 120 56Q184 60 176 128Q172 100 160 92Q120 80 80 92Q68 100 64 128Z" fill="#3a3048" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`),
    hairFront: frag(
      `<path d="M66 112Q64 64 120 62Q176 64 174 112Q166 90 150 86Q144 100 118 98Q98 104 88 90Q74 98 66 112Z" fill="#3a3048" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        hiArc('M92 74q14 -8 32 -8', 4, 0.45) + leekTuft(124, 66, 0.95, 8),
    ),
    clothes: merge(
      neckAndBody('#ffe0c2', '#f4f6fb'),
      frag(
        // 外套两片 + 领口 + 松垮的领带 + 工牌挂绳
        `<path d="M22 304Q24 232 80 210L98 268L84 304Z" fill="#46558a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
          `<path d="M218 304Q216 232 160 210L142 268L156 304Z" fill="#46558a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
          `<path d="M100 200L120 222L108 234L94 210Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/><path d="M140 200L120 222L132 234L146 210Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>` +
          `<g transform="rotate(14 120 226)"><path d="M112 220h16l-3 10h-10z" fill="#e8553e" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M115 230h10l5 44 -10 12 -10 -12z" fill="#e8553e" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>${line('M116 246l10 -4M115 260l12 -5', '#ff9a86', 2.4)}</g>` +
          line('M98 214Q120 252 150 240', '#4f7cff', 4) +
          `<rect x="140" y="238" width="30" height="38" rx="4" fill="${WHITE}" stroke="${INK}" stroke-width="3.2" transform="rotate(-8 155 257)"/><rect x="146" y="246" width="12" height="12" rx="2" fill="#bfe6ff" transform="rotate(-8 155 257)"/>` +
          line('M147 266h16M147 271h10', '#c8d6e6', 2.4, ' transform="rotate(-8 155 257)"'),
      ),
    ),
    mouth: 'smile',
    faceExtra: frag(`<path d="M166 92q-6 9 -6 13a6 6 0 0 0 12 0q0 -4 -6 -13z" fill="#7fd3ff" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`),
    props: frag(rod('M58 300Q52 264 70 250', '#46558a', 14) + phone(78, 236, -12, '#dff4ff') + hand(66, 258, '#ffe0c2') + hand(92, 262, '#ffe0c2', 11)),
  },
  /** 退休老周：地中海白发，圆眼镜，小胡子，开衫，捧着泡枸杞的保温杯 */
  retiree: {
    skin: '#f6cfa8',
    hairFront: frag(
      `<path d="M66 134Q60 116 68 102Q74 110 78 106Q78 118 84 126Q74 128 66 134Z" fill="#e2e4ea" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/><path d="M174 134Q180 116 172 102Q166 110 162 106Q162 118 156 126Q166 128 174 134Z" fill="#e2e4ea" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>` +
        `<path d="M100 70q4 -6 10 -2M126 68q6 -4 10 2" fill="none" stroke="#e2e4ea" stroke-width="3.4" stroke-linecap="round"/>` +
        hiArc('M88 82q14 -14 34 -16', 6, 0.7) + line('M100 94q20 -6 40 0', darken('#f6cfa8', 0.2), 2.4),
    ),
    brow: '#a0a0ac',
    faceExtra: frag(
      `<circle cx="${HX - 22}" cy="${HY + 8}" r="16" fill="#dff4ff" fill-opacity="0.3" stroke="${INK}" stroke-width="4"/><circle cx="${HX + 22}" cy="${HY + 8}" r="16" fill="#dff4ff" fill-opacity="0.3" stroke="${INK}" stroke-width="4"/>` +
        line(`M${HX - 6} ${HY + 8}h12M${HX - 38} ${HY + 6}l-14 -4M${HX + 38} ${HY + 6}l14 -4`, INK, 3.6) + line(`M${HX - 30} ${HY + 1}l5 -4M${HX + 14} ${HY + 1}l5 -4`, '#ffffff', 2.6) +
        `<path d="M104 147q16 -8 32 0q-6 6 -16 4q-10 2 -16 -4z" fill="#e2e4ea" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
        line(`M${HX - 46} ${HY + 2}l-6 -3M${HX - 46} ${HY + 12}l-6 2M${HX + 46} ${HY + 2}l6 -3M${HX + 46} ${HY + 12}l6 2`, darken('#f6cfa8', 0.3), 2.2),
    ),
    clothes: merge(
      neckAndBody('#f6cfa8', '#f2efe6'),
      frag(
        `<path d="M22 304Q24 232 80 210L110 300Z" fill="#a8763f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M218 304Q216 232 160 210L130 300Z" fill="#a8763f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
          [236, 262, 288].map((y) => `<circle cx="${100 + (y - 236) * 0.12}" cy="${y}" r="4" fill="#e8c48a" stroke="${INK}" stroke-width="2.4"/>`).join('') +
          line('M40 260q10 -6 20 0M180 262q10 -6 20 0', '#8a5a2a', 2.4) +
          `<path d="M104 202L120 222L136 202" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`,
      ),
    ),
    mouth: 'smile',
    eyes: 'smile',
    props: frag(
      line('M170 196q-4 -10 0 -18t0 -18', '#ffffff', 4, ' stroke-opacity="0.9"') + line('M184 200q-4 -10 0 -18', '#ffffff', 3.4, ' stroke-opacity="0.8"') +
        `<rect x="156" y="206" width="40" height="80" rx="10" fill="#cfd8e6" stroke="${INK}" stroke-width="4"/><rect x="156" y="226" width="40" height="44" fill="#b8c2d6"/>` +
        line('M156 226h40M156 270h40', INK, 2.4) + hiArc('M164 214v8', 3.4, 0.8) + hiArc('M164 234v28', 3.4, 0.5) +
        `<rect x="152" y="198" width="48" height="14" rx="5" fill="#d9453a" stroke="${INK}" stroke-width="3.6"/>` +
        [[168, 246], [178, 252], [172, 258], [184, 244]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#e8402e"/>`).join('') +
        hand(152, 258, '#f6cfa8') + hand(200, 262, '#f6cfa8', 12),
    ),
  },
  /** 宝妈芳姐：丸子头配粉发圈，系围裙，挎着冒出韭菜的菜篮，围裙兜里插着奶瓶 */
  mom: {
    skin: '#ffe0c8',
    hairBack: frag(
      `<circle cx="120" cy="56" r="24" fill="#8a4f32" stroke="${INK}" stroke-width="4"/>` +
        `<path d="M62 120Q56 64 120 60Q184 64 178 120L184 184Q170 196 160 180L162 132Q120 120 78 132L80 180Q70 196 56 184Z" fill="#8a4f32" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
    ),
    hairFront: frag(
      `<path d="M66 116Q66 66 120 66Q174 66 174 116Q164 94 146 88Q132 102 114 92Q96 104 84 96Q72 102 66 116Z" fill="#8a4f32" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M98 70q14 6 44 0l-2 10q-20 6 -40 0z" fill="#ff7aa2" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>` + hiArc('M110 44q10 -6 20 -2', 4, 0.5) + hiArc('M86 80q10 -8 22 -10', 3.4, 0.45),
    ),
    clothes: merge(
      neckAndBody('#ffe0c8', '#ff8fb0'),
      frag(
        `<path d="M78 304V232Q120 220 162 232V304Z" fill="#ffd56b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
          line('M78 234L96 206M162 234L144 206', '#ffd56b', 6) + line('M78 234L96 206M162 234L144 206', INK, 2, ' stroke-opacity="0.4"') +
          `<rect x="96" y="256" width="48" height="34" rx="6" fill="#ffe59a" stroke="${INK}" stroke-width="3.4"/>` +
          `<rect x="104" y="232" width="14" height="30" rx="5" fill="#fffdf7" stroke="${INK}" stroke-width="3"/><path d="M106 232v-6q5 -6 10 0v6z" fill="#7fd3ff" stroke="${INK}" stroke-width="2.6"/>${line('M106 246h8M106 252h6', '#9fd8ff', 2)}` +
          `<path d="M100 202Q120 222 140 202" fill="none" stroke="${WHITE}" stroke-width="4"/>`,
      ),
    ),
    mouth: 'grin',
    faceExtra: frag(line(`M${HX + 12} ${HY - 14}q10 -8 20 -4`, INK, 4)),
    props: frag(
      leekTuft(196, 214, 1.05, 14) + leekTuft(178, 222, 0.8, -12) +
        `<path d="M156 222H222L214 288Q213 296 205 296H172Q164 296 163 288Z" fill="#e8b46a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        line('M162 244H218M164 266H216', '#c48a3e', 3) + line('M172 224V294M190 224V294M206 224V294', '#c48a3e', 2.4) +
        `<path d="M160 224Q188 186 218 224" fill="none" stroke="${INK}" stroke-width="5"/>` + hand(160, 236, '#ffe0c8') +
        phone(56, 250, 10, '#e8ffe2') + hand(56, 276, '#ffe0c8', 12),
    ),
  },
  /** 程序员小码：乱发呆毛，方框眼镜和黑眼圈，脖子上挂耳机，连帽衫，抱着贴满贴纸的笔记本 */
  coder: {
    skin: '#ffe4cc',
    hairBack: frag(`<path d="M62 132Q50 62 120 54Q190 62 178 132Q176 104 160 96Q120 84 80 96Q66 104 62 132Z" fill="#2b2440" stroke="${INK}" stroke-width="4"/>`),
    hairFront: frag(
      `<path d="M64 112L70 78L84 88L90 62L106 80L118 56L130 78L146 60L152 86L168 76L176 112Q164 92 148 90Q132 100 114 92Q94 102 82 94Q70 100 64 112Z" fill="#2b2440" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        rod('M118 58Q112 36 128 28', '#2b2440', 5) + hiArc('M90 74l14 -6', 3.4, 0.4),
    ),
    faceExtra: frag(
      line(`M${HX - 32} ${HY + 18}q10 5 20 0M${HX + 12} ${HY + 18}q10 5 20 0`, '#9a86b8', 3) +
        `<rect x="${HX - 40}" y="${HY - 6}" width="34" height="27" rx="6" fill="#dff4ff" fill-opacity="0.25" stroke="${INK}" stroke-width="4"/><rect x="${HX + 6}" y="${HY - 6}" width="34" height="27" rx="6" fill="#dff4ff" fill-opacity="0.25" stroke="${INK}" stroke-width="4"/>` +
        line(`M${HX - 6} ${HY + 4}h12M${HX - 40} ${HY + 2}h-12M${HX + 40} ${HY + 2}h12`, INK, 3.6) + line(`M${HX - 34} ${HY + 2}l6 -5M${HX + 12} ${HY + 2}l6 -5`, '#ffffff', 2.6),
    ),
    clothes: merge(
      neckAndBody('#ffe4cc', '#5b6b8f', line('M80 230Q120 260 160 230', '#46557a', 4)),
      frag(
        `<path d="M84 206Q120 236 156 206Q150 196 120 214Q90 196 84 206Z" fill="#46557a" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>` +
          line('M110 222V256M130 222V256', WHITE, 3) + `<circle cx="110" cy="258" r="3.4" fill="${WHITE}" stroke="${INK}" stroke-width="2"/><circle cx="130" cy="258" r="3.4" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` +
          // 挂在脖子上的耳机
          `<path d="M86 194Q120 226 154 194" fill="none" stroke="${INK}" stroke-width="9"/><path d="M86 194Q120 226 154 194" fill="none" stroke="#3a3448" stroke-width="4.5"/>` +
          `<rect x="72" y="182" width="20" height="26" rx="8" fill="#3a3448" stroke="${INK}" stroke-width="3.4"/><rect x="148" y="182" width="20" height="26" rx="8" fill="#3a3448" stroke="${INK}" stroke-width="3.4"/>` +
          `<rect x="77" y="188" width="10" height="14" rx="4" fill="#5ee0ff"/><rect x="153" y="188" width="10" height="14" rx="4" fill="#5ee0ff"/>`,
      ),
    ),
    mouth: 'nervous',
    props: frag(
      `<g transform="rotate(-8 170 250)"><rect x="124" y="214" width="92" height="62" rx="7" fill="#c8ced8" stroke="${INK}" stroke-width="4"/>` +
        `<circle cx="160" cy="240" r="9" fill="#62c95a" stroke="${INK}" stroke-width="2.4"/><path d="M156 238l3 3 6 -6" fill="none" stroke="${WHITE}" stroke-width="2.6" stroke-linecap="round"/>` +
        `<rect x="180" y="226" width="22" height="14" rx="3" fill="#ff7a9a" stroke="${INK}" stroke-width="2.4"/><path d="${starD(194, 258, 8)}" fill="${'#ffd23f'}" stroke="${INK}" stroke-width="2.2"/>` +
        `<rect x="134" y="256" width="20" height="10" rx="3" fill="#5ee0ff" stroke="${INK}" stroke-width="2.2"/>${hiArc('M130 222h20', 3, 0.7)}</g>` +
        hand(130, 268, '#ffe4cc') + hand(212, 236, '#ffe4cc', 12),
    ),
  },
  /** 游资大佬：大背头，墨镜，金链子，黑西装开领，手里盘着两颗核桃，腕上金表 */
  youzi: {
    skin: '#eebf94',
    hairFront: frag(
      `<path d="M64 120Q56 58 120 52Q184 58 176 120Q172 92 156 82Q120 70 84 82Q68 92 64 120Z" fill="#1f1a2e" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        line('M86 74q34 -16 70 -2M90 84q30 -12 62 0', '#4a4460', 3) + hiArc('M96 64q20 -8 40 -4', 4, 0.6),
    ),
    shades: true,
    faceExtra: frag(
      `<path d="M74 114H166V122Q164 146 146 146Q126 146 124 128H116Q114 146 94 146Q76 146 74 122Z" fill="#241e36" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        line('M84 122l12 0M132 122l12 0', '#ffffff', 3.4, ' stroke-opacity="0.85"') + line('M86 140l18 -20M134 140l18 -20', '#ffffff', 3, ' stroke-opacity="0.35"') +
        line(`M${HX - 34} ${HY - 22}l22 4M${HX + 12} ${HY - 18}l22 -6`, INK, 4.4) +
        `<g fill="#7a5a48" opacity="0.55">${[[100, 166], [108, 170], [132, 170], [140, 166], [120, 172], [92, 160], [148, 160]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>`,
    ),
    clothes: merge(
      neckAndBody('#eebf94', '#2b2638'),
      frag(
        `<path d="M98 204L120 260L142 204Z" fill="#9a2f3a" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>` +
          `<path d="M98 204L84 236L110 250ZM142 204L156 236L130 250Z" fill="#3a3354" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>` +
          `<path d="M100 206Q120 250 140 206" fill="none" stroke="${INK}" stroke-width="7"/><path d="M100 206Q120 250 140 206" fill="none" stroke="#ffd23f" stroke-width="4" stroke-dasharray="5 2.5"/>` +
          `<circle cx="120" cy="234" r="7" fill="#ffd23f" stroke="${INK}" stroke-width="2.6"/>` +
          `<path d="M40 246l20 -6v12z" fill="#ffffff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
      ),
    ),
    mouth: 'smirk',
    props: frag(
      rod('M190 300Q196 268 180 252', '#2b2638', 16) +
        `<rect x="170" y="236" width="24" height="14" rx="4" fill="#ffd23f" stroke="${INK}" stroke-width="3" transform="rotate(-20 182 243)"/>` +
        hand(170, 232, '#eebf94', 15) +
        [[150, 214], [176, 206]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#a0683a" stroke="${INK}" stroke-width="3.4"/>` + line(`M${x! - 7} ${y! - 4}q4 4 0 9M${x! + 1} ${y! - 9}q4 6 0 16M${x! + 7} ${y! - 4}q-3 4 0 8`, '#6a3e1e', 2.2)).join('') +
        `<path d="${sparkleD(204, 196, 8)}" fill="#fff6b0" stroke="${INK}" stroke-width="2"/>`,
    ),
  },
};
}

function figure(id: string): Frag {
  const p = personas()[id];
  if (!p) throw new Error(`unknown persona ${id}`);
  return merge(p.back, p.hairBack, p.clothes, head(p.skin), face(p), p.hairFront, p.props);
}

export function personaSvg(id: string): string {
  return svgDoc(W, H, grained(figure(id), 0.06, [0, 0, W, H]));
}

/** 锁定：整个人压成深紫剪影（保留外轮廓），胸前一个大问号 */
export function personaLockedSvg(id: string): string {
  const f = figure(id);
  const sil = frag(
    `<filter id="sil" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB">` +
      `<feFlood flood-color="#4a3d58"/><feComposite in2="SourceAlpha" operator="in" result="s"/>` +
      `<feFlood flood-color="${INK}"/><feComposite in2="SourceAlpha" operator="in" result="o"/>` +
      `<feMorphology in="s" operator="erode" radius="3" result="si"/><feMerge><feMergeNode in="o"/><feMergeNode in="si"/></feMerge></filter>` +
      `<g filter="url(#sil)">${f.content}</g>`,
    f.defs,
  );
  const q =
    `<path d="M100 104Q100 76 122 76Q146 76 146 100Q146 116 130 124Q122 128 122 140V146" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M100 104Q100 76 122 76Q146 76 146 100Q146 116 130 124Q122 128 122 140V146" fill="none" stroke="#ffd23f" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="122" cy="172" r="11" fill="#ffd23f" stroke="${INK}" stroke-width="5"/>` +
    hiArc('M106 96q2 -10 10 -13', 3, 0.8) +
    `<path d="${sparkleD(178, 70, 9)}" fill="${lighten('#ffd23f', 0.5)}" stroke="${INK}" stroke-width="2"/><path d="${sparkleD(62, 210, 6)}" fill="${lighten('#ffd23f', 0.5)}" stroke="${INK}" stroke-width="1.8"/>`;
  return svgDoc(W, H, merge(sil, frag(q)));
}

export function build(write: (rel: string, data: string) => void): number {
  for (const id of PERSONA_IDS) {
    write(`personas/${id}.svg`, personaSvg(id));
    write(`personas/${id}_locked.svg`, personaLockedSvg(id));
  }
  return PERSONA_IDS.length * 2;
}

export { rrectD };
