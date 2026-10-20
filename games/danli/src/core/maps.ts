/**
 * 地图（DESIGN.md 第 3 节）："轮廓多边形 + 预挖的洞"描述，开局光栅化成地形网格；出生点按队伍写在这里。
 * 整张图是一页画本：世界 3000×780，地形悬空，下面是雾；左、右、下三边是纸边，出了纸边就出局。上边不封顶。
 * 轮廓的上沿、下沿各是几个关键点，按 Catmull-Rom 采样成折线；只用加减乘除，再取整。
 * 现在只有厨房面团岛一张。
 */
import { carve, CELL, emptyTerrain, fillPolygon, MAT, SCORCH, type Pt, type Terrain } from './terrain.ts';

export type MapId = 'kitchen';

interface LandDef {
  /** 上沿的关键点（从左到右） */
  keys: readonly Pt[];
  /** 下沿的关键点（从右往左，接着上沿最右的点绕回最左的点）：往下垂的面团，一起一伏 */
  bottom: readonly Pt[];
  /** 每两个关键点之间采几个点 */
  per: number;
}

export interface MapDef {
  id: MapId;
  name: string;
  /** 一句话介绍（选桌页） */
  line: string;
  width: number;
  height: number;
  lands: readonly LandDef[];
  /** 开局就有的坑（圆心、半径） */
  craters: readonly (readonly [number, number, number])[];
  /** 打穿到底的井：x0..x1，井口圆顶的中心高度 top */
  shafts: readonly { x0: number; x1: number; top: number }[];
  /** 出生点（只给 x，y 落在地面上），按队伍；开局按 'open' 随机流挑 */
  spawns: readonly [readonly number[], readonly number[]];
}

/** Catmull-Rom 采样成折线，取整到世界单位 */
function sample(keys: readonly Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const p0 = keys[Math.max(0, i - 1)]!;
    const p1 = keys[i]!;
    const p2 = keys[i + 1]!;
    const p3 = keys[Math.min(keys.length - 1, i + 2)]!;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c2: number, d: number): number =>
        0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push([Math.round(c(p0[0], p1[0], p2[0], p3[0])), Math.round(c(p0[1], p1[1], p2[1], p3[1]))]);
    }
  }
  out.push(keys[keys.length - 1]!);
  return out;
}

/** 一块地形的轮廓（世界坐标的多边形）：上沿从左到右，下沿从右绕回左 */
export function landOutline(l: LandDef): Pt[] {
  const top = sample(l.keys, l.per);
  const ring = [top[top.length - 1]!, ...l.bottom, top[0]!];
  return [...top, ...sample(ring, l.per).slice(1, -1)];
}

/** 厨房面团岛：山头、山谷、悬崖、两块浮岛和一口井，什么都有一点（上沿照美术样张，下沿按 DESIGN.md 2.3 做薄） */
export const KITCHEN: MapDef = {
  id: 'kitchen',
  name: '厨房面团岛',
  line: '山头、山谷、悬崖、浮岛和一口井，什么都有一点',
  width: 3000,
  height: 780,
  // 画本要薄（DESIGN.md 2.3）：主体厚 85–105，山尖下面厚一些（约 140），左尖、悬崖脚、浮岛是薄处；出生点都在 85–100 厚的地方
  lands: [
    {
      keys: [
        [150, 470], [220, 440], [300, 452], [380, 422], [460, 432], [540, 402], [620, 332], [680, 272], [722, 252], [762, 264], [790, 304], [804, 352],
        [814, 400], [840, 424], [900, 434], [960, 428], [1040, 410], [1120, 390], [1200, 372], [1230, 366], [1320, 362], [1420, 356], [1520, 352],
        [1620, 350], [1680, 354], [1696, 392], [1708, 470], [1730, 536], [1800, 556], [1900, 560], [2000, 548], [2080, 522], [2150, 502], [2206, 516],
        [2228, 570],
      ],
      bottom: [
        [2224, 600], [2190, 606], [2150, 596], [2110, 612], [2060, 630], [2000, 636], [1940, 652], [1880, 644], [1820, 650], [1770, 636], [1736, 610],
        [1712, 560], [1700, 500], [1680, 455], [1640, 456], [1590, 446], [1540, 458], [1480, 448], [1420, 460], [1360, 452], [1300, 462], [1250, 468],
        [1200, 478], [1150, 470], [1100, 488], [1050, 500], [1000, 512], [950, 506], [900, 528], [850, 520], [810, 496], [780, 456], [750, 410],
        [720, 396], [690, 402], [650, 430], [610, 452], [570, 486], [530, 494], [490, 520], [440, 514], [390, 522], [340, 540], [290, 534], [240, 544],
        [190, 532], [160, 500],
      ],
      per: 8,
    },
    {
      keys: [[2404, 566], [2440, 502], [2500, 462], [2580, 424], [2640, 364], [2690, 334], [2742, 350], [2800, 410], [2846, 470], [2860, 560]],
      bottom: [
        [2858, 600], [2830, 560], [2800, 500], [2760, 450], [2720, 440], [2690, 430], [2650, 450], [2610, 490], [2580, 512], [2540, 540], [2500, 556],
        [2460, 580], [2430, 600], [2410, 598],
      ],
      per: 8,
    },
    {
      keys: [[1362, 216], [1396, 200], [1440, 192], [1484, 196], [1520, 212]],
      bottom: [[1524, 236], [1500, 258], [1476, 266], [1456, 282], [1436, 276], [1412, 282], [1396, 266], [1370, 248]],
      per: 6,
    },
    {
      keys: [[2262, 344], [2296, 330], [2340, 326], [2380, 342]],
      bottom: [[2384, 362], [2366, 382], [2346, 386], [2330, 400], [2314, 388], [2290, 386], [2266, 368]],
      per: 6,
    },
  ],
  craters: [[722, 254, 30], [1600, 352, 26], [2050, 540, 24], [2690, 336, 22], [430, 430, 20]],
  shafts: [{ x0: 1222, x1: 1290, top: 362 }],
  spawns: [
    [470, 900, 330],
    [1960, 1580, 2600],
  ],
};

export const MAPS: Readonly<Record<MapId, MapDef>> = { kitchen: KITCHEN };

/** 开局的地形：填轮廓、挖开局的坑和井 */
export function buildTerrain(m: MapDef): Terrain {
  const t = emptyTerrain(m.width, m.height);
  for (const l of m.lands) fillPolygon(t, landOutline(l), MAT.dough);
  for (const [x, y, r] of m.craters) carve(t, x, y, r);
  for (const s of m.shafts) {
    const r = (s.x1 - s.x0) / 2;
    carve(t, s.x0 + r, s.top, r);
    // 井身：竖着挖穿到底，井壁也标成焦边
    for (let row = Math.floor(s.top / CELL); row < t.rows; row++) {
      for (let col = Math.floor((s.x0 - 6) / CELL); col <= Math.floor((s.x1 + 6) / CELL); col++) {
        const cx = col * CELL + CELL / 2;
        const i = row * t.cols + col;
        if (cx >= s.x0 && cx < s.x1) t.cells[i] = 0;
        else if (t.cells[i]) t.cells[i] = t.cells[i]! | SCORCH;
      }
    }
  }
  return t;
}
