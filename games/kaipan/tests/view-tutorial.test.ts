import { describe, expect, it } from 'vitest';
import { createRun, dispatch, type GameState } from '../src/core/index.ts';
import type { KeyValueStore } from '../src/platform/settings.ts';
import {
  TUTORIAL_KEY,
  TUTORIAL_ORDER,
  eligibleSteps,
  freshTutorial,
  loadTutorial,
  markStep,
  setTutorialOn,
  tutorialActive,
  tutorialCard,
  TUTORIAL_LINE_MAX,
  type TutorialProgress,
} from '../src/view/tutorial.ts';

function memStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const steps = (s: GameState, p: TutorialProgress): string[] => eligibleSteps(s, p).map((h) => h.step);
const with_ = (done: string[]): TutorialProgress => ({ v: 1, off: false, done: done as TutorialProgress['done'] });

describe('分步教程', () => {
  const setup = { themes: ['ai', 'newenergy', 'consumer', 'pharma', 'lowalt', 'pig'] as const };

  it('第 1 天盘前：先讲目标，再讲群聊和推荐；买过之后才讲开盘', () => {
    const s = createRun('tut-1', { themes: [...setup.themes] }).state;
    expect(steps(s, freshTutorial()).slice(0, 3)).toEqual(['goal', 'chat', 'rec']);
    expect(steps(s, freshTutorial())).not.toContain('open');
    expect(steps(s, with_(['goal', 'chat', 'rec']))).toEqual(['open']);
    // 第 1 天还没有第 2 天的内容
    expect(steps(s, freshTutorial())).not.toContain('heat');
  });

  it('第 2 天讲题材热度；有能卖的持仓时讲 T+1 与卖出', () => {
    let s = createRun('tut-2', { themes: [...setup.themes] }).state;
    s = dispatch(s, { type: 'buy', rec: 0 }).state;
    // 当天买入的不能卖
    expect(steps(s, with_(['chat', 'rec', 'open']))).not.toContain('sell');
    s = dispatch(s, { type: 'open' }).state;
    const got = eligibleSteps(s, with_(['chat', 'rec', 'open']));
    expect(got.map((h) => h.step)).toContain('heat');
    const sell = got.find((h) => h.step === 'sell');
    expect(sell?.stockId).toBe(s.slots.find((h) => h)?.stockId);
  });

  it('月底三选一时讲月供与奖励', () => {
    let s = createRun('tut-3', { themes: [...setup.themes], holdings: ['ai_leader', 'con_blue'] }).state;
    while (s.phase === 'premarket') s = dispatch(s, { type: 'open' }).state;
    if (s.phase !== 'reward') return; // 极少数种子会爆仓
    expect(steps(s, freshTutorial())).toEqual(['bill']);
  });

  it('连锁、连板只在持仓里发生过时出现', () => {
    let s = createRun('tut-4', { themes: [...setup.themes] }).state;
    s = dispatch(s, { type: 'open' }).state;
    // 空仓：不会讲连锁和连板
    const p = with_(['chat', 'rec', 'open', 'heat']);
    expect(steps(s, p)).not.toContain('chain');
    expect(steps(s, p)).not.toContain('boards');
  });

  it('关掉或全部看完后不再出现', () => {
    const s = createRun('tut-5', { themes: [...setup.themes] }).state;
    expect(eligibleSteps(s, { v: 1, off: true, done: [] })).toEqual([]);
    expect(tutorialActive({ v: 1, off: false, done: [...TUTORIAL_ORDER] })).toBe(false);
    expect(tutorialActive(freshTutorial())).toBe(true);
  });

  it('进度存取：损坏回退、标记、开关', () => {
    const st = memStore();
    st.setItem(TUTORIAL_KEY, '{oops');
    expect(loadTutorial(st)).toEqual(freshTutorial());
    st.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, done: ['chat', 'nope', 'chat'] }));
    expect(loadTutorial(st).done).toEqual(['chat']);
    markStep('rec', st);
    expect(loadTutorial(st).done).toEqual(['chat', 'rec']);
    setTutorialOn(false, st);
    expect(loadTutorial(st).off).toBe(true);
    setTutorialOn(true, st);
    expect(loadTutorial(st)).toEqual({ ...freshTutorial(), reset: 1 });
    // 重开的次数跟着标记、关闭走，再开一次加一
    markStep('goal', st);
    setTutorialOn(false, st);
    expect(loadTutorial(st)).toEqual({ v: 1, off: true, done: ['goal'], reset: 1 });
    setTutorialOn(true, st);
    expect(loadTutorial(st).reset).toBe(2);
    st.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, done: [], reset: -3 }));
    expect(loadTutorial(st)).toEqual(freshTutorial());
  });

  it('教程卡：每步一句话不超过 15 字，配图标签', () => {
    let s = createRun('tut-card', { themes: [...setup.themes] }).state;
    s = dispatch(s, { type: 'buy', rec: 0 }).state;
    const states = [s];
    for (let i = 0; i < 6 && s.phase === 'premarket'; i++) {
      s = dispatch(s, { type: 'open' }).state;
      states.push(s);
    }
    const held = s.slots.find((x) => x)?.stockId ?? null;
    for (const st of states) {
      for (const step of TUTORIAL_ORDER) {
        for (const scheme of ['cn', 'intl'] as const) {
          const c = tutorialCard(step, st, held, scheme);
          expect([...c.line].length, `${step}: ${c.line}`).toBeLessThanOrEqual(TUTORIAL_LINE_MAX);
          expect(c.chips.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
