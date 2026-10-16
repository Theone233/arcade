/**
 * "上头"（DESIGN.md 4.6，0.3.0）：一手净输到 TILT_LOSS_BB（40）个大盲，接下来 TILT_HANDS（3）手 tilt 依次是 3、2、1，之后字段删掉。
 * 0.3.0 实打后从"25 个大盲、5 手"收到"40 个大盲、3 手"：原来桌上常有电脑一直挂着最高的 5 手，桌子偏乱。
 * 只由规则推出来（同种子同结果，determinism.test 覆盖），视图只给自己的座位。
 */
import { describe, expect, it } from 'vitest';
import { apply, TILT_HANDS, TILT_LOSS_BB, type Table } from '../src/core/table.ts';
import { view } from '../src/core/view.ts';
import { must, play, rig, setup } from './helpers.ts';

const CALL = { t: 'call' } as const;
const CHECK = { t: 'check' } as const;
const FOLD = { t: 'fold' } as const;

/** 两人桌（各 100 个大盲，按钮 0）：0 号加到 to，1 号跟，之后过牌到摊牌，0 号同花顺赢 */
function bigLoss(t0: Table, to: number): Table {
  let t = rig(t0, { 0: 'As Ks', 1: '2c 7d' }, 'Qs Js Ts 3h 4d');
  const first = t.toAct!;
  const other = 1 - first;
  t = play(t, [
    [first, first === 0 ? { t: 'raise', to } : CALL],
    [other, first === 0 ? CALL : { t: 'raise', to }],
  ]);
  if (first === 1) t = play(t, [[1, CALL]]);
  while (t.toAct !== null && t.handNo === t0.handNo) t = must(apply(t, t.toAct, CHECK));
  return t;
}

/** 这一手谁先说话谁弃（输一个盲注，不到上头的线） */
const foldHand = (t: Table): Table => must(apply(t, t.toAct!, FOLD));

describe('上头', () => {
  it('线和手数是 40 个大盲、3 手（0.3.0 实打后从 25、5 收的）', () => {
    expect([TILT_LOSS_BB, TILT_HANDS]).toEqual([40, 3]);
  });

  it(`一手输 ${TILT_LOSS_BB} 个大盲以上：之后 ${TILT_HANDS} 手 tilt 是 3、2、1，再往后字段没了；视图只给自己`, () => {
    let t = setup([2000, 2000], 1);
    expect(t.button).toBe(0);
    t = bigLoss(t, 20 * TILT_LOSS_BB);
    expect(t.handNo).toBe(2);
    expect(t.seats[1]!.tilt).toBe(TILT_HANDS);
    expect('tilt' in t.seats[0]!).toBe(false);
    expect(view(t, 1).tilt).toBe(TILT_HANDS);
    expect(view(t, 0).tilt).toBe(0);
    expect(view(t, null).tilt).toBe(0);
    // 别人的视图里座位信息不带 tilt
    expect(Object.keys(view(t, 0).seats[1]!)).not.toContain('tilt');
    const seen: number[] = [];
    while (t.seats[1]!.tilt !== undefined) {
      seen.push(t.seats[1]!.tilt!);
      t = foldHand(t);
    }
    expect(seen).toEqual([3, 2, 1]);
    expect('tilt' in t.seats[1]!).toBe(false);
    expect(view(t, 1).tilt).toBe(0);
    // 存档直接存 JSON：没有 tilt: 0 这种值
    expect(JSON.stringify(t)).not.toContain('tilt');
  });

  it('输得不到线不上头（输 30 个大盲也不上头，原来 25 就上头）；上头时再输一个大池重新从 3 数', () => {
    let t = setup([8000, 8000], 1);
    t = bigLoss(t, 20 * 30);
    expect('tilt' in t.seats[1]!).toBe(false);
    t = foldHand(t);
    t = bigLoss(t, 20 * (TILT_LOSS_BB - 2));
    expect(t.seats.every((s) => !('tilt' in s))).toBe(true);
    t = foldHand(t);
    t = bigLoss(t, 20 * TILT_LOSS_BB);
    expect(t.seats[1]!.tilt).toBe(TILT_HANDS);
    t = foldHand(t);
    expect(t.seats[1]!.tilt).toBe(TILT_HANDS - 1);
    t = bigLoss(t, 20 * TILT_LOSS_BB);
    expect(t.seats[1]!.tilt).toBe(TILT_HANDS);
  });

  it('旧状态里没有 tilt 字段也照常打（按 0）', () => {
    const t = setup([2000, 2000], 1);
    for (const s of t.seats) expect('tilt' in s).toBe(false);
    expect(view(t, 0).tilt).toBe(0);
  });
});
