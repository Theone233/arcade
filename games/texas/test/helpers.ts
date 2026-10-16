import { expect } from 'vitest';
import { parseCards, type Card } from '../src/core/cards.ts';
import { apply, deal, isFail, newTable, type Action, type Fail, type Table } from '../src/core/table.ts';

export const SEED = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210, 1, 2, 3, 4];

export function must(x: Table | Fail): Table {
  if (isFail(x)) throw new Error(`unexpected error ${x.error}`);
  return x;
}

/** 摆一桌真人（null 是空座），按钮放在 buttonBefore 的下一个能打的座位上，开第一手 */
export function setup(stacks: (number | null)[], buttonBefore: number): Table {
  const t = newTable('small', stacks.length, SEED);
  stacks.forEach((x, i) => {
    if (x === null) return;
    const s = t.seats[i]!;
    s.owner = 'player';
    s.stack = x;
    t.bank += x;
  });
  t.button = buttonBefore;
  return deal(t);
}

/** 换掉这一手的底牌和后面要发的公共牌：holes 按座位给，board 是之后依次发的牌 */
export function rig(t0: Table, holes: Record<number, string>, board: string): Table {
  const t = structuredClone(t0);
  const used = new Set<Card>();
  for (const [seat, h] of Object.entries(holes)) {
    const cs = parseCards(h);
    t.seats[Number(seat)]!.hole = cs;
    cs.forEach((c) => used.add(c));
  }
  const b = parseCards(board);
  b.forEach((c) => used.add(c));
  t.deck = [...b, ...Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c))];
  t.deckPos = 0;
  return t;
}

/** 依次执行 [座位, 操作]，每一步都核对筹码守恒 */
export function play(t0: Table, steps: [number, Action][]): Table {
  let t = t0;
  for (const [seat, a] of steps) {
    expect(t.toAct, `toAct before ${seat} ${a.t}`).toBe(seat);
    t = must(apply(t, seat, a));
    conserve(t);
  }
  return t;
}

/** 桌上的筹码 + 这一手投进去的 = bank */
export function conserve(t: Table): void {
  const onTable = t.seats.reduce((a, s) => a + s.stack + s.total, 0);
  expect(onTable).toBe(t.bank);
}

export const stacks = (t: Table): number[] => t.seats.map((s) => s.stack);
