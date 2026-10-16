// 程序生成的麻将牌面：不用图片和网络字体，每种牌只生成一次。
// kind：0–8 万，9–17 筒，18–26 条；-1 为牌背。

const FONT = `'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei',sans-serif`;
const BLUE = '#1f5fa8';
const GREEN = '#1f8a4c';
const RED = '#c0262d';
const BACK_GREEN = '#1f7a5a';

const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUITS = ['万', '筒', '条'];

const DEFS =
  `<defs><linearGradient id="ivory" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#fffdf4"/><stop offset="1" stop-color="#ece4cc"/></linearGradient>` +
  `<pattern id="lattice" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<path d="M0 0H10M0 0V10" stroke="#2f9a74" stroke-width="1.2" fill="none"/></pattern></defs>`;

// 底部一条墨绿"厚度"：先画整块绿，再在上面盖略矮的象牙白正面
const BODY =
  `<rect x="1" y="1" width="58" height="82" rx="6" fill="${BACK_GREEN}" stroke="#0f3d2e" stroke-width="1.5"/>` +
  `<rect x="2.5" y="2.5" width="55" height="73" rx="5" fill="url(#ivory)" stroke="#b9ae8c" stroke-width="0.8"/>`;

const BACK =
  `<rect x="1" y="1" width="58" height="82" rx="6" fill="${BACK_GREEN}" stroke="#0f3d2e" stroke-width="1.5"/>` +
  `<rect x="6" y="6" width="48" height="72" rx="5" fill="url(#lattice)" stroke="#a6e0c8" stroke-width="2"/>` +
  `<rect x="14" y="26" width="32" height="32" rx="6" fill="${BACK_GREEN}" stroke="#a6e0c8" stroke-width="2"/>`;

function wan(n: number): string {
  const t = (y: number, size: number, fill: string, ch: string) =>
    `<text x="30" y="${y}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" font-family="${FONT}">${ch}</text>`;
  return t(37, 32, '#1b2a4a', NUMS[n] ?? '') + t(69, 32, RED, '萬');
}

// 同心圆饼：外圈有色、内圈白、中心点有色，缩小后仍能分出圈层
function pip(x: number, y: number, r: number, c: string): string {
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#12304f" stroke-opacity=".35" stroke-width=".8"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.62).toFixed(2)}" fill="#fffdf4"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(2)}" fill="${c}"/>`
  );
}

function bigPip(): string {
  const x = 30;
  const y = 38;
  let s = `<circle cx="${x}" cy="${y}" r="21" fill="${BLUE}"/><circle cx="${x}" cy="${y}" r="16.5" fill="#fffdf4"/>`;
  s += `<circle cx="${x}" cy="${y}" r="13" fill="${GREEN}"/><circle cx="${x}" cy="${y}" r="8.5" fill="#fffdf4"/>`;
  // 花瓣：绕一圈的红点，给"大饼"一点花纹
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `<circle cx="${(x + 10.8 * Math.cos(a)).toFixed(2)}" cy="${(y + 10.8 * Math.sin(a)).toFixed(2)}" r="1.9" fill="#fffdf4"/>`;
  }
  s += `<circle cx="${x}" cy="${y}" r="5.2" fill="${RED}"/><circle cx="${x}" cy="${y}" r="1.8" fill="#fffdf4"/>`;
  return s;
}

function tong(n: number): string {
  const P = (x: number, y: number, r: number, c: string) => pip(x, y, r, c);
  switch (n) {
    case 0: return bigPip();
    case 1: return P(30, 21, 12, GREEN) + P(30, 55, 12, RED);
    case 2: return P(16, 18, 10.5, BLUE) + P(30, 38, 10.5, RED) + P(44, 58, 10.5, GREEN);
    case 3: return P(18, 22, 11, BLUE) + P(42, 22, 11, GREEN) + P(18, 54, 11, GREEN) + P(42, 54, 11, BLUE);
    case 4: return P(17, 20, 10, BLUE) + P(43, 20, 10, GREEN) + P(17, 56, 10, GREEN) + P(43, 56, 10, BLUE) + P(30, 38, 10, RED);
    case 5: {
      let s = '';
      for (const x of [18, 42]) s += P(x, 15, 9.5, GREEN);
      for (const x of [18, 42]) for (const y of [40, 61]) s += P(x, y, 9.5, RED);
      return s;
    }
    case 6: {
      let s = P(13, 13, 8.5, GREEN) + P(30, 20, 8.5, GREEN) + P(47, 27, 8.5, GREEN);
      for (const x of [18, 42]) for (const y of [45, 62]) s += P(x, y, 8.5, RED);
      return s;
    }
    case 7: {
      let s = '';
      for (const x of [20, 40]) for (const y of [13, 29, 45, 61]) s += P(x, y, 8.2, y < 38 ? GREEN : x === 20 ? BLUE : GREEN);
      return s;
    }
    default: {
      let s = '';
      const cols = [BLUE, RED, GREEN];
      [15, 30, 45].forEach((x, i) => {
        for (const y of [17, 38, 59]) s += P(x, y, 8.5, cols[i] ?? RED);
      });
      return s;
    }
  }
}

// 单根竹子：圆角长条 + 中间横节 + 一道高光
function stick(x: number, y: number, h: number, c: string, w = 9): string {
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  return (
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="3.5" fill="${c}" stroke="#0d3b22" stroke-opacity=".5" stroke-width=".8"/>` +
    `<rect x="${x0 + 1.6}" y="${y0 + 2}" width="1.8" height="${h - 4}" rx=".9" fill="#fff" fill-opacity=".35"/>` +
    `<rect x="${x0 - 0.8}" y="${y - 1.2}" width="${w + 1.6}" height="2.4" rx="1.1" fill="#0d3b22" fill-opacity=".75"/>`
  );
}

function bird(): string {
  return (
    // 尾羽
    `<path d="M30 54 L19 71 L26 66 L30 74 L34 66 L41 71 Z" fill="${RED}" stroke="#7a1519" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M30 54 L24 68 L30 62 L36 68 Z" fill="${GREEN}"/>` +
    // 翅膀与身体
    `<ellipse cx="30" cy="42" rx="12.5" ry="15" fill="${GREEN}" stroke="#0d3b22" stroke-width="1"/>` +
    `<path d="M30 30 C15 32 12 48 20 56 C21 46 25 38 30 36 Z" fill="#14683a"/>` +
    `<path d="M30 30 C45 32 48 48 40 56 C39 46 35 38 30 36 Z" fill="#14683a"/>` +
    `<ellipse cx="30" cy="46" rx="5" ry="8" fill="${RED}"/>` +
    // 头、冠、嘴、眼
    `<circle cx="30" cy="20" r="7.5" fill="${GREEN}" stroke="#0d3b22" stroke-width="1"/>` +
    `<path d="M27 14 L30 7 L33 14 Z" fill="${RED}"/>` +
    `<path d="M36 20 L43 22.5 L36 25 Z" fill="#e8a317" stroke="#8a5a00" stroke-width=".6" stroke-linejoin="round"/>` +
    `<circle cx="32.5" cy="19" r="2" fill="#fff"/><circle cx="33" cy="19" r="1" fill="#111"/>`
  );
}

function tiao(n: number): string {
  const G = GREEN;
  switch (n) {
    case 0: return bird();
    case 1: return stick(30, 21, 28, G) + stick(30, 55, 28, G);
    case 2: return stick(30, 21, 28, G) + stick(19, 55, 28, G) + stick(41, 55, 28, G);
    case 3: return stick(19, 21, 28, G) + stick(41, 21, 28, G) + stick(19, 55, 28, G) + stick(41, 55, 28, G);
    case 4: return stick(17, 21, 28, G) + stick(43, 21, 28, G) + stick(17, 55, 28, G) + stick(43, 55, 28, G) + stick(30, 38, 28, RED);
    case 5: {
      let s = '';
      for (const x of [14, 30, 46]) for (const y of [21, 55]) s += stick(x, y, 28, G);
      return s;
    }
    case 6: {
      let s = stick(30, 15, 18, RED);
      for (const x of [14, 30, 46]) for (const y of [38, 60]) s += stick(x, y, 20, G);
      return s;
    }
    case 7: {
      // 8 条传统是 M/W 形，这里取清楚优先：四列两行
      let s = '';
      for (const x of [12, 24, 36, 48]) for (const y of [21, 55]) s += stick(x, y, 28, G, 8.5);
      return s;
    }
    default: {
      let s = '';
      [14, 30, 46].forEach((x, i) => {
        for (const y of [17, 38, 59]) s += stick(x, y, 19, i === 1 ? RED : G);
      });
      return s;
    }
  }
}

function face(kind: number): string {
  const n = kind % 9;
  if (kind < 9) return wan(n);
  if (kind < 18) return tong(n);
  return tiao(n);
}

/** 一张牌的完整 SVG 字符串（含牌身），viewBox="0 0 60 84"；kind = -1 画成牌背 */
export function tileSvg(kind: number): string {
  const inner = kind < 0 || kind > 26 || !Number.isInteger(kind) ? BACK : BODY + face(kind);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84">${DEFS}${inner}</svg>`;
}

const cache = new Map<number, string>();

/** 同上但做成 data URI，模块内缓存，每种只生成一次 */
export function tileUrl(kind: number): string {
  const key = kind >= 0 && kind <= 26 && Number.isInteger(kind) ? kind : -1;
  let u = cache.get(key);
  if (!u) {
    u = 'data:image/svg+xml;utf8,' + encodeURIComponent(tileSvg(key));
    cache.set(key, u);
  }
  return u;
}

/** 牌背 */
export function backUrl(): string {
  return tileUrl(-1);
}

/** 中文名：'一万' '五筒' '七条' */
export function tileName(kind: number): string {
  if (!Number.isInteger(kind) || kind < 0 || kind > 26) return '';
  return (NUMS[kind % 9] ?? '') + (SUITS[Math.floor(kind / 9)] ?? '');
}
