/**
 * 标题页主视觉：scene/title_keyart.svg，1600×900。
 * 构图：暖色傍晚天空 + 远处 K 线城市 → 山坡 → 正下方的炒股小屋（窗里亮着显示器）→ 两侧一群股票小人 →
 * 左上、右上飘着群聊气泡。中上部（x 380–1220，y 40–440）只留天空和柔光，给 Logo 和按钮。
 * 主体（小屋和前排小人）集中在中间 1400 宽内；裁窄时先丢掉贴角的群聊气泡，再丢最外侧的小人。
 *
 * 小人和头像直接复用生成器输出，嵌入前把每份 SVG 的 id 按出现顺序重编号，保证结果确定、互不冲突。
 */
import { readFileSync } from 'node:fs';
import { avatarSvg } from './avatars.ts';
import { INK, WHITE, darken, ellipseD, frag, grained, hiArc, lighten, merge, rng, rrectD, shape, smoothClosed, sparkleD, starD, svgDoc } from './lib/svg.ts';
import { buildStock, type StockSpec } from './stocks.ts';

const W = 1600;
const H = 900;

function line(d: string, color: string, w: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
}

let embedNo = 0;
/** 每份输出文档开始前调用，保证嵌入的 id 编号确定 */
export function resetEmbeds(): void {
  embedNo = 0;
}
/** 把一份完整 SVG 嵌成子 <svg>，id 统一重编号 */
export function embed(doc: string, x: number, y: number, w: number, h: number, flip = false): string {
  const k = ++embedNo;
  const vb = /viewBox="([^"]+)"/.exec(doc)![1]!;
  let inner = doc.slice(doc.indexOf('>', doc.indexOf('<svg')) + 1, doc.lastIndexOf('</svg>'));
  const ids: string[] = [];
  inner.replace(/\bid="([^"]+)"/g, (_m, id: string) => {
    if (!ids.includes(id)) ids.push(id);
    return '';
  });
  const map = new Map(ids.map((id, i) => [id, `e${k}_${i}`]));
  inner = inner.replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${map.get(id)}"`).replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${map.get(id) ?? id})`);
  const [, , vw] = vb.split(' ').map(Number);
  const body = flip ? `<g transform="translate(${vw} 0) scale(-1 1)">${inner}</g>` : inner;
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}" overflow="visible">${body}</svg>`;
}

export function stockSpecs(): Map<string, StockSpec> {
  const src = JSON.parse(readFileSync(new URL('./stocks.json', import.meta.url).pathname, 'utf8')) as { stocks: StockSpec[] };
  return new Map(src.stocks.map((s) => [s.id, s]));
}

/** 站在地面 (gx, gy) 上、显示尺寸 size 的小人 */
export function stock(specs: Map<string, StockSpec>, id: string, expr: string, gx: number, gy: number, size: number, flip = false): string {
  const spec = specs.get(id);
  if (!spec) throw new Error(`no stock ${id}`);
  const out = buildStock(spec);
  const doc = out.files.get(`${id}/${expr}.svg`)!;
  const top = gy - (116 / 128) * size;
  return embed(doc, gx - size / 2, top, size, size, flip);
}

function sky(): string {
  const r = rng(20261010);
  let s =
    `<defs><linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="760"><stop offset="0" stop-color="#ffc98f"/><stop offset="0.45" stop-color="#ffe2b8"/><stop offset="1" stop-color="#fff3dc"/></linearGradient>` +
    `<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="800" cy="300" r="520"><stop offset="0" stop-color="#fffaf0" stop-opacity="0.95"/><stop offset="0.6" stop-color="#fff3dc" stop-opacity="0.4"/><stop offset="1" stop-color="#fff3dc" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  // 放射状的淡光带
  for (let i = 0; i < 14; i++) {
    const a0 = (-180 + i * (180 / 14)) * (Math.PI / 180);
    const a1 = a0 + (180 / 14 / 2) * (Math.PI / 180);
    const R = 1400;
    s += `<path d="M800 640L${(800 + Math.cos(a0) * R).toFixed(0)} ${(640 + Math.sin(a0) * R).toFixed(0)}L${(800 + Math.cos(a1) * R).toFixed(0)} ${(640 + Math.sin(a1) * R).toFixed(0)}Z" fill="#ffffff" fill-opacity="0.13"/>`;
  }
  s += `<rect width="${W}" height="${H}" fill="url(#glow)"/>`;
  // 云
  const cloud = (cx: number, cy: number, k: number) => {
    const pts: [number, number][] = [[-60, 18], [-70, -2], [-40, -26], [-6, -34], [30, -26], [62, -8], [60, 18]];
    return `<path d="${smoothClosed(pts.map(([x, y]) => [cx + x * k, cy + y * k] as [number, number]), 1)}" fill="#ffffff" fill-opacity="0.75"/>`;
  };
  s += cloud(240, 470, 1.4) + cloud(1380, 420, 1.2) + cloud(560, 560, 0.9) + cloud(1120, 590, 1);
  // 星点
  for (let i = 0; i < 18; i++) {
    const x = 60 + r() * 1480;
    const y = 30 + r() * 320;
    if (x > 420 && x < 1180 && y < 380) continue;
    s += `<path d="${sparkleD(x, y, 3 + r() * 4)}" fill="#ffffff" fill-opacity="0.8"/>`;
  }
  return s;
}

function city(): string {
  // 远处的 K 线城市：一排红绿方楼（淡紫雾里）
  const r = rng(77);
  let s = '';
  let x = -20;
  while (x < W + 20) {
    const w = 40 + Math.floor(r() * 50);
    const h = 90 + Math.floor(r() * 170);
    const up = r() > 0.42;
    const col = up ? '#f4a0a0' : '#9fd6b0';
    s += `<rect x="${x}" y="${700 - h}" width="${w}" height="${h + 40}" rx="4" fill="${col}"/>`;
    s += `<rect x="${x + w / 2 - 2}" y="${700 - h - 26}" width="4" height="26" fill="${col}"/>`;
    for (let wy = 700 - h + 16; wy < 680; wy += 26) for (let wx = x + 9; wx < x + w - 12; wx += 16) if (r() > 0.45) s += `<rect x="${wx}" y="${wy}" width="7" height="9" rx="1.5" fill="#fff6e0" fill-opacity="0.8"/>`;
    x += w + 6 + Math.floor(r() * 18);
  }
  return `<g opacity="0.55">${s}</g><rect x="0" y="560" width="${W}" height="200" fill="#ffe8cc" fill-opacity="0.45"/>`;
}

function hills(): string {
  return (
    `<path d="M0 720Q300 640 620 700Q800 730 980 700Q1300 640 1600 710V900H0Z" fill="#b8dc8a" stroke="${INK}" stroke-width="4"/>` +
    `<path d="M0 800Q400 740 800 790Q1200 840 1600 780V900H0Z" fill="#9fcf72"/>` +
    `<path d="M0 860Q500 820 800 856Q1100 890 1600 846V900H0Z" fill="#88c060"/>` +
    [120, 330, 1270, 1480, 640, 960].map((x, i) => line(`M${x} ${820 + (i % 3) * 18}l6 -14l6 14M${x + 16} ${826 + (i % 3) * 18}l5 -11l5 11`, '#6aa84a', 4)).join('')
  );
}

function house(): string {
  const cx = 800;
  const base = 840;
  const wall = shape(`M${cx - 170} ${base}V${base - 190}H${cx + 170}V${base}Z`, {
    fill: '#fff1d6',
    shade: '#f0d8b0',
    shadeOffset: [-14, -10],
    sw: 6,
    extra:
      line(`M${cx - 170} ${base - 150}H${cx + 170}M${cx - 170} ${base - 70}H${cx + 170}`, '#e8c99a', 4) +
      // 大窗：亮着的显示器和台灯
      `<rect x="${cx - 140}" y="${base - 160}" width="170" height="120" rx="12" fill="#ffe28a" stroke="${INK}" stroke-width="6"/>` +
      `<rect x="${cx - 112}" y="${base - 138}" width="90" height="60" rx="6" fill="#3a3448" stroke="${INK}" stroke-width="4"/><rect x="${cx - 104}" y="${base - 130}" width="74" height="44" rx="3" fill="#bfefff"/>` +
      line(`M${cx - 98} ${base - 94}l14 -14 10 8 22 -22`, '#ff4d4d', 5) + `<rect x="${cx - 74}" y="${base - 78}" width="14" height="14" fill="#3a3448"/>` +
      line(`M${cx - 55} ${base - 160}V${base - 40}M${cx - 140} ${base - 100}H${cx + 30}`, INK, 5) +
      // 窗台上睡觉的猫
      `<path d="M${cx - 18} ${base - 40}Q${cx - 16} ${base - 70} ${cx + 12} ${base - 66}Q${cx + 36} ${base - 64} ${cx + 34} ${base - 40}Z" fill="#ffb066" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M${cx - 10} ${base - 62}l-2 -12 10 8zM${cx + 6} ${base - 66}l4 -11 6 10z" fill="#ffb066" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>` +
      line(`M${cx - 6} ${base - 52}q4 3 8 0M${cx + 8} ${base - 52}q4 3 8 0`, INK, 3) +
      `<rect x="${cx - 150}" y="${base - 44}" width="190" height="12" rx="4" fill="#c98a4a" stroke="${INK}" stroke-width="4"/>` +
      // 门
      `<path d="M${cx + 70} ${base}V${base - 120}Q${cx + 70} ${base - 150} ${cx + 105} ${base - 150}Q${cx + 140} ${base - 150} ${cx + 140} ${base - 120}V${base}Z" fill="#c9773f" stroke="${INK}" stroke-width="6"/>` +
      `<circle cx="${cx + 126}" cy="${base - 66}" r="6" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>` + line(`M${cx + 82} ${base - 110}h46M${cx + 82} ${base - 80}h46`, '#a85a2a', 4) +
      hiArc(`M${cx - 156} ${base - 176}h60`, 6, 0.6),
  });
  const roofD = `M${cx - 210} ${base - 180}L${cx} ${base - 300}L${cx + 210} ${base - 180}Z`;
  const roof = shape(roofD, {
    fill: '#e8704a',
    shade: '#c8502e',
    shadeOffset: [-10, -10],
    sw: 6,
    extra: [0, 1, 2, 3].map((i) => line(`M${cx - 180 + i * 18} ${base - 186 - i * 10}L${cx + 180 - i * 18} ${base - 186 - i * 10}`, '#d65e3a', 4)).join('') + hiArc(`M${cx - 150} ${base - 200}L${cx - 40} ${base - 264}`, 6, 0.5),
  });
  // 烟囱和变成 K 线的烟
  const chimney = `<rect x="${cx + 90}" y="${base - 300}" width="44" height="90" fill="#b85a3a" stroke="${INK}" stroke-width="6"/><rect x="${cx + 82}" y="${base - 312}" width="60" height="18" rx="4" fill="#9a4a2e" stroke="${INK}" stroke-width="5"/>`;
  const smoke = [[cx + 128, base - 326, 16], [cx + 176, base - 340, 20], [cx + 232, base - 344, 22]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="0.85" stroke="${INK}" stroke-width="3" stroke-opacity="0.35"/>`).join('') +
    line(`M${cx + 262} ${base - 298}L${cx + 290} ${base - 320}L${cx + 314} ${base - 310}L${cx + 340} ${base - 338}`, '#ff5a4a', 7) + `<path d="M${cx + 326} ${base - 344}L${cx + 350} ${base - 348}L${cx + 346} ${base - 324}Z" fill="#ff5a4a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  const steps = `<rect x="${cx + 58}" y="${base - 6}" width="94" height="14" rx="4" fill="#cfc3b0" stroke="${INK}" stroke-width="4"/>`;
  const plant = `<path d="M${cx - 230} ${base}L${cx - 236} ${base - 40}H${cx - 184}L${cx - 190} ${base}Z" fill="#e9875a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    [[-20, -70], [0, -84], [20, -66]].map(([dx, dy]) => `<path d="M${cx - 210} ${base - 40}Q${cx - 210 + dx! - 6} ${base - 40 + dy! / 2} ${cx - 210 + dx!} ${base - 40 + dy!}Q${cx - 210 + dx! + 8} ${base - 40 + dy! / 2} ${cx - 204} ${base - 40}Z" fill="#62c95a" stroke="${INK}" stroke-width="3.4"/>`).join('');
  return frag(chimney + smoke).content + merge(roof, wall).content + steps + plant;
}

/** 群聊气泡：头像 + 气泡，气泡里是图形（没有文字） */
function chatBubble(avatar: string, face: 'normal' | 'smug' | 'awkward', x: number, y: number, w: number, inner: (bx: number, by: number) => string, right = false): string {
  const av = embed(avatarSvg(avatar, face), right ? x + w + 10 : x, y, 76, 76);
  const bx = right ? x : x + 88;
  const bw = w;
  const bubble = shape(rrectD(bx, y + 6, bw, 74, 24), { fill: right ? '#fff1a8' : WHITE, shade: right ? '#f0dc80' : '#ece4f0', shadeOffset: [-5, -5], sw: 5 });
  const tail = right
    ? `<path d="M${bx + bw - 6} ${y + 28}L${bx + bw + 14} ${y + 34}L${bx + bw - 6} ${y + 46}Z" fill="#fff1a8" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M${bx + bw - 8} ${y + 30}V${y + 44}" stroke="#fff1a8" stroke-width="6"/>`
    : `<path d="M${bx + 6} ${y + 28}L${bx - 14} ${y + 34}L${bx + 6} ${y + 46}Z" fill="${WHITE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M${bx + 8} ${y + 30}V${y + 44}" stroke="${WHITE}" stroke-width="6"/>`;
  return `<g>${tail}${merge(bubble).content}${av}${inner(bx, y + 6)}</g>`;
}

const upArrow = (x: number, y: number, c = '#ff4d4d') => `<path transform="translate(${x} ${y})" d="M0 -22L18 0H8V20H-8V0H-18Z" fill="${c}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
const downArrow = (x: number, y: number) => `<path transform="translate(${x} ${y})" d="M0 22L18 0H8V-20H-8V0H-18Z" fill="#2fbf6a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
const flame = (x: number, y: number) => `<path transform="translate(${x} ${y})" d="M0 -24Q14 -10 12 4Q10 18 0 20Q-12 18 -12 4Q-12 -6 -4 -12Q-4 -2 2 0Q4 -12 0 -24Z" fill="#ff7a33" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
const rocket = (x: number, y: number) =>
  `<g transform="translate(${x} ${y}) rotate(40)"><path d="M0 -26Q12 -12 10 12H-10Q-12 -12 0 -26Z" fill="#eef2f8" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="0" cy="-6" r="5" fill="#5ec8ff" stroke="${INK}" stroke-width="3"/><path d="M-6 12L0 26L6 12Z" fill="#ffb347" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></g>`;
const dots = (x: number, y: number) => [0, 1, 2].map((i) => `<circle cx="${x + i * 22}" cy="${y}" r="7" fill="#b8a6c8"/>`).join('');
const coin = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="17" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><path d="${starD(x, y + 1, 8)}" fill="#f0a020"/>`;
const question = (x: number, y: number) => line(`M${x - 9} ${y - 8}Q${x - 9} ${y - 20} ${x + 1} ${y - 20}Q${x + 12} ${y - 20} ${x + 12} ${y - 10}Q${x + 12} ${y - 3} ${x + 2} ${y + 1}V${y + 7}`, '#7a5ad8', 7) + `<circle cx="${x + 2}" cy="${y + 18}" r="4.5" fill="#7a5ad8"/>`;

export function keyartSvg(): string {
  embedNo = 0;
  const specs = stockSpecs();
  // 两侧人群：后排小、前排大；表情以开心和涨停为主，混一两个发愁的
  const crowd: [string, string, number, number, number, boolean?][] = [
    // 左后排
    ['ne_follower2', 'happy', 150, 760, 130], ['con_follower2', 'calm', 290, 744, 130], ['gm_follower2', 'happy', 420, 752, 126],
    // 左前排
    ['ai_leader', 'limitup', 90, 870, 210], ['con_blue', 'happy', 262, 884, 200], ['fin_blue', 'calm', 440, 878, 190],
    // 右后排
    ['ai_follower2', 'happy', 1180, 752, 126, true], ['ph_follower', 'worried', 1310, 744, 128, true], ['la_follower', 'happy', 1450, 760, 130, true],
    // 右前排
    ['pig_leader', 'limitup', 1160, 878, 200, true], ['ai_meme', 'happy', 1336, 884, 196, true], ['ne_meme', 'happy', 1488, 870, 206, true],
    // 房前的两只小的
    ['st_ghost', 'worried', 600, 880, 130], ['fin_leader', 'happy', 1010, 884, 150, true],
  ];
  const people = crowd.map(([id, e, x, y, s, f]) => stock(specs, id, e, x, y, s, f)).join('');
  const chats =
    chatBubble('qunzhu', 'smug', 40, 70, 210, (bx, by) => upArrow(bx + 46, by + 38) + flame(bx + 100, by + 40) + rocket(bx + 160, by + 38)) +
    chatBubble('laowang', 'normal', 90, 180, 170, (bx, by) => coin(bx + 48, by + 38) + dots(bx + 86, by + 38)) +
    chatBubble('xiaoli', 'awkward', 40, 290, 150, (bx, by) => downArrow(bx + 44, by + 38) + question(bx + 100, by + 38)) +
    chatBubble('dav', 'smug', 1290, 80, 190, (bx, by) => upArrow(bx + 42, by + 38, '#ff4d4d') + upArrow(bx + 92, by + 38, '#ff4d4d') + upArrow(bx + 142, by + 38, '#ff4d4d'), true) +
    chatBubble('zhangjie', 'normal', 1330, 196, 150, (bx, by) => `<path d="M${bx + 52} ${by + 54}C${bx + 26} ${by + 36} ${bx + 30} ${by + 18} ${bx + 42} ${by + 18}C${bx + 48} ${by + 18} ${bx + 52} ${by + 24} ${bx + 52} ${by + 26}C${bx + 52} ${by + 24} ${bx + 56} ${by + 18} ${bx + 62} ${by + 18}C${bx + 74} ${by + 18} ${bx + 78} ${by + 36} ${bx + 52} ${by + 54}Z" fill="#ff7a9a" stroke="${INK}" stroke-width="4"/>` + dots(bx + 88, by + 38), true) +
    chatBubble('neimu', 'smug', 1250, 310, 230, (bx, by) => dots(bx + 40, by + 38) + `<rect x="${bx + 116}" y="${by + 20}" width="34" height="30" rx="6" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><path d="M${bx + 122} ${by + 20}v-8q11 -12 22 0v8" fill="none" stroke="${INK}" stroke-width="5"/>` + flame(bx + 186, by + 40), true);
  const sparkles = [[560, 640, 12], [1040, 620, 10], [700, 470, 8], [930, 500, 9]].map(([x, y, r]) => `<path d="${sparkleD(x!, y!, r!)}" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>`).join('');
  const floor = `<ellipse cx="800" cy="846" rx="300" ry="20" fill="${INK}" fill-opacity="0.15"/>`;
  const scene = merge(frag(sky() + city()), grained(frag(hills()), 0.06, [0, 600, W, 300]), frag(floor + `<g transform="translate(800 846) scale(1.15) translate(-800 -846)">${house()}</g>` + sparkles + people + chats));
  return svgDoc(W, H, scene);
}

export function build(write: (rel: string, data: string) => void): number {
  write('scene/title_keyart.svg', keyartSvg());
  return 1;
}

export { darken, ellipseD, lighten };
