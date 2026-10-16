import { describe, expect, it } from 'vitest';
import {
  CHAIN_MAX_STEP,
  CROSSFADE,
  LEVEL_RAMP,
  RAPID_INTERVAL,
  REVEAL_RANGE,
  Rng,
  SCALES,
  SETTLE_BIG,
  SETTLE_FLAT,
  Throttle,
  buildChord,
  busLevels,
  chainPitch,
  chatPitch,
  countUpPitch,
  cueKey,
  cueProfile,
  dbToGain,
  dueSteps,
  gainToDb,
  heatMix,
  heatTier,
  mergeDuck,
  midiToFreq,
  pickDifferent,
  pickVictim,
  revealPitch,
  revealTier,
  scaleNote,
  settleTier,
  shouldSchedule,
  signTier,
  stepDuration,
  voiceLead,
  volumeToGain,
} from '../src/view/audio/logic.ts';
import { MOODS } from '../src/view/audio/music.ts';
import { allCueVariants } from '../src/view/audio/sfx.ts';
import type { Cue, Mood } from '../src/view/audio/types.ts';

describe('音频：基础换算与增益映射', () => {
  it('MIDI 与频率', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(62)).toBeCloseTo(293.66, 1);
  });

  it('dB 与线性增益互逆', () => {
    for (const db of [-60, -12, -6, -1, 0, 3]) expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 9);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('音量滑条按平方律映射，越界与非法值被夹住', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });

  it('总线增益：静音时 master 为 0，听感增益 = master × 分项', () => {
    const s = { masterVolume: 0.8, sfxVolume: 0.5, musicVolume: 1, muted: false };
    const l = busLevels(s);
    expect(l.master * l.sfx).toBeCloseTo(0.64 * 0.25, 9);
    expect(l.master * l.music).toBeCloseTo(0.64, 9);
    expect(busLevels({ ...s, muted: true }).master).toBe(0);
  });

  it('改设置的斜坡不短于 30 ms', () => {
    expect(LEVEL_RAMP).toBeGreaterThanOrEqual(0.03);
  });
});

describe('音频：音阶与和弦', () => {
  it('音阶级数可跨八度与取负', () => {
    expect(scaleNote(62, SCALES.major, 0)).toBe(62);
    expect(scaleNote(62, SCALES.major, 2)).toBe(66);
    expect(scaleNote(62, SCALES.major, 7)).toBe(74);
    expect(scaleNote(62, SCALES.major, -1)).toBe(61);
    expect(scaleNote(62, SCALES.minor, 9)).toBe(77);
  });

  it('三度叠置构造和弦', () => {
    expect(buildChord(62, SCALES.major, 0)).toEqual([62, 66, 69]); // D
    expect(buildChord(62, SCALES.major, 4, 4)).toEqual([69, 73, 76, 79]); // A7
    expect(buildChord(62, SCALES.minor, 0)).toEqual([62, 65, 69]); // Dm
    expect(buildChord(62, SCALES.phrygian, 1)).toEqual([63, 67, 70]); // E♭
  });

  it('声部进行：保持音级集合、落在音域内、移动量小', () => {
    const c1 = voiceLead(null, buildChord(50, SCALES.major, 0), 50, 69);
    const c2 = voiceLead(c1, buildChord(50, SCALES.major, 5), 50, 69);
    const pcs = (v: number[]): number[] => v.map((m) => m % 12).sort((a, b) => a - b);
    expect(pcs(c2)).toEqual(pcs(buildChord(50, SCALES.major, 5)));
    for (const m of [...c1, ...c2]) {
      expect(m).toBeGreaterThanOrEqual(50);
      expect(m).toBeLessThanOrEqual(69);
    }
    // D → Bm 共同音两个，最佳转位总移动不超过 2 个半音
    const moved = c2.reduce((s, m) => s + Math.min(...c1.map((p) => Math.abs(m - p))), 0);
    expect(moved).toBeLessThanOrEqual(2);
  });

  it('pickDifferent 不连续重复', () => {
    const rng = new Rng(3);
    let prev = 0;
    for (let i = 0; i < 200; i++) {
      const k = pickDifferent(5, prev, rng);
      expect(k).not.toBe(prev);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(5);
      prev = k;
    }
    expect(pickDifferent(1, 0, rng)).toBe(0);
  });

  it('随机数可复现', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});

describe('音频：前瞻调度', () => {
  it('步长', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125, 9);
    expect(stepDuration(60, 2)).toBeCloseTo(0.5, 9);
  });

  it('只排窗口内的步，且时间连续', () => {
    const d = stepDuration(120);
    const r = dueSteps(0, 1, 1, 0.12, d);
    expect(r.steps.map((s) => s.index)).toEqual([0]);
    const r2 = dueSteps(r.nextIndex, r.nextTime, 1.1, 0.12, d);
    expect(r2.steps.map((s) => s.index)).toEqual([1]);
    expect(r2.steps[0]?.time).toBeCloseTo(1.125, 9);
    // 下一次心跳窗口内没有新步
    expect(dueSteps(r2.nextIndex, r2.nextTime, 1.13, 0.12, d).steps).toEqual([]);
  });

  it('长窗口一次排多步', () => {
    const r = dueSteps(10, 2, 2, 1, 0.25);
    expect(r.steps.map((s) => s.index)).toEqual([10, 11, 12, 13]);
    expect(r.nextIndex).toBe(14);
    expect(r.nextTime).toBeCloseTo(3, 9);
  });

  it('计时器严重迟到时跳过过去的步，不一次挤出一堆音符', () => {
    const r = dueSteps(0, 0, 5, 0.12, 0.125);
    expect(r.steps.length).toBeLessThanOrEqual(2);
    for (const s of r.steps) expect(s.time).toBeGreaterThanOrEqual(5);
  });

  it('只在已解锁、未暂停、非 silent 时调度', () => {
    expect(shouldSchedule(true, false, 'bull')).toBe(true);
    expect(shouldSchedule(false, false, 'bull')).toBe(false);
    expect(shouldSchedule(true, true, 'bull')).toBe(false);
    expect(shouldSchedule(true, false, 'silent')).toBe(false);
  });
});

describe('音频：节流', () => {
  it('Throttle 最小间隔', () => {
    const t = new Throttle(0.05);
    expect(t.allow(0)).toBe(true);
    expect(t.allow(0.04)).toBe(false);
    expect(t.allow(0.05)).toBe(true);
    t.reset();
    expect(t.allow(0.06)).toBe(true);
  });

  it('连发型 cue：滚动合并到 ≥ 30 ms，其余只合并同帧（≤ 20 ms）', () => {
    expect(RAPID_INTERVAL.countUp).toBeGreaterThanOrEqual(0.03);
    for (const k of ['chat', 'reveal', 'chain', 'item'] as const) expect(RAPID_INTERVAL[k], k).toBeLessThanOrEqual(0.02);
    // 大事件绝不被节流
    for (const k of ['limitUp', 'stamp', 'settle', 'runWon', 'marketOpen'] as const) expect(RAPID_INTERVAL[k], k).toBeUndefined();
    // 同一时刻 200 次滚动只放行 1 次；按 40 ms/跳则每跳都放行
    const g = new Throttle(RAPID_INTERVAL.countUp ?? 0.03);
    let n = 0;
    for (let i = 0; i < 200; i++) if (g.allow(1)) n++;
    expect(n).toBe(1);
    const g2 = new Throttle(RAPID_INTERVAL.countUp ?? 0.03);
    let m = 0;
    for (let i = 0; i < 25; i++) if (g2.allow(i * 0.04)) m++;
    expect(m).toBe(25);
  });
});

describe('音频：音效参数', () => {
  it('群聊音高：A5 起在五声音阶上小幅起伏，有界、非法值按第 0 条', () => {
    const ps = Array.from({ length: 30 }, (_, i) => chatPitch(i));
    expect(Math.min(...ps)).toBe(81);
    expect(Math.max(...ps)).toBeLessThanOrEqual(88);
    expect(new Set(ps.slice(0, 6)).size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < 30; i++) expect(ps[i]).not.toBe(ps[i - 1]);
    expect(chatPitch(Number.NaN)).toBe(chatPitch(0));
    expect(chatPitch(-3)).toBe(chatPitch(0));
  });

  it('揭晓音高涨高跌低、单调不减、有界、超出满量程夹住', () => {
    let prev = -Infinity;
    for (let m = -15; m <= 15; m += 0.25) {
      const p = revealPitch(m);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(revealPitch(0)).toBe(74);
    expect(revealPitch(3)).toBeGreaterThan(revealPitch(0));
    expect(revealPitch(-3)).toBeLessThan(revealPitch(0));
    expect(revealPitch(REVEAL_RANGE)).toBe(revealPitch(99));
    expect(revealPitch(-REVEAL_RANGE)).toBe(revealPitch(-99));
    expect(revealPitch(REVEAL_RANGE) - revealPitch(-REVEAL_RANGE)).toBeLessThanOrEqual(36);
    expect(revealPitch(-99)).toBeGreaterThanOrEqual(55);
    expect(revealPitch(99)).toBeLessThanOrEqual(91);
    expect(revealPitch(Number.NaN)).toBe(74);
    // 五声音阶：音级只落在 D E F♯ A B
    for (let m = -10; m <= 10; m++) expect([2, 4, 6, 9, 11]).toContain(revealPitch(m) % 12);
  });

  it('揭晓分档：涨停/跌停优先，其余按涨跌（平盘阈值 0.5）', () => {
    expect(revealTier(3, 'up')).toBe('limitUp');
    expect(revealTier(-3, 'down')).toBe('limitDown');
    expect(revealTier(2, null)).toBe('up');
    expect(revealTier(-2, null)).toBe('down');
    expect(revealTier(0.2, null)).toBe('flat');
    expect(revealTier(Number.NaN, null)).toBe('flat');
  });

  it('连线音高逐条上行、有界、非法值按第 0 条', () => {
    for (let i = 1; i <= CHAIN_MAX_STEP; i++) expect(chainPitch(i)).toBeGreaterThan(chainPitch(i - 1));
    expect(chainPitch(CHAIN_MAX_STEP + 5)).toBe(chainPitch(CHAIN_MAX_STEP));
    expect(chainPitch(-1)).toBe(chainPitch(0));
    expect(chainPitch(Number.NaN)).toBe(chainPitch(0));
    expect(chainPitch(CHAIN_MAX_STEP)).toBeLessThanOrEqual(96);
  });

  it('账户滚动音高随进度单调上行、有界', () => {
    let prev = -Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const m = countUpPitch(p);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    expect(countUpPitch(1)).toBeGreaterThan(countUpPitch(0));
    expect(countUpPitch(5)).toBe(countUpPitch(1));
    expect(countUpPitch(-1)).toBe(countUpPitch(0));
    expect(countUpPitch(Number.NaN)).toBe(countUpPitch(0));
  });

  it('热度混合：份额和为 1、力度有界；分档按升/降', () => {
    const a = heatMix(3, 1, 15);
    expect(a.warm + a.cool).toBeCloseTo(1, 9);
    expect(a.warm).toBeGreaterThan(a.cool);
    expect(heatMix(0, 4, 30).cool).toBe(1);
    expect(heatMix(0, 4, 30).intensity).toBe(1);
    expect(heatMix(1, 0, 0).intensity).toBeGreaterThanOrEqual(0.3);
    expect(heatMix(0, 0, 5)).toMatchObject({ warm: 0, cool: 0 });
    expect(heatMix(Number.NaN, 2, Number.NaN)).toMatchObject({ warm: 0, cool: 1 });
    expect(heatMix(2, 0, 5).intensity).toBeLessThan(heatMix(2, 0, 15).intensity);
    expect(heatTier(2, 0)).toBe('up');
    expect(heatTier(0, 2)).toBe('down');
    expect(heatTier(2, 2)).toBe('mixed');
    expect(heatTier(0, 0)).toBe('none');
  });

  it('账户收益分档：按 ret（百分点）', () => {
    expect(settleTier(0)).toBe('flat');
    expect(settleTier(SETTLE_FLAT - 0.01)).toBe('flat');
    expect(settleTier(-(SETTLE_FLAT - 0.01))).toBe('flat');
    expect(settleTier(SETTLE_FLAT)).toBe('win');
    expect(settleTier(-SETTLE_FLAT)).toBe('loss');
    expect(settleTier(SETTLE_BIG - 0.1)).toBe('win');
    expect(settleTier(SETTLE_BIG)).toBe('bigWin');
    expect(settleTier(-SETTLE_BIG)).toBe('bigLoss');
    expect(settleTier(Number.NaN)).toBe('flat');
    expect(settleTier(Infinity)).toBe('flat');
    expect(signTier(5)).toBe('gain');
    expect(signTier(-5)).toBe('loss');
    expect(signTier(0)).toBe('none');
    expect(signTier(Number.NaN)).toBe('none');
  });

  it('响度层级与闪避：滚动 < UI < 事件 < 大事件；大事件闪避 4–6 dB', () => {
    const micro = cueProfile({ type: 'countUp', progress: 0.5 });
    const ui = cueProfile({ type: 'ui', name: 'click' });
    const ev = cueProfile({ type: 'reveal', move: 2, limit: null, index: 0 });
    expect(micro.priority).toBeLessThan(ui.priority);
    expect(ui.priority).toBeLessThan(ev.priority);
    const bigs: Cue[] = [
      { type: 'settle', ret: 5 },
      { type: 'settle', ret: -5 },
      { type: 'limitUp' },
      { type: 'stamp', paid: true, credit: false },
      { type: 'stamp', paid: false, credit: true },
      { type: 'runWon' },
      { type: 'runLost' },
    ];
    for (const c of bigs) {
      const p = cueProfile(c);
      expect(p.category, c.type).toBe('big');
      expect(p.priority).toBeGreaterThan(ev.priority);
      expect(-p.duckDb).toBeGreaterThanOrEqual(4);
      expect(-p.duckDb).toBeLessThanOrEqual(6);
      expect(p.duckHold).toBeGreaterThan(0);
    }
    // 中等事件可以轻闪避（≤ 3 dB）
    for (const c of [{ type: 'limitDown' }, { type: 'weather', to: 'bear' }, { type: 'monthStart' }] as Cue[]) {
      const p = cueProfile(c);
      expect(p.category, c.type).toBe('event');
      expect(-p.duckDb).toBeGreaterThan(0);
      expect(-p.duckDb).toBeLessThanOrEqual(3);
    }
    // 轻量、高频的 cue 不闪避音乐
    const light: Cue[] = [
      { type: 'chat', index: 0 },
      { type: 'guide' },
      { type: 'buy' },
      { type: 'sell' },
      { type: 'countUp', progress: 0.5 },
      { type: 'reveal', move: 10, limit: 'up', index: 0 },
      { type: 'reveal', move: -10, limit: 'down', index: 0 },
      { type: 'chain', index: 3 },
      { type: 'item', id: 'longtou', delta: 2 },
      { type: 'heat', up: 3, down: 2, max: 20 },
      { type: 'settle', ret: 1 },
      { type: 'settle', ret: 0 },
      { type: 'settle', ret: -1 },
      { type: 'judge', hit: true },
      { type: 'weather', to: 'bull' },
      { type: 'thunder' },
    ];
    for (const c of light) {
      const p = cueProfile(c);
      expect(p.duckDb, c.type).toBe(0);
      expect(['micro', 'ui', 'event']).toContain(p.category);
    }
    for (const c of [{ type: 'chat', index: 2 }, { type: 'guide' }] as Cue[]) expect(cueProfile(c).category).toBe('ui');
  });

  it('并发淘汰：优先级最低者中最旧的；新音效更轻时丢弃新的', () => {
    const voices = [
      { priority: 2, start: 0 },
      { priority: 0, start: 2 },
      { priority: 0, start: 1 },
      { priority: 3, start: 0.5 },
    ];
    expect(pickVictim(voices, 2)).toBe(2);
    expect(pickVictim([{ priority: 3, start: 0 }], 1)).toBe(-1);
    expect(pickVictim([{ priority: 1, start: 0 }], 1)).toBe(0);
    expect(pickVictim([], 1)).toBe(-1);
  });

  it('闪避合并：取更深、更晚结束', () => {
    const a = mergeDuck(null, 1, -5, 1);
    expect(a).toEqual({ depthDb: -5, until: 2 });
    const b = mergeDuck(a, 1.5, -4, 2);
    expect(b).toEqual({ depthDb: -5, until: 3.5 });
    const c = mergeDuck(b, 10, -4, 1);
    expect(c).toEqual({ depthDb: -4, until: 11 });
  });

  it('试听变体的 key 唯一且与 cueKey 一致，覆盖全部 Cue 类型与分档', () => {
    const vs = allCueVariants();
    const keys = new Set(vs.map((v) => v.key));
    expect(keys.size).toBe(vs.length);
    for (const v of vs) expect(cueKey(v.cue)).toBe(v.key);
    const must = [
      ...['hover', 'click', 'select', 'denied', 'open', 'close', 'toggle'].map((u) => `ui:${u}`),
      ...['bigWin', 'win', 'flat', 'loss', 'bigLoss'].map((t) => `settle:${t}`),
      ...['limitUp', 'up', 'flat', 'down', 'limitDown'].map((t) => `reveal:${t}`),
      ...['bull', 'flat', 'bear'].map((m) => `weather:${m}`),
      ...['up', 'down', 'mixed', 'none'].map((h) => `heat:${h}`),
      ...['uncap', 'warning', 'delisted'].map((k) => `news:${k}`),
      ...['stop', 'take', 'delist'].map((r) => `autoSold:${r}`),
      ...['item', 'friend', 'stock', 'skip'].map((k) => `reward:${k}`),
      ...['gain', 'loss', 'none'].map((s) => `eventResult:${s}`),
      'stamp:paid',
      'stamp:overdue',
      'stamp:paid+credit',
      'judge:hit',
      'judge:miss',
      'item:plus',
      'item:minus',
    ];
    for (const k of must) expect(keys.has(k), k).toBe(true);
    // 每种 cue 类型至少有一个变体（Record 保证这里列全了全部类型：少一个就编译不过）
    const all: Record<Cue['type'], true> = {
      ui: true, chat: true, buy: true, sell: true, marketOpen: true, weather: true, thunder: true, heat: true, reveal: true,
      chain: true, limitUp: true, limitDown: true, item: true, news: true, autoSold: true, countUp: true, settle: true,
      judge: true, bill: true, stamp: true, rewardShow: true, reward: true, event: true, eventResult: true,
      monthStart: true, friendJoin: true, runWon: true, runLost: true, guide: true,
    };
    const have = new Set(vs.map((v) => v.cue.type));
    for (const t of Object.keys(all)) expect(have.has(t as Cue['type']), t).toBe(true);
  });
});

describe('音频：音乐', () => {
  it('交叉淡化 1.5–2 秒', () => {
    expect(CROSSFADE).toBeGreaterThanOrEqual(1.5);
    expect(CROSSFADE).toBeLessThanOrEqual(2);
  });

  it('情绪齐全：除 silent 外每种 Mood 都有配置', () => {
    const moods: Record<Exclude<Mood, 'silent'>, true> = { title: true, bull: true, flat: true, bear: true, payday: true, victory: true, defeat: true };
    expect(Object.keys(MOODS).sort()).toEqual(Object.keys(moods).sort());
  });

  it('情绪配置合法：节奏型 16 步、和声级数在音阶内、进行候选 ≥ 4 条', () => {
    for (const [mood, sp] of Object.entries(MOODS)) {
      expect(sp.progressions.length, mood).toBeGreaterThanOrEqual(4);
      for (const p of sp.progressions) for (const d of p) expect(d >= 0 && d < sp.scale.length, `${mood} 级数 ${d}`).toBe(true);
      const pats = [...(sp.bass?.patterns ?? []), ...(sp.arp?.patterns ?? []), sp.drums?.kick, sp.drums?.snare, sp.drums?.hat, sp.drums?.shaker, sp.drums?.tom];
      for (const p of pats) if (p !== undefined) expect(p.length, `${mood} 节奏型 ${p}`).toBe(16);
      expect(sp.bpm).toBeGreaterThanOrEqual(50);
      expect(sp.bpm).toBeLessThanOrEqual(140);
      expect(sp.level).toBeGreaterThan(0);
      expect(sp.level).toBeLessThanOrEqual(1);
      if (sp.swing !== undefined) expect(sp.swing).toBeLessThanOrEqual(0.5);
    }
    // 情绪色彩：熊市弗里几亚（低沉紧张）、月底多利亚、失败小调，其余大调；牛市比震荡快，熊市不带底鼓四拍
    expect(MOODS.bear.scale).toEqual(SCALES.phrygian);
    expect(MOODS.payday.scale).toEqual(SCALES.dorian);
    expect(MOODS.defeat.scale).toEqual(SCALES.minor);
    for (const m of ['title', 'bull', 'flat', 'victory'] as const) expect(MOODS[m].scale, m).toEqual(SCALES.major);
    expect(MOODS.bull.bpm).toBeGreaterThan(MOODS.flat.bpm);
    expect(MOODS.bear.pad?.cutoff ?? 0).toBeLessThan(MOODS.bull.pad?.cutoff ?? 0);
  });
});
