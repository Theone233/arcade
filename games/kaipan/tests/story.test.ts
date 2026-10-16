/**
 * 0.4 重做：局末"这段日子"小故事。不出现真实年份、日期、公司名、代码和 id；长度 4–8 句；换种子读起来不一样。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEGMENT_TITLES, chatView, createRun, dispatch, displayTitle, stockById, storyView, themeBoard, topBar, type GameState, type Segment, type SegmentIndex, type TradeLog } from '../src/core/index.ts';
import { BEATS } from '../tools/data/beats.ts';
import { botByName, playRun, useMarket } from '../tools/bots.ts';

const DIR = 'public/data/segments';
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
const segs = index.segments.map((e) => JSON.parse(readFileSync(`${DIR}/${e.file}`, 'utf8')) as Segment);

/** 化名表：年包里的化名和代码、段文件里的化名、剧情稿化名表的化名 / 改写代码 / 真实代码。 */
function aliasTable(): { names: Set<string>; codes: Set<string> } {
  const names = new Set<string>();
  const codes = new Set<string>();
  const ydir = 'public/data/years';
  if (existsSync(ydir)) {
    for (const f of readdirSync(ydir).filter((x) => /^\d{4}\.json$/.test(x))) {
      const pack = JSON.parse(readFileSync(`${ydir}/${f}`, 'utf8')) as { stocks: { name: string | null; code?: string }[] };
      for (const s of pack.stocks) {
        if (s.name) names.add(s.name);
        if (s.code) codes.add(s.code);
      }
    }
  }
  for (const s of segs) for (const t of Object.values(s.themes)) for (const st of t.stocks) if (st.name) names.add(st.name);
  if (existsSync('docs/story-0.4.md')) {
    for (const line of readFileSync('docs/story-0.4.md', 'utf8').split('\n')) {
      const m = /^\| `(s|tmp|x)_[a-z0-9_]+` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/.exec(line);
      if (!m) continue;
      names.add((m[2] as string).trim());
      for (const c of [(m[3] as string).trim(), (m[4] as string).trim()]) for (const w of c.split(/[^A-Z.]+/)) if (w.length >= 2) codes.add(w);
    }
  }
  return { names, codes };
}

const { names: ALIASES, codes: CODES } = aliasTable();
/** 游戏自己的说法（风口名"AI"、"VIP 群"）不算代码 */
const OWN_WORDS = new Set(['AI', 'VIP']);

function leaks(text: string, seg: Segment): string[] {
  const out: string[] = [];
  if (/(19|20)\d\d/.test(text)) out.push('四位年份');
  if (/s_|tmp_|x_|N0/.test(text)) out.push('id');
  if (text.includes(seg.id)) out.push('段 id');
  for (const n of ALIASES) if (text.includes(n)) out.push(`化名 ${n}`);
  for (const w of text.match(/[A-Z][A-Z.]+/g) ?? []) if (!OWN_WORDS.has(w) && CODES.has(w)) out.push(`代码 ${w}`);
  if (/\d+ 月 \d+ 日|\d+月\d+日/.test(text)) out.push('真实日期');
  return out;
}

function trade(stockId: string, ret: number, recBy: string | null): TradeLog {
  return { stockId, buyDay: 0, sellDay: 3, stage: 'rise', feel: 'warm', ret, reason: 'sell', recBy, contra: false, guard: false } as unknown as TradeLog;
}

type Outcome = 'won' | 'lost' | 'idle';

/** 造一局结束的样子：通关（赚有亏、跟群友赚）、爆掉（亏、跟群友亏）、全程不动。 */
function ended(seg: Segment, seed: string, how: Outcome, persona: GameState['persona'] = 'newbie'): GameState {
  const s = createRun(seed, { persona }, { segment: seg }).state;
  const ids = Object.keys(s.stocks);
  const a = ids[seed.length % ids.length] as string;
  const b = ids[(seed.length + 3) % ids.length] as string;
  const st = structuredClone(s);
  st.slots = st.slots.map(() => null);
  if (how === 'won') {
    st.phase = 'won';
    st.month = 12;
    st.stats.trades = [trade(a, 62, 'xiaoli'), trade(b, -18, null), trade(a, 11, 'xiaoli')];
  } else if (how === 'lost') {
    st.phase = 'lost';
    st.endReason = 'bankrupt';
    st.month = 5;
    st.stats.trades = [trade(a, 9, null), trade(b, -41, 'qunzhu'), trade(b, -12, 'qunzhu')];
  } else {
    st.phase = 'lost';
    st.month = 3;
    st.stats.trades = [];
  }
  return st;
}

const SEEDS = ['a', 'bb', 'story-3', 'story-four', 'x9', 'daily-2026-10-12'];
const OUTCOMES: Outcome[] = ['won', 'lost', 'idle'];
const PERSONAS: GameState['persona'][] = ['newbie', 'retiree', 'mom', 'coder', 'youzi'];

describe('这段日子：文案扫描', () => {
  it('化名表读到了（否则扫描没意义）', () => {
    expect(ALIASES.size).toBeGreaterThan(50);
    expect(CODES.size).toBeGreaterThan(50);
  });

  it('所有段 × 种子 × 结局：故事、吐槽、标题里没有年份、日期、化名、代码和 id', () => {
    const bad: string[] = [];
    for (const seg of segs) {
      const title = displayTitle(seg.id, seg.regime, seg.title);
      for (const l of leaks(title, seg)) bad.push(`${seg.id} 标题：${l}`);
      SEEDS.forEach((seed, i) => {
        for (const how of OUTCOMES) {
          const v = storyView(ended(seg, seed, how, PERSONAS[i % PERSONAS.length]));
          expect(v).not.toBeNull();
          const text = [v?.title, ...(v?.lines ?? []), v?.verdict].join('\n');
          for (const l of leaks(text, seg)) bad.push(`${seg.id}/${seed}/${how}：${l}\n${text}`);
          expect(text).not.toMatch(/\{[^}]*\}/);
          // 第一个月不说"到了第一个月"
          expect(text).not.toContain('到了第一个月');
        }
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // 扫遍所有行情段：机器忙时会超过默认的 5 秒
  }, 30_000);

  it('标题表本身干净，生成的段标题都来自标题表', () => {
    for (const list of Object.values(SEGMENT_TITLES)) for (const t of list) expect(t).not.toMatch(/\d|泡沫破裂|次贷|雷曼|科网|海啸/);
    for (const seg of segs) expect(displayTitle(seg.id, seg.regime, seg.title)).toBe(seg.title);
    expect(new Set(segs.map((s) => s.title)).size).toBe(segs.length);
    // 旧数据里的直白标题换成游戏化标题
    expect(displayTitle('2008-03-flat', 'flat', '次贷阴云下的磨叽行情')).not.toContain('次贷');
  });

  it('故事版大事表：没有年份、化名；伤亡和选举类不写', () => {
    for (const [date, defs] of Object.entries(BEATS)) {
      for (const d of defs) {
        for (const t of [d.t, d.alt]) {
          if (!t) continue;
          expect(t, date).not.toMatch(/(19|20)\d\d/);
          for (const n of ALIASES) expect(t.includes(n), `${date} 含化名 ${n}`).toBe(false);
          expect(t, date).not.toMatch(/地震|选举|大选|当选|格林斯潘|奥巴马|麦道夫|巴菲特/);
        }
      }
    }
    expect(BEATS['1999-09-21']?.[0]?.skip).toBe(true);
  });
});

describe('这段日子：长度与多样性', () => {
  it('4–8 句，每句不太长；有结局吐槽', () => {
    for (const seg of segs) {
      for (const how of OUTCOMES) {
        const v = storyView(ended(seg, `len-${seg.id}`, how));
        expect(v?.lines.length, `${seg.id}/${how}`).toBeGreaterThanOrEqual(4);
        expect(v?.lines.length, `${seg.id}/${how}`).toBeLessThanOrEqual(8);
        for (const l of v?.lines ?? []) expect(l.length, l).toBeLessThanOrEqual(80);
        expect(v?.verdict.length).toBeGreaterThan(5);
      }
    }
  });

  it('同一段换种子，故事不一样；同一种子同一个故事', () => {
    for (const seg of segs) {
      const stories = SEEDS.map((sd) => storyView(ended(seg, sd, 'won'))?.lines.join(''));
      expect(new Set(stories).size, seg.id).toBeGreaterThanOrEqual(4);
      expect(storyView(ended(seg, 'same', 'lost'))).toEqual(storyView(ended(seg, 'same', 'lost')));
    }
  });

  it('通关和爆掉讲的不一样；主角用这一局的人设', () => {
    const seg = segs[0] as Segment;
    const w = storyView(ended(seg, 'k', 'won', 'retiree'));
    const l = storyView(ended(seg, 'k', 'lost', 'retiree'));
    expect(w?.lines.join('')).not.toEqual(l?.lines.join(''));
    expect(w?.lines[0]).toContain('退休老周');
    expect(l?.lines.at(-1)).toMatch(/第五个月/);
  });

  it('真机器人玩完的局也能讲（含跟群友）', () => {
    const seg = segs.find((s) => s.regime === 'crash') as Segment;
    useMarket(() => seg);
    try {
      for (const bot of ['normal', 'follower']) {
        const s = playRun(`story-bot-${bot}`, botByName(bot), { difficulty: 1 });
        const v = storyView(s);
        expect(v?.lines.length).toBeGreaterThanOrEqual(4);
        expect(leaks(v?.lines.join('') ?? '', seg)).toEqual([]);
      }
    } finally {
      useMarket(null);
    }
  });

  it('0.4 C 机器人（重仓、押跌、抵押）玩完的局：同一只、同一个数字不讲两遍；百分比前留空格', () => {
    useMarket((seed) => segs[Number(seed.split('-').at(-1)) % segs.length] ?? null);
    try {
      for (let i = 0; i < 12; i++) {
        const bot = ['heavy', 'shorter', 'gambler'][i % 3] as string;
        const s = playRun(`story-ext-${bot}-${i}`, botByName(bot), { difficulty: 1 + (i % 4) });
        const v = storyView(s);
        const lines = v?.lines ?? [];
        expect(lines.length).toBeGreaterThanOrEqual(4);
        // "赚了51%"这类没空格的写法
        for (const l of lines) expect(l).not.toMatch(/[赚亏]了\d/);
        expect(lines.join('')).not.toContain('最后笑到了最后');
        // 同一只股票带同一个百分比出现在两句里（重仓那句和最赚那句重复）
        const names = Object.keys(s.stocks).map((id) => stockById(id).name);
        const seen = new Map<string, number>();
        lines.forEach((l, k) => {
          const pct = [...l.matchAll(/(\d+)%/g)].map((m) => m[1] as string);
          for (const n of names.filter((x) => l.includes(x))) {
            for (const p of pct) {
              const prev = seen.get(`${n}|${p}`);
              if (prev !== undefined && prev !== k) expect(`${lines[prev]} / ${l}`).toBe('同一只、同一个数字不该讲两遍');
              seen.set(`${n}|${p}`, k);
            }
          }
        });
      }
    } finally {
      useMarket(null);
    }
  }, 60_000);

  it('玩的过程中（看板、群聊、顶栏、事件）不出现年份、化名、代码和 id', () => {
    for (const seg of segs.filter((_, i) => i % 5 === 0)) {
      let s = createRun(`play-${seg.id}`, { account: 1e7 }, { segment: seg }).state;
      const bad: string[] = [];
      for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
        const text = JSON.stringify([topBar(s), chatView(s), themeBoard(s)]);
        const a = s.phase === 'reward' ? { type: 'skipReward' as const } : s.phase === 'event' ? { type: 'choose' as const, option: 0 } : { type: 'open' as const };
        const r = dispatch(s, a);
        s = r.state;
        for (const l of leaks(text + JSON.stringify(r.events), seg)) if (l !== '四位年份' || /(19|20)\d\d 年/.test(text)) bad.push(`${seg.id} 第 ${s.dayIndex} 天：${l}`);
      }
      expect(bad.slice(0, 3)).toEqual([]);
    }
  }, 30000);

  it('合成行情没有故事', () => {
    expect(storyView(createRun('x').state)).toBeNull();
  });
});
