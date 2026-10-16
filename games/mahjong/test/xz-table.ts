/** 川麻的测试局面（xuezhan.test、room.test 共用）：四家的手牌、牌墙随便摆 */
import { newWall } from '../src/core/table/index.ts';
import { kindOf, tileOf, type Tile } from '../src/core/tiles/index.ts';
import { sichuanXuezhan as XZ, type XzAction, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { kinds } from './helpers.ts';

/**
 * 摆一个局面：四家的手牌（字符串写法）、牌墙接下来的牌；都定好缺、从 turn 那家开始（他手里要 14 张）。
 * 同种牌按出现顺序依次用第 0–3 张，所以四家加牌墙里同一种牌最多写 4 张。
 */
export function table(hands: string[], que: number[], turn: number, wall = '123456789m123456789p123456789s', opts = XZ.defaults): XzState {
  const used = new Map<number, number>();
  const take = (s: string): Tile[] =>
    kinds(s).map((k) => {
      const n = used.get(k) ?? 0;
      if (n >= 4) throw new Error(`too many ${k}`);
      used.set(k, n + 1);
      return tileOf(k, n);
    });
  const s = XZ.begin([1, 1, 1, 1, 1, 1, 1, 1], opts, ['human', 'human', 'human', 'human'], { share: 2_000, base: 10, personas: [0, 1, 2, 3] }) as XzState;
  s.players = hands.map((h, i) => ({ hand: take(h).sort((a, b) => a - b), melds: [], river: [], que: que[i] as 0 | 1 | 2, swapOut: null, swapIn: null, won: null, draws: 1 }));
  const w = take(wall);
  s.wall = newWall(w, 0);
  s.phase = 'turn';
  s.turn = turn;
  s.dealer = turn;
  s.drawn = s.players[turn]!.hand[0]!;
  s.canZimo = true;
  s.discards = 4;
  s.noCalls = false;
  s.events = [];
  return s;
}

export function act(s: XzState, seat: number, a: XzAction): XzState {
  const r = XZ.apply(s, seat, a);
  if ('error' in r) throw new Error(r.error);
  return r;
}

export const tileIn = (s: XzState, seat: number, k: string): Tile => s.players[seat]!.hand.find((t) => kindOf(t) === kinds(k)[0])!;

/** 0 号打 5p：1 号（46p 嵌张）、2 号（67p）都能胡，3 号没有选择 */
export const RON = () => table(['111s222s333s44s5p7p8p', '123m456m789m11p46p', '123m456m789m11p67p', '9m'], [0, 2, 2, 2], 0, '9s9s9s');

