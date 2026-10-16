import { describe, expect, it } from 'vitest';
import { createRun, dispatch, type GameState } from '../src/core/index.ts';
import { EXT_TIP_ORDER, loadSeenTips, markTipSeen, nextExtTip, tipApplies } from '../src/view/extTips.ts';
import { parseParams } from '../src/debug/params.ts';

function memStore(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function extRun(seed = 'view-ext-1', setup = {}): GameState {
  return createRun(seed, setup, { ext: true }).state;
}

describe('0.4 C 新机制的第一次提示', () => {
  it('0.3 的局（没有 ext）一条都不出', () => {
    const s = createRun('view-ext-old').state;
    for (const id of EXT_TIP_ORDER) expect(tipApplies(s, id)).toBe(false);
    expect(nextExtTip(s, [])).toBeNull();
  });

  it('第一天先说"买多少"，看过之后不再说', () => {
    const s = extRun();
    const t = nextExtTip(s, []);
    expect(t?.id).toBe('size');
    expect(t?.text).toContain('重仓');
    expect(nextExtTip(s, ['size'])?.id ?? null).not.toBe('size');
  });

  it('看过的提示记在存储里，不重复记', () => {
    const st = memStore();
    expect(loadSeenTips(st)).toEqual([]);
    markTipSeen('size', st);
    markTipSeen('size', st);
    markTipSeen('bank', st);
    expect(loadSeenTips(st)).toEqual(['size', 'bank']);
    st.setItem('kaipan.extTips.v1', '{坏的');
    expect(loadSeenTips(st)).toEqual([]);
  });

  it('买进以后的第二天说"手里的股票"；押跌许可证让"押跌"提示出现', () => {
    let s = extRun('view-ext-2', { items: ['short_permit'] });
    expect(tipApplies(s, 'short')).toBe(true);
    const r = dispatch(s, { type: 'buy', rec: 0, size: 'taste' });
    expect(r.error).toBeNull();
    s = dispatch(r.state, { type: 'open' }).state;
    if (s.phase === 'premarket') expect(tipApplies(s, 'holding')).toBe(true);
  });

  it('提示文案是大白话，不出现禁用词', () => {
    const s = extRun('view-ext-3', { items: ['short_permit'] });
    const seen: string[] = [];
    const texts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = nextExtTip(s, seen as never);
      if (!t) break;
      seen.push(t.id);
      texts.push(t.text);
    }
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).not.toMatch(/保证金|维持|Reg T|margin|融资|融券|做空|杠杆/);
  });
});

describe('URL 参数 ext=1', () => {
  it('缺省按 0.3 玩法开（旧自动化脚本不受影响），ext=1 才打开新玩法', () => {
    expect(parseParams('?seed=a').ext).toBe(false);
    expect(parseParams('?seed=a&ext=1').ext).toBe(true);
  });
});
