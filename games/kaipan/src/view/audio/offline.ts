/**
 * 离线渲染与客观测量（tools/audio-check.ts 在无头 Chromium 里调用；游戏运行时不引用本文件）。
 * 用 OfflineAudioContext 走与实时完全相同的引擎和主链，测峰值、RMS、时长、尾部与直流偏移，
 * 并对长时间音乐渲染采样活跃音符/节点数，确认没有泄漏。
 */
import { AudioEngine } from './engine.ts';
import { gainToDb, type BusLevels } from './logic.ts';
import { allCueVariants } from './sfx.ts';
import type { Cue, Mood } from './types.ts';

/** 测量用增益：全部拉满（最坏情况），验证主链限幅后不削波。 */
const UNITY: BusLevels = { master: 1, sfx: 1, music: 1 };
const SR = 48000;

export interface Analysis {
  peakDb: number;
  /** 有声段（首尾 -60 dBFS 之间）的 RMS */
  rmsDb: number;
  /** 400 ms 滑窗 RMS 的最大值（近似瞬时响度） */
  momentaryDb: number;
  /** 从开始到最后一个高于 -60 dBFS 的样本（秒） */
  duration: number;
  /** 最后 20 ms 的峰值 */
  tailDb: number;
  /** 全程均值（直流偏移） */
  dc: number;
  /** |x| ≥ 1 的样本数 */
  clipped: number;
}

export function analyze(buf: AudioBuffer, from = 0): Analysis {
  const sr = buf.sampleRate;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const len = buf.length;
  const start = Math.floor(from * sr);
  let peak = 0;
  let clipped = 0;
  let sum = 0;
  const thr = Math.pow(10, -60 / 20);
  let first = -1;
  let last = -1;
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let m = 0;
    for (const ch of chans) {
      const x = ch[i] ?? 0;
      const a = Math.abs(x);
      if (a > peak) peak = a;
      if (a >= 1) clipped++;
      if (a > m) m = a;
      sum += x;
    }
    mono[i] = m;
    if (i >= start && m > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  let sq = 0;
  let n = 0;
  if (first >= 0) {
    for (let i = first; i <= last; i++) {
      for (const ch of chans) {
        const x = ch[i] ?? 0;
        sq += x * x;
        n++;
      }
    }
  }
  // 400 ms 滑窗
  const win = Math.floor(0.4 * sr);
  let wsum = 0;
  let wmax = 0;
  const p2 = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (const ch of chans) s += (ch[i] ?? 0) ** 2;
    p2[i] = s / chans.length;
  }
  for (let i = 0; i < len; i++) {
    wsum += p2[i] ?? 0;
    if (i >= win) wsum -= p2[i - win] ?? 0;
    if (i >= win - 1 && wsum > wmax) wmax = wsum;
  }
  let tail = 0;
  for (let i = Math.max(0, len - Math.floor(0.02 * sr)); i < len; i++) tail = Math.max(tail, mono[i] ?? 0);
  return {
    peakDb: gainToDb(peak),
    rmsDb: n > 0 ? gainToDb(Math.sqrt(sq / n)) : -Infinity,
    momentaryDb: gainToDb(Math.sqrt(wmax / Math.max(1, Math.min(win, len)))),
    duration: last >= 0 ? (last - start) / sr : 0,
    tailDb: gainToDb(tail),
    dc: sum / (len * chans.length),
    clipped,
  };
}

/** 离线渲染单个音效：t=0.05 起播，渲染 seconds 秒。 */
export async function renderCue(cue: Cue, seconds = 5): Promise<Analysis & { nodesLeft: number }> {
  const ctx = new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
  const engine = new AudioEngine(ctx, UNITY);
  engine.playAt(cue, 0.05);
  const buf = await ctx.startRendering();
  // 给 onended 事件一点时间派发
  await new Promise((r) => setTimeout(r, 30));
  const left = engine.stats().sfxVoices;
  engine.dispose();
  return { ...analyze(buf, 0.05), nodesLeft: left };
}

export async function renderAllCues(): Promise<({ key: string; label: string } & Analysis & { nodesLeft: number })[]> {
  const out: ({ key: string; label: string } & Analysis & { nodesLeft: number })[] = [];
  for (const v of allCueVariants()) {
    const seconds = /runWon|runLost|marketOpen|stamp|bigWin|bigLoss|weather|thunder|limit|monthStart|friendJoin|reward|event/.test(v.key) ? 6 : 3;
    out.push({ key: v.key, label: v.label, ...(await renderCue(v.cue, seconds)) });
  }
  return out;
}

export interface MoodRender extends Analysis {
  mood: Mood;
  notesPerSec: number;
  brightness: number;
  /** 每 samplePeriod 秒采样一次的 [时间, 活跃音符数, 节点数] */
  samples: [number, number, number][];
}

/**
 * 离线渲染一段音乐：用 suspend/resume 逐步推进，模拟实时调度器每 50 ms 一次心跳。
 * moods 可给出多段 [起始秒, 情绪]，用于测交叉淡化。
 */
export async function renderMusic(moods: [number, Mood][], seconds: number, samplePeriod = 1): Promise<MoodRender> {
  const ctx = new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
  const engine = new AudioEngine(ctx, UNITY);
  const samples: [number, number, number][] = [];
  const step = 0.05;
  let nextSample = 0;
  let mi = 0;
  const pending: Promise<void>[] = [];
  for (let t = 0; t < seconds - step; t += step) {
    const at = Math.round(t / step) * step;
    pending.push(
      ctx.suspend(at).then(() => {
        while (mi < moods.length && (moods[mi]?.[0] ?? Infinity) <= at + 1e-9) {
          engine.setMood(moods[mi]?.[1] ?? 'silent');
          mi++;
        }
        engine.pump();
        if (at >= nextSample - 1e-9) {
          const s = engine.stats();
          samples.push([Math.round(at * 100) / 100, s.musicVoices, s.musicNodes]);
          nextSample += samplePeriod;
        }
        ctx.resume();
      }),
    );
  }
  const buf = await ctx.startRendering();
  await Promise.all(pending);
  const created = engine.music.stats().created;
  engine.dispose();
  return { mood: moods[0]?.[1] ?? 'silent', ...analyze(buf, 0), samples, notesPerSec: created / seconds, brightness: brightness(buf) };
}

/** 亮度近似：一阶差分的 RMS / 信号 RMS（高频能量越多越大）。 */
function brightness(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let e = 0;
  let ed = 0;
  for (let i = 1; i < d.length; i++) {
    const x = d[i] ?? 0;
    const dx = x - (d[i - 1] ?? 0);
    e += x * x;
    ed += dx * dx;
  }
  return e > 0 ? Math.sqrt(ed / e) : 0;
}

/** 并发上限测试：同一时刻发 30 个音效，返回在播数。 */
export async function concurrencyCheck(): Promise<{ requested: number; active: number; stolen: number }> {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const engine = new AudioEngine(ctx, UNITY);
  for (let i = 0; i < 30; i++) engine.playAt(i % 2 ? { type: 'autoSold', reason: 'stop' } : { type: 'reveal', move: i - 15, limit: null, index: i % 4 }, 0.05 + i * 0.001);
  const s = engine.stats();
  engine.dispose();
  return { requested: 30, active: s.sfxVoices, stolen: s.stolen };
}
