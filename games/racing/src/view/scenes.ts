/**
 * 三条赛道各自的场景（DESIGN.md 第 8 节），印在地图板上，在赛道下面：
 * - 环湖：内场两片水连成的大湖，湖心岛上一座六角亭、九曲桥通到岸边，水道上一座石桥，荷叶、小船；
 * - 山城：几座山（等高线 + 越高越暖的分层设色），最高的山顶一座三层檐的塔，坡上的梯坎石阶；一格格的街坊；
 *   两座山连得上（不压着弯道牌子）就拉一条索道；
 * - 海港：上沿是海，岸线跟着赛道走；靠岸的集装箱船、两台岸桥、防波堤尽头的灯塔；油罐区、仓库，集装箱对齐成排，码头铺装的接缝。
 * 每个场景说清楚哪些地方占了（occupied），树林避开这些地方。
 */
import type { Pt } from '../track/shape.ts';
import { blob, boat, C, f1, LW, pavilion, poly, type Rect, seeded, smooth } from './mapkit.ts';

export interface SceneCtx {
  id: string;
  map: Rect;
  /** 内场中心（赛道各格中点的平均） */
  cx: number;
  cy: number;
  near(x: number, y: number): number;
  clear(x: number, y: number): number;
  /** 弯道牌子（连飘带）那一块，m 是再多让多少 */
  blocked(x: number, y: number, m: number): boolean;
  inMap(x: number, y: number, m?: number): boolean;
}

export interface Scene {
  /** 画在地面上、赛道下面（detail 时多画细节） */
  draw(detail: boolean): string;
  /** 这里放了东西，不种树 */
  occupied(x: number, y: number, m: number): boolean;
  /** 种树的疏密系数 */
  density(x: number, y: number): number;
}

/** 离赛道最远的点；infield 时只找内场（往上下左右都碰得到赛道） */
function farthest(s: SceneCtx, x0: number, x1: number, y0: number, y1: number, infield: boolean): Pt {
  let best = -1;
  let p = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const enclosed = (x: number, y: number): boolean =>
    [0, 1, 2, 3].every((k) => {
      const a = (k * Math.PI) / 2;
      for (let r = 0; r < 900; r += 10) if (s.clear(x + Math.cos(a) * r, y + Math.sin(a) * r) < 0) return true;
      return false;
    });
  for (let y = y0; y < y1; y += 6)
    for (let x = x0; x < x1; x += 6) {
      if (!s.inMap(x, y, 40)) continue;
      const c = s.clear(x, y);
      if (c <= best || (infield && !enclosed(x, y))) continue;
      best = c;
      p = { x, y };
    }
  return p;
}

export function sceneOf(s: SceneCtx): Scene {
  if (s.id === 'lakeside') return lake(s);
  if (s.id === 'harbor') return harbor(s);
  return city(s);
}

// ---------- 环湖 ----------

function lake(s: SceneCtx): Scene {
  const stop = (x: number, y: number): boolean => s.clear(x, y) <= 42 || s.blocked(x, y, 8) || !s.inMap(x, y, 6);
  const LC = farthest(s, s.cx - 400, s.cx + 400, s.cy - 220, s.cy + 220, true);
  const LC2 = farthest(s, LC.x - 420, LC.x - 200, s.cy - 220, s.cy + 220, true);
  const lakes = [blob(LC, 420, 260, 0.6, stop), blob(LC2, 300, 200, 2.2, stop)];
  const inLake = (x: number, y: number, m = 0): boolean => lakes.some((b) => b.inside(x, y, m));
  // 两片水之间挖一道水道：两边岸线上离得最近、中点不压牌子的一对点
  let channel: Pt[] = [];
  let best = Infinity;
  for (const a of lakes[0]!.pts(1))
    for (const b of lakes[1]!.pts(1)) {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (s.blocked(m.x, m.y, 14)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= best) continue;
      best = d;
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      channel = [{ x: a.x - ux * 20, y: a.y - uy * 20 }, { x: m.x - uy * 8, y: m.y + ux * 8 }, { x: b.x + ux * 20, y: b.y + uy * 20 }];
    }
  const chD = channel.length ? `M${f1(channel[0]!.x)} ${f1(channel[0]!.y)}Q${f1(channel[1]!.x)} ${f1(channel[1]!.y)} ${f1(channel[2]!.x)} ${f1(channel[2]!.y)}` : '';
  const nearChannel = (x: number, y: number): number => {
    if (!channel.length) return Infinity;
    const [a, b, c] = channel as [Pt, Pt, Pt];
    let m = Infinity;
    for (let u = 0; u <= 1; u += 0.05) m = Math.min(m, Math.hypot((1 - u) ** 2 * a.x + 2 * u * (1 - u) * b.x + u * u * c.x - x, (1 - u) ** 2 * a.y + 2 * u * (1 - u) * b.y + u * u * c.y - y));
    return m;
  };
  const isl = { x: LC.x + 30, y: LC.y + 4 };
  return {
    occupied: (x, y, m) => inLake(x, y, m + 14) || nearChannel(x, y) < 30 + m,
    density: () => 1,
    draw: (detail) => {
      // 沙岸 → 岸线墨线 → 水 → 岸边一圈浅水和几道短波纹，中间留白
      let o = `<clipPath id="rb-lk-${s.id}">${lakes.map((b) => `<path d="${b.d}"/>`).join('')}${chD ? `<path d="${chD}" stroke-width="16"/>` : ''}</clipPath>`;
      for (const lk of lakes) o += `<path d="${smooth(lk.pts(1, 12))}" fill="${C.sand}"/>`;
      if (chD) o += `<path d="${chD}" fill="none" stroke="${C.sand}" stroke-width="40"/>`;
      for (const lk of lakes) o += `<path d="${lk.d}" fill="none" stroke="${C.ink}" stroke-width="${LW.major * 2}"/>`;
      if (chD) o += `<path d="${chD}" fill="none" stroke="${C.ink}" stroke-width="${16 + LW.major * 2}"/>`;
      for (const lk of lakes) o += `<path d="${lk.d}" fill="${C.water}"/>`;
      if (chD) o += `<path d="${chD}" fill="none" stroke="${C.water}" stroke-width="16"/>`;
      o += `<g clip-path="url(#rb-lk-${s.id})">`;
      for (const lk of lakes) o += `<path d="${lk.d}" fill="none" stroke="${C.waterShallow}" stroke-width="26"/>`;
      for (const lk of lakes)
        for (const [k, dash] of [
          [0.94, '22 30'],
          [0.89, '12 40'],
        ] as const)
          o += `<path d="${smooth(lk.pts(k))}" fill="none" stroke="${C.waterLine}" stroke-width="${LW.decor * 1.4}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
      o += `</g>`;
      // 九曲桥：从岛往东北一折一折地伸到岸
      const bridge: Pt[] = [{ x: isl.x + 22, y: isl.y - 4 }];
      for (let k = 1; k < 8; k++) {
        const p = { x: isl.x + 22 + k * 28, y: isl.y - 4 - k * 9 + (k % 2 ? 14 : 0) };
        bridge.push(p);
        if (!inLake(p.x, p.y, -4)) break;
      }
      o += `<path d="${poly(bridge)}" fill="none" stroke="${C.ink}" stroke-width="10" stroke-linejoin="miter"/><path d="${poly(bridge)}" fill="none" stroke="#efe6d0" stroke-width="${10 - LW.minor * 2}" stroke-linejoin="miter"/>`;
      if (detail) o += `<path d="${poly(bridge)}" fill="none" stroke="${C.ink}" stroke-width="${10 - LW.minor * 2}" stroke-dasharray="${LW.decor} 7" stroke-linejoin="miter" opacity=".6"/>`;
      const islPts = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const rr = 30 * (1 + 0.12 * Math.sin(3 * a + 1));
        return { x: isl.x + Math.cos(a) * rr, y: isl.y + Math.sin(a) * rr * 0.85 };
      });
      o += `<path d="${smooth(islPts)}" fill="${C.grass}" stroke="${C.ink}" stroke-width="${LW.major}"/>`;
      o += pavilion(isl.x, isl.y, 20, 6, '#4f7c74');
      if (channel.length) {
        const [a, , b] = channel as [Pt, Pt, Pt];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        o += `<g transform="translate(${f1(m.x)} ${f1(m.y)}) rotate(${f1((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)})"><path d="M-8 -20Q0 -24 8 -20V20Q0 24 -8 20Z" fill="#e3d9bf" stroke="${C.ink}" stroke-width="${LW.minor}"/>${detail ? `<path d="M-8 -12H8M-8 -4H8M-8 4H8M-8 12H8" stroke="${C.ink}" stroke-width="${LW.decor}" opacity=".6"/>` : ''}</g>`;
      }
      if (detail) {
        const r = seeded(13);
        for (let i = 0; i < 16; i++) {
          const x = LC2.x - 60 + r() * 70;
          const y = LC2.y - 30 + r() * 60;
          if (!inLake(x, y, -20)) continue;
          const k = 4 + r() * 3.5;
          o += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r() * 360)})"><path d="M0 0L${f1(k)} -1.5A${f1(k)} ${f1(k)} 0 1 0 ${f1(k)} 1.5Z" fill="#8fb878" stroke="${C.ink}" stroke-width="${LW.decor}"/></g>`;
          if (r() < 0.2) o += `<circle cx="${f1(x + 2)}" cy="${f1(y - 2)}" r="2.3" fill="#eaa2b6" stroke="${C.ink}" stroke-width="${LW.decor}"/>`;
        }
        for (const [dx, dy, a] of [
          [-60, 70, 18],
          [90, 95, -12],
        ] as const) {
          let k = 1;
          while (k > 0.2 && !inLake(LC.x + dx * k, LC.y + dy * k, -30)) k -= 0.05;
          o += boat(LC.x + dx * k, LC.y + dy * k, a);
        }
      }
      return o;
    },
  };
}

// ---------- 山城 ----------

function city(s: SceneCtx): Scene {
  const { map } = s;
  const r = seeded(7);
  // 山：离赛道远、离板边也远的几处，彼此隔开
  const hills: ReturnType<typeof blob>[] = [];
  const edge = (p: Pt): number => Math.min(p.x - map.x, map.x + map.w - p.x, p.y - map.y, map.y + map.h - p.y);
  const cands: Pt[] = [];
  for (let y = map.y + 60; y < map.y + map.h - 60; y += 20)
    for (let x = map.x + 60; x < map.x + map.w - 60; x += 20) if (s.clear(x, y) > 80 && !s.blocked(x, y, 30)) cands.push({ x, y });
  const score = (p: Pt): number => Math.min(s.clear(p.x, p.y), 180) + Math.min(edge(p), 160);
  cands.sort((a, b) => score(b) - score(a));
  const stop = (x: number, y: number): boolean => s.clear(x, y) <= 30 || s.blocked(x, y, 8) || !s.inMap(x, y, 6);
  for (const p of cands) {
    if (hills.length >= 3) break;
    if (hills.some((h) => Math.hypot(h.c.x - p.x, h.c.y - p.y) < 260)) continue;
    hills.push(blob(p, 200, 150, hills.length * 1.7, stop));
  }
  const inHill = (x: number, y: number, m = 0): boolean => hills.some((h) => h.inside(x, y, m));
  // 街坊：横平竖直，一格一个，一个街坊里一到三栋楼
  const blocks: { x: number; y: number; w: number; h: number; kind: number[] }[] = [];
  for (let y = map.y + 30; y < map.y + map.h - 50; y += 52)
    for (let x = map.x + 30; x < map.x + map.w - 70; x += 70) {
      const w = 56;
      const h = 38;
      const ok = [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
        [w / 2, h / 2],
      ].every(([dx, dy]) => s.clear(x + dx!, y + dy!) > 40 && !s.blocked(x + dx!, y + dy!, 6) && !inHill(x + dx!, y + dy!, 10));
      if (!ok || r() < 0.05) continue;
      blocks.push({ x, y, w, h, kind: Array.from({ length: 1 + Math.floor(r() * 3) }, () => Math.floor(r() * 4)) });
    }
  const top = hills[0]?.c ?? { x: s.cx, y: s.cy };
  // 索道：只连最近的另一座山，线上不压牌子；连不上就不拉
  let other: Pt | null = null;
  for (const h of hills.slice(1).sort((a, b) => Math.hypot(a.c.x - top.x, a.c.y - top.y) - Math.hypot(b.c.x - top.x, b.c.y - top.y))) {
    let ok = Math.hypot(h.c.x - top.x, h.c.y - top.y) < 560;
    for (let u = 0; ok && u <= 1; u += 0.02) if (s.blocked(top.x + (h.c.x - top.x) * u, top.y + (h.c.y - top.y) * u, 10)) ok = false;
    if (ok) {
      other = h.c;
      break;
    }
  }
  const ROOF = ['#c97a63', '#9aa2a8', '#d6b678', '#b9876a'];
  return {
    occupied: (x, y, m) => blocks.some((b) => x > b.x - 10 - m && x < b.x + b.w + 10 + m && y > b.y - 10 - m && y < b.y + b.h + 10 + m) || Math.hypot(x - top.x, y - top.y) < 26 + m,
    // 山上少种树，露出等高线
    density: (x, y) => (inHill(x, y, -10) ? 0.3 : 1),
    draw: (detail) => {
      let o = blocks.map((b) => `<rect x="${b.x - 9}" y="${b.y - 8}" width="${b.w + 18}" height="${b.h + 16}" fill="#e3dccb"/>`).join('');
      for (const h of hills) {
        ['#d3cf98', '#dccb90', '#e3c588', '#e8bf82', '#ecb87c'].forEach((col, i) => {
          o += `<path d="${smooth(h.pts(1 - i * 0.19))}" fill="${col}" stroke="#8f7550" stroke-width="${LW.decor * 1.3}"/>`;
        });
        if (detail) {
          // 梯坎：从山脚往上一道石阶
          const a = (h.c.x * 7) % 6.28;
          const p0 = { x: h.c.x + Math.cos(a) * h.size * 0.95, y: h.c.y + Math.sin(a) * h.size * 0.95 };
          const p1 = { x: h.c.x + Math.cos(a) * h.size * 0.25, y: h.c.y + Math.sin(a) * h.size * 0.25 };
          const d = `M${f1(p0.x)} ${f1(p0.y)}L${f1(p1.x)} ${f1(p1.y)}`;
          o += `<path d="${d}" stroke="${C.ink}" stroke-width="9"/><path d="${d}" stroke="#e8dfc9" stroke-width="6.2"/><path d="${d}" stroke="${C.ink}" stroke-width="6.2" stroke-dasharray="${LW.decor} 3.2"/>`;
        }
      }
      for (const b of blocks) {
        const n = b.kind.length;
        for (let i = 0; i < n; i++) {
          const bx = b.x + (i * b.w) / n;
          const bw = b.w / n;
          o += `<rect x="${f1(bx)}" y="${f1(b.y)}" width="${f1(bw)}" height="${f1(b.h)}" fill="${ROOF[b.kind[i]!]}" stroke="${C.ink}" stroke-width="${LW.minor}"/>`;
          if (detail && b.kind[i] !== 1) o += `<path d="M${f1(bx + bw / 2)} ${f1(b.y + 3)}V${f1(b.y + b.h - 3)}" stroke="${C.ink}" stroke-width="${LW.decor}" opacity=".7"/>`;
          if (detail && b.kind[i] === 1) o += `<rect x="${f1(bx + 4)}" y="${f1(b.y + 4)}" width="6" height="5" fill="#f3efe4" stroke="${C.ink}" stroke-width="${LW.decor}"/>`;
        }
      }
      o += pavilion(top.x, top.y, 20, 8, '#a8463a') + pavilion(top.x, top.y, 13, 8, '#b85446') + pavilion(top.x, top.y, 7, 8, '#c96655');
      if (other) {
        // 索道：两根细线挂几个车厢，细线不挡格子
        const d = Math.hypot(other.x - top.x, other.y - top.y);
        const line = `M${f1(top.x)} ${f1(top.y)}L${f1(other.x)} ${f1(other.y)}`;
        o += `<path d="${line}" stroke="${C.ink}" stroke-width="${LW.minor}"/><path d="${line}" stroke="${C.ink}" stroke-width="${LW.decor}" transform="translate(0 5)"/>`;
        const ang = (Math.atan2(other.y - top.y, other.x - top.x) * 180) / Math.PI;
        for (let k = 1; k < d / 90; k++) {
          const u = (k * 90) / d;
          o += `<g transform="translate(${f1(top.x + (other.x - top.x) * u)} ${f1(top.y + (other.y - top.y) * u + 2.5)}) rotate(${f1(ang)})"><rect x="-7" y="-5" width="14" height="10" rx="2" fill="${k % 2 ? C.red : C.gold}" stroke="${C.ink}" stroke-width="${LW.minor}"/></g>`;
        }
        o += `<rect x="${f1(other.x - 10)}" y="${f1(other.y - 8)}" width="20" height="16" fill="${C.paper}" stroke="${C.ink}" stroke-width="${LW.minor}"/>`;
      }
      return o;
    },
  };
}

// ---------- 海港 ----------

function harbor(s: SceneCtx): Scene {
  const { map } = s;
  const r = seeded(9);
  // 岸线：上沿往下伸到离赛道 54 为止，再抹平
  const shore: Pt[] = [];
  for (let x = map.x - 10; x <= map.x + map.w + 10; x += 8) {
    const base = map.y + 120 + 14 * Math.sin(x * 0.011) + 8 * Math.sin(x * 0.03 + 1);
    let y = map.y;
    while (y < base && s.clear(x, y + 4) > 54) y += 2;
    shore.push({ x, y });
  }
  for (let it = 0; it < 5; it++) for (let i = 1; i < shore.length - 1; i++) shore[i]!.y = Math.min(shore[i]!.y, (shore[i - 1]!.y + shore[i]!.y + shore[i + 1]!.y) / 3);
  const shoreAt = (x: number): number => shore[Math.max(0, Math.min(shore.length - 1, Math.round((x - (map.x - 10)) / 8)))]!.y;
  const inSea = (x: number, y: number, m = 0): boolean => y < shoreAt(x) + m;
  const seaD = `M${f1(map.x - 10)} ${f1(map.y - 10)}${shore.map((p) => `L${f1(p.x)} ${f1(p.y)}`).join('')}L${f1(map.x + map.w + 10)} ${f1(map.y - 10)}Z`;
  const used: ((x: number, y: number, m: number) => boolean)[] = [(x, y, m) => inSea(x, y, m + 16)];
  // 油罐区：离赛道最远的一块空地
  const tankC = farthest(s, map.x + 60, map.x + map.w - 60, map.y + 160, map.y + map.h - 60, false);
  const tanks: Pt[] = [];
  for (const [dx, dy] of [
    [-30, -26],
    [30, -26],
    [-30, 26],
    [30, 26],
    [90, 0],
  ] as const) {
    const p = { x: tankC.x + dx, y: tankC.y + dy };
    if (s.clear(p.x, p.y) > 60 && !s.blocked(p.x, p.y, 20)) tanks.push(p);
  }
  used.push((x, y, m) => tanks.some((p) => Math.hypot(p.x - x, p.y - y) < 34 + m));
  // 仓库和堆场：横平竖直地排，集装箱一垛一垛对齐
  const sheds: Rect[] = [];
  const stacks: { x: number; y: number; c: number }[] = [];
  const fits = (x: number, y: number, w: number, h: number, m: number): boolean =>
    [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
      [w / 2, h / 2],
    ].every(([dx, dy]) => s.clear(x + dx!, y + dy!) > m && !s.blocked(x + dx!, y + dy!, 6) && !used.some((o) => o(x + dx!, y + dy!, 4)) && s.inMap(x + dx!, y + dy!, 14));
  for (let y = map.y + 40; y < map.y + map.h - 40; y += 70)
    for (let x = map.x + 30; x < map.x + map.w - 130; x += 140) {
      if (r() < 0.22 && fits(x, y, 118, 48, 44)) {
        sheds.push({ x, y, w: 118, h: 48 });
        continue;
      }
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const sx = x + i * 30;
          const sy = y + j * 15;
          if (r() < 0.12 || !fits(sx, sy, 27, 12, 40)) continue;
          stacks.push({ x: sx, y: sy, c: Math.floor(r() * 6) });
        }
    }
  used.push((x, y, m) => stacks.some((q) => x > q.x - 6 - m && x < q.x + 33 + m && y > q.y - 6 - m && y < q.y + 18 + m) || sheds.some((q) => x > q.x - 8 - m && x < q.x + q.w + 8 + m && y > q.y - 8 - m && y < q.y + q.h + 8 + m));
  const COL = ['#c0563f', '#3f6fa8', '#d1a23a', '#4f8f5a', '#8a6aa8', '#e8e2d2'];
  return {
    occupied: (x, y, m) => used.some((o) => o(x, y, m)),
    // 码头上只零星几棵树
    density: () => 0.12,
    draw: (detail) => {
      let o = '';
      if (detail) {
        let d = '';
        for (let x = map.x; x < map.x + map.w; x += 48) d += `M${f1(x)} ${f1(map.y)}V${f1(map.y + map.h)}`;
        for (let y = map.y; y < map.y + map.h; y += 48) d += `M${f1(map.x)} ${f1(y)}H${f1(map.x + map.w)}`;
        o += `<path d="${d}" stroke="#bdb6a6" stroke-width="${LW.decor}"/>`;
      }
      o += `<clipPath id="rb-sea-${s.id}"><path d="${seaD}"/></clipPath>`;
      o += `<path d="${seaD}" fill="${C.water}"/><g clip-path="url(#rb-sea-${s.id})"><path d="${smooth(shore, false)}" fill="none" stroke="${C.waterShallow}" stroke-width="40"/>`;
      const wr = seeded(31);
      for (let i = 0; i < 90; i++) {
        const x = map.x + wr() * map.w;
        const y = map.y - 10 + wr() * 130;
        if (!inSea(x, y, -18)) continue;
        o += `<path d="M${f1(x)} ${f1(y)}q5 -4 10 0t10 0" fill="none" stroke="${C.waterLine}" stroke-width="${LW.decor * 1.4}"/>`;
      }
      o += `</g><path d="${smooth(shore, false)}" fill="none" stroke="${C.ink}" stroke-width="${LW.major * 2}"/><path d="${smooth(shore, false)}" fill="none" stroke="${C.paper}" stroke-width="3" transform="translate(0 4)"/>`;
      // 靠岸的集装箱船和两台岸桥（西北），防波堤和灯塔（东北）
      const shipX = map.x + 190;
      const shipY = shoreAt(shipX) - 34;
      o += `<g transform="translate(${f1(shipX)} ${f1(shipY)})"><path d="M-150 -20H120Q160 -18 176 0Q160 18 120 20H-150Q-160 20 -160 10V-10Q-160 -20 -150 -20Z" fill="#5b6f82" stroke="${C.ink}" stroke-width="${LW.major}"/><rect x="-150" y="-13" width="22" height="26" fill="${C.paper}" stroke="${C.ink}" stroke-width="${LW.minor}"/>`;
      const cr = seeded(17);
      for (let col = 0; col < 10; col++) for (let row = 0; row < 3; row++) o += `<rect x="${-122 + col * 24}" y="${-13 + row * 9}" width="22" height="8" fill="${COL[Math.floor(cr() * 6)]}" stroke="${C.ink}" stroke-width="${LW.decor}"/>`;
      o += `</g>`;
      for (const dx of [-60, 70]) {
        const x = shipX + dx;
        o += `<g transform="translate(${f1(x)} ${f1(shoreAt(x))})"><path d="M-9 -78V26M9 -78V26" stroke="${C.ink}" stroke-width="7"/><path d="M-9 -78V26M9 -78V26" stroke="#e07a3a" stroke-width="4.4"/>${detail ? `<path d="M-9 -70L9 -56M9 -70L-9 -56M-9 -40L9 -26M9 -40L-9 -26M-9 -10L9 4M9 -10L-9 4" stroke="${C.ink}" stroke-width="${LW.decor}"/>` : ''}<rect x="-12" y="8" width="24" height="14" fill="${C.gold}" stroke="${C.ink}" stroke-width="${LW.minor}"/></g>`;
      }
      const lhX = map.x + map.w - 90;
      const lhY = shoreAt(lhX);
      const mole = `M${f1(lhX - 40)} ${f1(lhY)}Q${f1(lhX - 10)} ${f1(lhY - 40)} ${f1(lhX)} ${f1(lhY - 80)}`;
      o += `<path d="${mole}" fill="none" stroke="${C.ink}" stroke-width="16"/><path d="${mole}" fill="none" stroke="#d6d1c3" stroke-width="${16 - LW.major * 2}"/>`;
      o += `<g transform="translate(${f1(lhX)} ${f1(lhY - 84)})"><circle r="14" fill="${C.paper}" stroke="${C.ink}" stroke-width="${LW.major}"/><circle r="9.5" fill="none" stroke="${C.red}" stroke-width="4"/><circle r="4.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="${LW.minor}"/></g>`;
      if (tanks.length) {
        const x0 = Math.min(...tanks.map((p) => p.x)) - 30;
        const y0 = Math.min(...tanks.map((p) => p.y)) - 30;
        const x1 = Math.max(...tanks.map((p) => p.x)) + 30;
        const y1 = Math.max(...tanks.map((p) => p.y)) + 30;
        o += `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" rx="4" fill="#e2ddcf" stroke="${C.ink}" stroke-width="${LW.minor}" stroke-dasharray="5 4"/>`;
        for (const p of tanks)
          o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="22" fill="#eeeadf" stroke="${C.ink}" stroke-width="${LW.major}"/><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="15" fill="none" stroke="${C.ink}" stroke-width="${LW.decor}"/><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="3" fill="${C.ink}"/>`;
      }
      for (const b of sheds) {
        o += `<rect x="${f1(b.x)}" y="${f1(b.y)}" width="${b.w}" height="${b.h}" fill="#a9b8c4" stroke="${C.ink}" stroke-width="${LW.minor}"/><path d="M${f1(b.x)} ${f1(b.y + b.h / 2)}H${f1(b.x + b.w)}" stroke="${C.ink}" stroke-width="${LW.minor}"/>`;
        if (detail) {
          let d = '';
          for (let x = b.x + 6; x < b.x + b.w; x += 6) d += `M${f1(x)} ${f1(b.y + 2)}V${f1(b.y + b.h - 2)}`;
          o += `<path d="${d}" stroke="${C.ink}" stroke-width="${LW.decor * 0.7}" opacity=".45"/>`;
        }
      }
      for (const q of stacks) {
        o += `<rect x="${f1(q.x)}" y="${f1(q.y)}" width="27" height="12" fill="${COL[q.c]}" stroke="${C.ink}" stroke-width="${LW.minor}"/>`;
        if (detail) o += `<path d="M${f1(q.x + 7)} ${f1(q.y + 1)}V${f1(q.y + 11)}M${f1(q.x + 13.5)} ${f1(q.y + 1)}V${f1(q.y + 11)}M${f1(q.x + 20)} ${f1(q.y + 1)}V${f1(q.y + 11)}" stroke="${C.ink}" stroke-width="${LW.decor}" opacity=".5"/>`;
      }
      return o;
    },
  };
}
