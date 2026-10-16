import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDailyFormat } from '../src/daily';

// 每个用例用不同的游戏 id：src/gamefile.ts 一个页面里同一个文件只读一次
function serve(body: unknown, status = 200) {
  vi.stubGlobal('fetch', async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

describe('每日榜分数的写法（游戏的 daily.json）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('从上往下取第一条能用的，{n} 是减去 from 后按千分位写', async () => {
    serve({ note: '每天一样的行情', score: [{ from: 1e11, text: '通关 · {n} 元' }, { text: '撑了 {n} 个月' }] });
    const f = await loadDailyFormat('a');
    expect([f.score(1e11 + 3_820_000), f.score(1e11), f.score(7), f.note]).toEqual(['通关 · 3,820,000 元', '通关 · 0 元', '撑了 7 个月', '每天一样的行情']);
  });

  it('读不到、不是对象、规则不合格、没有一条能用：直接按千分位写，不显示说明', async () => {
    serve('not found', 404);
    expect((await loadDailyFormat('b')).score(12_345)).toBe('12,345');
    serve('[1, 2]');
    expect((await loadDailyFormat('c')).note).toBeNull();
    serve({ note: 3, score: [{ text: '没有占位' }, { from: 'x', text: '{n}' }, { from: 100, text: '{n} 分' }] });
    const f = await loadDailyFormat('d');
    expect([f.score(150), f.score(99), f.note]).toEqual(['50 分', '99', null]);
  });
});
