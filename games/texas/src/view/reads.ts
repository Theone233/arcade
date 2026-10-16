/**
 * 看对手（0.2.2，DESIGN.md 13.3）：每个座位这一场打了几手、入池、翻牌前加注、摊牌、赢了几手，点头像看。
 * 只在画面层数，不进规则、不存盘（刷新就从头数）。一手打完时从上一步的操作记录里数：
 * 最后那一下（一般是弃牌或跟注）不在记录里，对入池、加注几乎没影响。
 * 座位换了人（电脑换了性格、好友房换了人）就重新数。
 */
import type { View } from '../core/view.ts';

export interface Read {
  hands: number;
  /** 翻牌前主动放钱进池（跟注、下注、加注，盲注不算） */
  vpip: number;
  /** 翻牌前加注 */
  pfr: number;
  shows: number;
  won: number;
}

export class Reads {
  private readonly by = new Map<string, Read>();

  /** 一手打完（prev 是打完前那一步）：数进去。who(seat) 是座位上是谁，换了人 key 就变 */
  observe(prev: View, next: View, who: (seat: number) => string): void {
    const r = next.lastHand;
    if (!r || r.handNo !== prev.handNo || prev.phase === 'idle') return;
    let preflop = true;
    const vpip = new Set<number>();
    const pfr = new Set<number>();
    for (const e of prev.log) {
      if (e.seat < 0) {
        preflop = false;
        continue;
      }
      if (!preflop) continue;
      if (e.act === 'call' || e.act === 'bet' || e.act === 'raise') vpip.add(e.seat);
      if (e.act === 'bet' || e.act === 'raise') pfr.add(e.seat);
    }
    const winners = new Set(r.pots.flatMap((p) => p.winners.map((w) => w.seat)));
    prev.seats.forEach((s, i) => {
      if (s.status === 'out') return;
      const x = this.of(who(i));
      x.hands++;
      if (vpip.has(i)) x.vpip++;
      if (pfr.has(i)) x.pfr++;
      if (!r.byFold && r.shown.some((sh) => sh.seat === i)) x.shows++;
      if (winners.has(i)) x.won++;
    });
  }

  get(key: string): Read {
    return this.of(key);
  }

  clear(): void {
    this.by.clear();
  }

  private of(key: string): Read {
    let x = this.by.get(key);
    if (!x) this.by.set(key, (x = { hands: 0, vpip: 0, pfr: 0, shows: 0, won: 0 }));
    return x;
  }
}

/** 按这一场的数给个风格标签：手数少时不下结论 */
export function styleTag(r: Read): string {
  if (r.hands < 8) return '还看不出来';
  const vpip = r.vpip / r.hands;
  const aggr = r.vpip ? r.pfr / r.vpip : 0;
  const loose = vpip >= 0.32 ? '松' : vpip <= 0.18 ? '紧' : '不松不紧';
  const style = aggr >= 0.5 ? '凶' : aggr <= 0.25 ? '被动' : '';
  return style ? `${loose === '不松不紧' ? '' : loose}${style}` : loose;
}

const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** 小卡上的几行 */
export function readLines(r: Read): string[] {
  return [
    `这一场 ${r.hands} 手 · 赢 ${r.won} 手`,
    `入池 ${pct(r.vpip, r.hands)} · 翻牌前加注 ${pct(r.pfr, r.hands)}`,
    `摊牌 ${r.shows} 次`,
  ];
}
