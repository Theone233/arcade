/**
 * 电脑的互动（DESIGN.md 6.2）：单机和好友房同一份。
 * - 只看公开的视图（每辆车的位置、名次、公开的统计），不读隐藏的牌，也不读任何真人发的短语来决定怎么开车；
 *   电脑开车（src/ai）和规则（src/core）不 import 这里（test/arch.test.ts）。
 * - 主动说：对比前后两次公开快照，认出"谁打滑了、谁吸了谁的尾流、谁超了谁、谁冲线了、谁熄火了、谁一口气付了好多热量"，
 *   按性格（话多少、什么脾气）挑一句短语、一个表情，或者冲人扔个道具；
 * - 回应：真人冲某个电脑扔道具、点名说话，被冲着的电脑按脾气回（对大家说的话不回）；
 * - 单机里真人想太久，最急的电脑催一下（好友房有倒计时，电脑不催）。
 * "随机"是按种子哈希算的，可以复现；同一个电脑几秒内只说一次（Banter 类按调用方给的时间管冷却）。
 */
import type { CarView } from '../core/view.ts';
import { PHRASE, PHRASE_COUNT, prop, sticker } from './emotes.ts';

export interface Talk {
  seat: number;
  id: number;
  to?: number;
}

type Style = 'cheeky' | 'meek' | 'calm' | 'proud';

/** 每个性格的脾气（下标和 ai/personas.ts 的 PERSONAS 一致）：话多少（0–1），被惹了怎么回 */
export const TEMPER: readonly { talk: number; style: Style }[] = [
  { talk: 0.55, style: 'meek' }, // 嘟嘟
  { talk: 0.3, style: 'meek' }, // 慢半拍
  { talk: 0.85, style: 'cheeky' }, // 冲冲
  { talk: 0.65, style: 'cheeky' }, // 跟屁虫
  { talk: 0.4, style: 'calm' }, // 刹车王
  { talk: 0.55, style: 'proud' }, // 弯道王
  { talk: 0.3, style: 'calm' }, // 精算师
];
/** 离座交给电脑的真人座位、认不出性格的：话少、稳 */
const DEFAULT_TEMPER = { talk: 0.25, style: 'calm' as Style };

export function temperOf(persona: number): { talk: number; style: Style } {
  return TEMPER[persona] ?? DEFAULT_TEMPER;
}

/** 一次公开快照：只取视图里谁都看得到的 */
export interface Snap {
  pos: number;
  rank: number | null;
  spins: number;
  slips: number;
  stalls: number;
  heat: number;
  persona: number;
}

export function snapOf(cars: readonly CarView[]): Snap[] {
  return cars.map((c) => ({ pos: c.pos, rank: c.rank, spins: c.stats.spins, slips: c.stats.slips, stalls: c.stats.stalls, heat: c.stats.heat, persona: c.persona }));
}

export type Fact =
  | { k: 'spin'; seat: number }
  | { k: 'slip'; seat: number; target: number | null }
  | { k: 'pass'; seat: number; target: number }
  | { k: 'finish'; seat: number; rank: number }
  | { k: 'stall'; seat: number }
  | { k: 'burn'; seat: number };

/** 前后两次快照之间发生的公开的事 */
export function factsOf(prev: readonly Snap[] | null, cur: readonly Snap[]): Fact[] {
  if (!prev || prev.length !== cur.length) return [];
  const out: Fact[] = [];
  cur.forEach((c, seat) => {
    const p = prev[seat]!;
    if (c.rank !== null && p.rank === null) out.push({ k: 'finish', seat, rank: c.rank });
    if (c.spins > p.spins) out.push({ k: 'spin', seat });
    else if (c.heat - p.heat >= 3) out.push({ k: 'burn', seat });
    if (c.stalls > p.stalls) out.push({ k: 'stall', seat });
    if (c.slips > p.slips) {
      // 吸的是现在就在前面一两格里的那辆
      let target: number | null = null;
      cur.forEach((d, j) => {
        if (j !== seat && d.rank === null && d.pos >= c.pos && d.pos - c.pos <= 2 && (target === null || d.pos < cur[target]!.pos)) target = j;
      });
      out.push({ k: 'slip', seat, target });
    }
    if (c.rank === null && p.rank === null) {
      // 超车：原来在后面、现在在前面，挑离得最近的那一辆
      let target: number | null = null;
      cur.forEach((d, j) => {
        const q = prev[j]!;
        if (j === seat || d.rank !== null || q.rank !== null) return;
        if (q.pos > p.pos && d.pos < c.pos && (target === null || d.pos > cur[target]!.pos)) target = j;
      });
      if (target !== null) out.push({ k: 'pass', seat, target });
    }
  });
  return out;
}

/** 0–1 之间确定的数：同样的种子、同样的东西，每次一样 */
export function chance(salt: number, ...xs: number[]): number {
  let h = salt | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x5bd1e995);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

/**
 * 主动说：每件事最多一个电脑接话，一步最多两句。isBot 判断座位现在是不是电脑在开（真人座位不替他说）。
 * salt 用这一步的步数之类，同一步同样的结果
 */
export function react(facts: readonly Fact[], cur: readonly Snap[], isBot: (seat: number) => boolean, salt: number): Talk[] {
  const out: Talk[] = [];
  const used = new Set<number>();
  const say = (seat: number, roll: number, t: Omit<Talk, 'seat'>): boolean => {
    if (out.length >= 2 || used.has(seat) || !isBot(seat)) return false;
    if (chance(salt, seat, roll) >= temperOf(cur[seat]?.persona ?? -1).talk) return false;
    out.push({ seat, ...t });
    used.add(seat);
    return true;
  };
  facts.forEach((f, i) => {
    const me = f.seat;
    const style = temperOf(cur[me]?.persona ?? -1).style;
    switch (f.k) {
      case 'spin': {
        const own = { meek: { id: sticker('cry') }, calm: { id: sticker('sweat') }, cheeky: { id: PHRASE.noBrakes }, proud: { id: sticker('shock') } }[style];
        if (say(me, i, own)) break;
        // 别人打滑：脾气冲的偷笑
        for (let j = 0; j < cur.length; j++) if (j !== me && temperOf(cur[j]!.persona).style === 'cheeky' && say(j, i + 100, { id: sticker('sly'), to: me })) break;
        break;
      }
      case 'slip':
        if (f.target === null) break;
        if (style !== 'meek' && say(me, i, { id: PHRASE.slipped, to: f.target })) break;
        if (temperOf(cur[f.target]?.persona ?? -1).style !== 'meek') say(f.target, i + 100, { id: PHRASE.getOffMyTail, to: me });
        break;
      case 'pass': {
        const mine = style === 'cheeky' ? { id: PHRASE.makeWay, to: f.target } : style === 'proud' ? { id: sticker('smug') } : null;
        if (mine && say(me, i, mine)) break;
        const theirs = temperOf(cur[f.target]?.persona ?? -1).style;
        if (theirs === 'proud') say(f.target, i + 100, { id: PHRASE.nextCorner, to: me });
        else if (theirs === 'meek') say(f.target, i + 100, { id: sticker('shock') });
        break;
      }
      case 'finish':
        if (f.rank === 0) {
          const won = { proud: { id: sticker('cool') }, cheeky: { id: PHRASE.thanks }, calm: { id: PHRASE.steady }, meek: { id: sticker('lol') } }[style];
          if (say(me, i, won)) break;
          for (let j = 0; j < cur.length; j++) if (j !== me && cur[j]!.rank === null && say(j, i + 100, { id: sticker('clap'), to: me })) break;
        } else say(me, i, { id: PHRASE.nextLap });
        break;
      case 'stall':
        say(me, i, { id: sticker('sleep') });
        break;
      case 'burn':
        if (style === 'calm' || style === 'meek') say(me, i, { id: PHRASE.outOfHeat });
        break;
    }
  });
  return out;
}

const HOSTILE_PROPS = new Set([prop('tomato'), prop('egg'), prop('stinkyEgg'), prop('slipper'), prop('bomb')]);
const HOSTILE = new Set<number>([PHRASE.makeWay, PHRASE.getOffMyTail, PHRASE.nextCorner, PHRASE.hurry, sticker('sly'), sticker('doge'), sticker('angry'), sticker('smug'), ...HOSTILE_PROPS]);
const FRIENDLY = new Set<number>([PHRASE.niceDrive, PHRASE.thanks, PHRASE.again, PHRASE.nextLap, PHRASE.weCanWin, sticker('love'), sticker('clap'), prop('rose'), prop('like'), prop('cheers')]);

/**
 * 回应：真人冲电脑 bot 发了 id（from 是他的座位）。只回冲着自己来的；对大家说的不回。
 * 不合脾气、没轮到就不回（返回 null）。和主动说一样，不读、不记真人说了什么去影响开车
 */
export function reply(bot: number, persona: number, from: number, id: number, salt: number): Talk | null {
  const t = temperOf(persona);
  // 被冲着的电脑比主动说更愿意接话
  if (chance(salt, bot, from, id) >= 0.5 + t.talk / 2) return null;
  if (HOSTILE.has(id)) {
    if (t.style === 'cheeky') return HOSTILE_PROPS.has(id) ? { seat: bot, id: prop('tomato'), to: from } : { seat: bot, id: PHRASE.nextCorner, to: from };
    if (t.style === 'proud') return { seat: bot, id: sticker('doge'), to: from };
    if (t.style === 'calm') return { seat: bot, id: sticker('sweat') };
    return { seat: bot, id: sticker('cry') };
  }
  if (FRIENDLY.has(id)) {
    if (t.style === 'proud') return { seat: bot, id: sticker('cool') };
    if (t.style === 'cheeky') return { seat: bot, id: prop('cheers'), to: from };
    return { seat: bot, id: sticker('love'), to: from };
  }
  // 别的短语点名了它：话多的回一句"跟紧我"，其余笑一下
  if (id < PHRASE_COUNT) return t.talk >= 0.6 ? { seat: bot, id: PHRASE.followMe, to: from } : { seat: bot, id: sticker('lol') };
  return null;
}

/** 单机里真人想太久：话最多的电脑催一下（冲着真人） */
export function urge(cur: readonly Snap[], human: number): Talk | null {
  let best: number | null = null;
  cur.forEach((c, seat) => {
    if (seat === human || c.rank !== null) return;
    if (best === null || temperOf(c.persona).talk > temperOf(cur[best]!.persona).talk) best = seat;
  });
  return best === null ? null : { seat: best, id: PHRASE.hurry, to: human };
}

/** 冷却：同一个电脑 coolMs 内只说一次（时间由调用方给：房间用服务器的时钟，单机用页面的） */
export class Banter {
  private readonly last = new Map<number, number>();
  private readonly coolMs: number;

  constructor(coolMs = 6_000) {
    this.coolMs = coolMs;
  }

  pass(t: Talk, now: number): boolean {
    const at = this.last.get(t.seat);
    if (at !== undefined && now - at < this.coolMs) return false;
    this.last.set(t.seat, now);
    return true;
  }
}

