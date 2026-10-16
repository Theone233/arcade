/**
 * 川麻·血战到底的番（DESIGN.md 2.7）。番数相加，取所有拆法里最大的；一把 = 底分 × 2^番，封顶由房间选。
 * 只看牌和这一手的时机，不碰筹码。
 */
import { decompose, isSeven, type Counts } from '../../hand/index.ts';
import type { Meld } from '../../table/index.ts';
import { kindOf, KINDS, rankOf, suitOf } from '../../tiles/index.ts';

/** 番型 id（界面按 id 显示中文名，见 view/variants/sichuan-xuezhan） */
export type FanId =
  | 'ping'
  | 'pengpeng'
  | 'qing'
  | 'qidui'
  | 'longqidui'
  | 'jiangdui'
  | 'yaojiu'
  | 'jingou'
  | 'gen'
  | 'gangkai'
  | 'gangpao'
  | 'qianggang'
  | 'haidi'
  | 'haidipao'
  | 'tianhu'
  | 'dihu'
  | 'zimo';

export interface FanItem {
  id: FanId;
  fan: number;
  /** 根的个数（只有 gen 有） */
  n?: number;
}

/** 和牌的时机 */
export interface WinContext {
  zimo: boolean;
  /** 杠后补牌自摸（杠上开花） */
  gangKai: boolean;
  /** 胡的是别人杠后补牌打出的（杠上炮） */
  gangPao: boolean;
  /** 抢杠胡 */
  rob: boolean;
  /** 牌墙最后一张（海底捞月 / 海底炮） */
  haidi: boolean;
  tian: boolean;
  di: boolean;
  /** 自摸加番（房间选"加番"时） */
  zimoFan: boolean;
}

export const NO_CONTEXT: WinContext = { zimo: false, gangKai: false, gangPao: false, rob: false, haidi: false, tian: false, di: false, zimoFan: false };

export interface FanResult {
  /** 封顶前的番 */
  raw: number;
  /** 封顶后的番 */
  fan: number;
  items: FanItem[];
  capped: boolean;
}

const has19 = (k: number): boolean => rankOf(k) === 1 || rankOf(k) === 9;
const is258 = (k: number): boolean => rankOf(k) === 2 || rankOf(k) === 5 || rankOf(k) === 8;

/**
 * 算番。hand 是手里的 14 张（含胡的那张）的计数，melds 是碰杠。
 * 调用方保证已经和了（一般型或七对）、手里没有缺门。
 */
export function scoreHand(hand: Counts, melds: readonly Meld[], ctx: WinContext, cap: number): FanResult {
  // 自己所有的牌：手里 + 碰杠（杠四张）
  const all = hand.slice();
  for (const m of melds) for (const t of m.tiles) all[kindOf(t)]!++;
  const gen = all.reduce((a, x) => a + (x === 4 ? 1 : 0), 0);
  const suits = new Set<number>();
  for (let k = 0; k < KINDS; k++) if (all[k]! > 0) suits.add(suitOf(k));
  const qing = suits.size === 1;

  const situational: FanItem[] = [];
  if (ctx.gangKai) situational.push({ id: 'gangkai', fan: 1 });
  if (ctx.gangPao) situational.push({ id: 'gangpao', fan: 1 });
  if (ctx.rob) situational.push({ id: 'qianggang', fan: 1 });
  if (ctx.haidi) situational.push({ id: ctx.zimo ? 'haidi' : 'haidipao', fan: 1 });
  if (ctx.zimo && ctx.zimoFan) situational.push({ id: 'zimo', fan: 1 });

  // 天胡、地胡直接封顶，不再叠别的番
  if (ctx.tian || ctx.di) return { raw: cap, fan: cap, items: [{ id: ctx.tian ? 'tianhu' : 'dihu', fan: cap }], capped: true };

  const candidates: FanItem[][] = [];
  // 七对：四张一样算两对；有根就是龙七对（3 番含 1 根，再多的根照常 +1，和"七对 2 + 根"数一样）
  if (melds.length === 0 && isSeven(hand, true)) {
    const items: FanItem[] = gen > 0 ? [{ id: 'longqidui', fan: 3 }] : [{ id: 'qidui', fan: 2 }];
    if (gen > 1) items.push({ id: 'gen', fan: gen - 1, n: gen - 1 });
    candidates.push(items);
  }
  for (const d of decompose(hand, melds.length)) {
    const items: FanItem[] = [];
    const pungs = d.groups.every((g) => g.type === 'pung') && melds.every((m) => m.kind !== 'chi');
    // 每一组的牌种（顺子三张、刻子一种）和将：判断将对、带幺九
    const groupKinds: number[][] = d.groups.map((g) => (g.type === 'seq' ? [g.kind, g.kind + 1, g.kind + 2] : [g.kind]));
    for (const m of melds) groupKinds.push([...new Set(m.tiles.map(kindOf))]);
    if (pungs) {
      const jiang = is258(d.pair) && groupKinds.every((g) => g.every(is258));
      items.push(jiang ? { id: 'jiangdui', fan: 3 } : { id: 'pengpeng', fan: 1 });
    }
    if (has19(d.pair) && groupKinds.every((g) => g.some(has19))) items.push({ id: 'yaojiu', fan: 2 });
    if (melds.length === 4) items.push({ id: 'jingou', fan: 1 });
    if (gen > 0) items.push({ id: 'gen', fan: gen, n: gen });
    candidates.push(items);
  }
  let best: FanItem[] = [];
  let bestFan = -1;
  for (const items of candidates) {
    const all2 = qing ? [{ id: 'qing' as const, fan: 2 }, ...items] : items;
    const full = [...all2, ...situational];
    const fan = full.reduce((a, x) => a + x.fan, 0);
    if (fan > bestFan) {
      bestFan = fan;
      best = full;
    }
  }
  if (bestFan <= 0) {
    best = [{ id: 'ping', fan: 0 }, ...best];
    bestFan = 0;
  }
  return { raw: bestFan, fan: Math.min(bestFan, cap), items: best, capped: bestFan >= cap };
}

/** 一把多少：底分 × 2^番（整数，番最多 5，不用 Math.pow） */
export const unitOf = (base: number, fan: number): number => base * (1 << fan);
