/**
 * 生成式背景音乐。
 *
 * 每种情绪（Mood）是一份 MoodSpec：速度、调式、和声进行候选、各声部（铺底、低音、琶音、旋律、鼓）的音色与节奏型。
 * MoodPlayer 以十六分音符为步进，用 audioContext.currentTime 做前瞻调度（每 25 ms 排未来 ~120 ms）。
 * 每个乐句（4 个和弦）结束后随机换一条不同的进行、换琶音型、重新生成旋律动机，长时间听不单调。
 * 切换情绪时旧 Player 淡出、新 Player 淡入（交叉淡化 1.8 秒），淡出完成后不再调度，尾音结束后断开。
 * 交易时画面层按大盘天气在 bull / flat / bear 之间切换，月底账单与三选一用 payday。
 */
import { Voice, envAdsr, holdParam, type AudioGraph } from './graph.ts';
import { CROSSFADE, Rng, SCALES, buildChord, clamp, dueSteps, midiToFreq, pickDifferent, scaleNote, stepDuration, voiceLead } from './logic.ts';
import { drum, fm, noise, tone } from './synth.ts';
import type { Mood } from './types.ts';

type PadKind = 'warm' | 'soft' | 'dark' | 'brass';
type LeadKind = 'bell' | 'ep' | 'pluck' | 'marimba';

interface MoodSpec {
  bpm: number;
  /** 主音（MIDI），低音声部以它下方一个八度为基准 */
  root: number;
  scale: readonly number[];
  /** 和声进行候选（音阶级数，0 起） */
  progressions: readonly (readonly number[])[];
  barsPerChord: number;
  /** 和弦音数：3 三和弦；4 七和弦。sevenths 为三和弦时随机加七音的概率 */
  chordSize: number;
  sevenths?: number;
  /** 淡入后的情绪总电平与混响送量 */
  level: number;
  reverb: number;
  /** 反拍十六分音符的摇摆比例（0..0.5） */
  swing?: number;
  pad?: { kind: PadKind; lo: number; hi: number; cutoff: number; gain: number };
  drone?: { gain: number; midi: number };
  /** 节奏型：16 字符一小节，'.' 休止，R 根音，F 五度，O 高八度 */
  bass?: { kind: 'sub' | 'pluck'; patterns: readonly string[]; gain: number };
  /** 节奏型：数字 k 表示和弦第 k 个音（超出和弦音数则升八度） */
  arp?: { kind: LeadKind; patterns: readonly string[]; gain: number; lo: number; cutoff?: number };
  melody?: { kind: LeadKind; gain: number; lo: number; density: number };
  /** 鼓组节奏型：x 重音，o 轻音 */
  drums?: { kick?: string; snare?: string; hat?: string; shaker?: string; tom?: string; gain: number };
}

const D3 = 50;

export const MOODS: Record<Exclude<Mood, 'silent'>, MoodSpec> = {
  // 标题：温暖、缓慢，大调，钢片琴般的稀疏琶音
  title: {
    bpm: 70,
    root: D3,
    scale: SCALES.major,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 5, 4],
      [0, 2, 3, 4],
      [5, 3, 0, 4],
      [3, 4, 2, 5],
      [0, 4, 5, 3],
    ],
    barsPerChord: 1,
    chordSize: 3,
    sevenths: 0.4,
    level: 0.72,
    reverb: 0.5,
    pad: { kind: 'warm', lo: 50, hi: 69, cutoff: 1400, gain: 0.05 },
    bass: { kind: 'sub', patterns: ['R...............', 'R.......F.......'], gain: 0.07 },
    arp: { kind: 'bell', patterns: ['0...2...1...3...', '0.......2...4...', '..0...2...1.....'], gain: 0.026, lo: 74 },
    melody: { kind: 'ep', gain: 0.035, lo: 74, density: 0.5 },
  },
  // 牛市（晴）：明亮轻快，大调 + 轻摇摆，马林巴琶音、跳跃低音、四拍底鼓与沙锤
  bull: {
    bpm: 112,
    root: D3,
    scale: SCALES.major,
    progressions: [
      [0, 4, 5, 3],
      [0, 3, 4, 4],
      [3, 4, 0, 5],
      [0, 5, 3, 4],
      [0, 1, 3, 4],
    ],
    barsPerChord: 1,
    chordSize: 3,
    sevenths: 0.25,
    level: 0.78,
    reverb: 0.28,
    swing: 0.12,
    pad: { kind: 'soft', lo: 57, hi: 74, cutoff: 1800, gain: 0.03 },
    bass: { kind: 'pluck', patterns: ['R...O...R...O...', 'R.....F.R...O...', 'R...F...R.O.F...'], gain: 0.06 },
    arp: { kind: 'marimba', patterns: ['0.1.2.1.0.2.1.3.', '0.2.1.3.2.0.3.1.', '..0.2...1.3.2...'], gain: 0.034, lo: 69 },
    melody: { kind: 'bell', gain: 0.026, lo: 81, density: 0.4 },
    drums: { kick: 'x...x...x...x...', hat: '..o...o...o...o.', shaker: '.o.o.o.o.o.o.o.o', gain: 1 },
  },
  // 震荡（阴）：平和，七和弦电钢琶音，铺底柔和，只有很轻的沙锤
  flat: {
    bpm: 92,
    root: D3,
    scale: SCALES.major,
    progressions: [
      [0, 3, 5, 4],
      [3, 4, 0, 0],
      [5, 1, 4, 0],
      [0, 2, 3, 1],
      [0, 5, 1, 4],
    ],
    barsPerChord: 1,
    chordSize: 4,
    level: 0.7,
    reverb: 0.42,
    pad: { kind: 'soft', lo: 52, hi: 71, cutoff: 1100, gain: 0.04 },
    bass: { kind: 'sub', patterns: ['R.......F.......', 'R...........F...'], gain: 0.06 },
    arp: { kind: 'ep', patterns: ['0.2.1.3.........', '..0...2...3...1.', '0...1...2...3...'], gain: 0.03, lo: 69 },
    melody: { kind: 'bell', gain: 0.02, lo: 81, density: 0.25 },
    drums: { shaker: '....o.......o...', gain: 1 },
  },
  // 熊市（雷雨）：低沉紧张，D 弗里几亚，低持续音、脉冲低音、暗色拨弦琶音与远处的低鼓
  bear: {
    bpm: 96,
    root: D3,
    scale: SCALES.phrygian,
    progressions: [
      [0, 1, 0, 6],
      [0, 5, 6, 1],
      [0, 6, 5, 1],
      [0, 3, 1, 0],
    ],
    barsPerChord: 1,
    chordSize: 3,
    level: 0.7,
    reverb: 0.45,
    pad: { kind: 'dark', lo: 45, hi: 62, cutoff: 650, gain: 0.04 },
    drone: { gain: 0.03, midi: 38 },
    bass: { kind: 'pluck', patterns: ['R.......R.......', 'R...R...R...R...', 'R..R..R...R..R..'], gain: 0.055 },
    arp: { kind: 'pluck', patterns: ['0..1..0..2..0...', '0..1..2..1..0...', '0.1.2.1.0.1.2.1.'], gain: 0.024, lo: 57, cutoff: 700 },
    melody: { kind: 'bell', gain: 0.02, lo: 62, density: 0.25 },
    drums: { tom: 'x.....o...o.....', hat: '..o...o...o...o.', gain: 1 },
  },
  // 月底结算：多利亚调式，摇摆的马林巴 + 走动低音 + 沙锤——轻松里带一点“要还钱了”的悬念
  payday: {
    bpm: 100,
    root: D3,
    scale: SCALES.dorian,
    progressions: [
      [0, 3, 0, 3],
      [0, 6, 3, 4],
      [0, 3, 6, 4],
      [5, 3, 0, 4],
      [0, 2, 3, 4],
    ],
    barsPerChord: 1,
    chordSize: 4,
    level: 0.76,
    reverb: 0.3,
    swing: 0.2,
    pad: { kind: 'soft', lo: 53, hi: 70, cutoff: 1300, gain: 0.03 },
    bass: { kind: 'pluck', patterns: ['R.....F.R...O...', 'R...F...R.O.F...', 'R.F.R...O...F...'], gain: 0.058 },
    arp: { kind: 'marimba', patterns: ['0.2.1.3.2.0.3.1.', '..0.2...1.3.2...', '0..2..1.3..2.0..'], gain: 0.032, lo: 67 },
    melody: { kind: 'ep', gain: 0.026, lo: 74, density: 0.3 },
    drums: { kick: 'x.......x.......', shaker: '..o...o...o...o.', gain: 1 },
  },
  // 胜利：大调，铜管铺底、明亮琶音、四拍底鼓
  victory: {
    bpm: 120,
    root: D3,
    scale: SCALES.major,
    progressions: [
      [0, 4, 5, 3],
      [3, 4, 0, 0],
      [5, 3, 0, 4],
      [0, 3, 4, 0],
      [0, 2, 3, 4],
    ],
    barsPerChord: 1,
    chordSize: 3,
    level: 0.8,
    reverb: 0.35,
    pad: { kind: 'brass', lo: 57, hi: 74, cutoff: 2200, gain: 0.03 },
    bass: { kind: 'pluck', patterns: ['R...O...R...O...', 'R.O.R.O.R.O.F.O.'], gain: 0.06 },
    arp: { kind: 'bell', patterns: ['0.1.2.3.2.1.0.1.', '0.2.1.3.0.2.1.3.'], gain: 0.026, lo: 74 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.', gain: 1 },
  },
  // 失败：稀疏、小调、慢
  defeat: {
    bpm: 60,
    root: D3,
    scale: SCALES.minor,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 0, 5],
      [5, 3, 0, 0],
      [0, 6, 5, 4],
    ],
    barsPerChord: 2,
    chordSize: 3,
    level: 0.75,
    reverb: 0.6,
    pad: { kind: 'soft', lo: 50, hi: 65, cutoff: 800, gain: 0.04 },
    bass: { kind: 'sub', patterns: ['R...............'], gain: 0.05 },
    melody: { kind: 'ep', gain: 0.035, lo: 62, density: 0.45 },
  },
};

const LOOKAHEAD = 0.12;
/** 淡出完成后再等多久断开（让尾音和混响自然结束） */
const TAIL = 5;

interface MotifNote {
  step: number;
  deg: number;
  len: number;
}

/** 一个情绪的演奏者。 */
class MoodPlayer {
  readonly mood: Mood;
  private readonly spec: MoodSpec;
  private readonly dir: MusicDirector;
  private readonly rng: Rng;
  private readonly fader: GainNode;
  private readonly send: GainNode;
  private readonly stepDur: number;
  private nextIndex = 0;
  private nextTime: number;
  stopAt = Infinity;

  private progIdx = -1;
  private prog: readonly number[] = [0];
  private chordDeg = 0;
  private chordNotes: number[] = [];
  private voicing: number[] | null = null;
  private arpPattern = '';
  private bassPattern = '';
  private motif: MotifNote[] = [];
  private melodyOn = false;

  constructor(dir: MusicDirector, mood: Exclude<Mood, 'silent'>, start: number, seed: number) {
    this.dir = dir;
    this.mood = mood;
    this.spec = MOODS[mood];
    this.rng = new Rng(seed);
    this.stepDur = stepDuration(this.spec.bpm);
    this.nextTime = start;
    const ctx = dir.graph.ctx;
    this.fader = ctx.createGain();
    // GainNode 默认增益为 1：先置 0，避免 start 之前的空档
    this.fader.gain.value = 0;
    this.fader.gain.setValueAtTime(0, start);
    this.fader.gain.linearRampToValueAtTime(this.spec.level, start + CROSSFADE);
    this.send = ctx.createGain();
    this.send.gain.value = this.spec.reverb;
    this.fader.connect(dir.graph.musicDry);
    this.fader.connect(this.send).connect(dir.graph.musicSend);
  }

  /** 从 at 起 dur 秒淡出，之后不再调度。 */
  fadeOut(at: number, dur: number): void {
    const g = this.fader.gain;
    // 从当前值（可能正在淡入或淡出）平滑过渡到 0，避免跳变
    holdParam(g, at);
    g.linearRampToValueAtTime(0, at + dur);
    this.stopAt = Math.min(this.stopAt, at + dur);
  }

  expired(now: number): boolean {
    return now > this.stopAt + TAIL;
  }

  disconnect(): void {
    this.fader.disconnect();
    this.send.disconnect();
  }

  pump(now: number): void {
    if (now >= this.stopAt) return;
    const due = dueSteps(this.nextIndex, this.nextTime, now, LOOKAHEAD, this.stepDur);
    this.nextIndex = due.nextIndex;
    this.nextTime = due.nextTime;
    for (const s of due.steps) {
      if (s.time >= this.stopAt) break;
      this.step(s.index, s.time);
    }
  }

  // ───────────── 一步 ─────────────

  private step(i: number, t0: number): void {
    const sp = this.spec;
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const barsPerPhrase = sp.barsPerChord * 4;
    // 反拍摇摆
    const t = s % 4 === 2 && sp.swing ? t0 + sp.swing * this.stepDur : t0;
    if (s === 0) {
      if (bar % barsPerPhrase === 0) this.newPhrase();
      if (bar % sp.barsPerChord === 0) this.newChord(Math.floor((bar % barsPerPhrase) / sp.barsPerChord), t0);
      this.newBar();
    }
    this.bassStep(s, t);
    this.arpStep(s, t);
    this.melodyStep(s, t);
    this.drumStep(s, t);
  }

  private newPhrase(): void {
    const sp = this.spec;
    this.progIdx = pickDifferent(sp.progressions.length, this.progIdx, this.rng);
    this.prog = sp.progressions[this.progIdx] ?? [0];
    this.motif = this.makeMotif();
    if (sp.arp) this.arpPattern = this.rng.pick(sp.arp.patterns);
  }

  private newBar(): void {
    const sp = this.spec;
    // 旋律动机按小节随机出现（稀疏）
    if (sp.melody) this.melodyOn = this.rng.chance(sp.melody.density);
    if (sp.bass) this.bassPattern = this.rng.chance(0.3) || !this.bassPattern ? this.rng.pick(sp.bass.patterns) : this.bassPattern;
  }

  private newChord(idx: number, t: number): void {
    const sp = this.spec;
    this.chordDeg = this.prog[idx] ?? 0;
    const size = sp.chordSize === 3 && sp.sevenths && this.rng.chance(sp.sevenths) ? 4 : sp.chordSize;
    this.chordNotes = buildChord(sp.root, sp.scale, this.chordDeg, size);
    const dur = this.stepDur * 16 * sp.barsPerChord;
    if (sp.pad) {
      this.voicing = voiceLead(this.voicing, this.chordNotes, sp.pad.lo, sp.pad.hi);
      this.pad(this.voicing, t, dur);
    }
    if (sp.drone) this.droneNote(t, dur);
  }

  private makeMotif(): MotifNote[] {
    const count = 2 + this.rng.int(3);
    const slots = [0, 2, 4, 6, 8, 10, 12, 14];
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(this.rng.pick(slots));
    const steps = [...chosen].sort((a, b) => a - b);
    let deg = this.rng.pick([0, 2, 4]);
    return steps.map((st, k) => {
      if (k > 0) deg = clamp(deg + this.rng.pick([-2, -1, 1, 2]), -2, 7);
      const next = steps[k + 1] ?? 16;
      return { step: st, deg, len: Math.min(next - st, 6) };
    });
  }

  // ───────────── 声部 ─────────────

  /** 把和弦级数折到主音附近（V–VII 级放到主音下方），让琶音/旋律音域紧凑。 */
  private fold(deg: number): number {
    return deg >= 4 ? deg - 7 : deg;
  }

  private bassStep(s: number, t: number): void {
    const b = this.spec.bass;
    if (!b) return;
    const ch = this.bassPattern[s];
    if (!ch || ch === '.') return;
    const base = scaleNote(this.spec.root - 12, this.spec.scale, this.fold(this.chordDeg));
    const midi = ch === 'F' ? base + 7 : ch === 'O' ? base + 12 : base;
    // 音长：到下一个音符或小节末
    let len = 1;
    while (s + len < 16 && this.bassPattern[s + len] === '.') len++;
    this.bassNote(b.kind, midiToFreq(midi), t, Math.min(len, 8) * this.stepDur, b.gain);
  }

  private arpStep(s: number, t: number): void {
    const a = this.spec.arp;
    if (!a) return;
    const ch = this.arpPattern[s];
    if (!ch || ch === '.') return;
    const k = Number(ch);
    if (!Number.isFinite(k)) return;
    const size = this.chordNotes.length || 3;
    const midi = scaleNote(a.lo, this.spec.scale, this.fold(this.chordDeg) + 2 * (k % size)) + 12 * Math.floor(k / size);
    const vel = (s % 4 === 0 ? 1 : 0.75) * this.rng.range(0.85, 1);
    this.lead(a.kind, midiToFreq(midi), t, this.stepDur * 2, a.gain * vel, a.cutoff ?? 2000);
  }

  private melodyStep(s: number, t: number): void {
    const m = this.spec.melody;
    if (!m || !this.melodyOn) return;
    for (const n of this.motif) {
      if (n.step !== s) continue;
      const vary = this.rng.chance(0.2) ? this.rng.pick([-1, 1]) : 0;
      const midi = scaleNote(m.lo, this.spec.scale, this.fold(this.chordDeg) + n.deg + vary);
      const jitter = this.rng.range(0, 0.012);
      this.lead(m.kind, midiToFreq(midi), t + jitter, n.len * this.stepDur, m.gain * this.rng.range(0.8, 1), 3000);
    }
  }

  private drumStep(s: number, t: number): void {
    const d = this.spec.drums;
    if (!d) return;
    const at = (p: string | undefined): string | undefined => {
      const c = p?.[s];
      return c && c !== '.' ? c : undefined;
    };
    const k = at(d.kick);
    if (k) this.kick(t, k === 'x' ? 0.11 : 0.07);
    const sn = at(d.snare);
    if (sn) this.snare(t, 0.05);
    const h = at(d.hat);
    if (h) this.hat(t, h === 'x' ? 0.025 : 0.017);
    const sh = at(d.shaker);
    if (sh) this.shaker(t, 0.02);
    const tm = at(d.tom);
    if (tm) this.tom(t, tm === 'x' ? 0.16 : 0.09);
  }

  // ───────────── 乐器 ─────────────

  private voice(t: number): Voice {
    return this.dir.voice(t, this.fader);
  }

  private pad(notes: readonly number[], t: number, dur: number): void {
    const p = this.spec.pad;
    if (!p) return;
    const v = this.voice(t);
    const f = v.filter('lowpass', p.cutoff, p.kind === 'brass' ? 1 : 0.6);
    // 缓慢的滤波摆动，让长音有呼吸感
    const lfo = v.osc('sine', 0.13 + this.rng.range(0, 0.06), t);
    const lfoAmt = v.gain(p.cutoff * 0.25);
    lfo.connect(lfoAmt).connect(f.frequency);
    const g = v.gain(0);
    f.connect(g).connect(v.out);
    const types: Record<PadKind, [OscillatorType, OscillatorType]> = {
      warm: ['triangle', 'sawtooth'],
      soft: ['sine', 'triangle'],
      dark: ['sawtooth', 'sawtooth'],
      brass: ['sawtooth', 'sawtooth'],
    };
    const [ta, tb] = types[p.kind];
    const per = p.gain / Math.sqrt(notes.length);
    for (const m of notes) {
      const fr = midiToFreq(m);
      const a = v.osc(ta, fr, t, -6);
      const b = v.osc(tb, fr, t, 6);
      const gb = v.gain(p.kind === 'warm' ? 0.35 : 1);
      a.connect(f);
      b.connect(gb).connect(f);
    }
    const attack = p.kind === 'brass' ? 0.12 : 0.7;
    const hold = Math.max(dur - 0.2, attack + 0.3);
    envAdsr(g.gain, t, attack, 0.6, 0.8, hold, 1.3, per);
    v.until(t + hold + 1.31);
    v.finish(this.dir.release);
  }

  private droneNote(t: number, dur: number): void {
    const d = this.spec.drone;
    if (!d) return;
    const v = this.voice(t);
    const f = v.filter('lowpass', 260, 0.8);
    const g = v.gain(0);
    f.connect(g).connect(v.out);
    for (const det of [-5, 5]) v.osc('sawtooth', midiToFreq(d.midi), t, det).connect(f);
    v.osc('sine', midiToFreq(d.midi - 12), t).connect(g);
    envAdsr(g.gain, t, 1.2, 0.5, 0.9, dur, 1.5, d.gain);
    v.until(t + dur + 1.51);
    v.finish(this.dir.release);
  }

  private bassNote(kind: 'sub' | 'pluck', f: number, t: number, dur: number, gain: number): void {
    const v = this.voice(t);
    if (kind === 'sub') {
      tone(v, { freq: f, t, a: 0.015, d: 0.2, sustain: 0.7, hold: dur, r: 0.15, peak: gain });
      tone(v, { type: 'triangle', freq: f, t, a: 0.015, d: 0.2, sustain: 0.5, hold: dur, r: 0.15, peak: gain * 0.4, lp: 400 });
    } else {
      tone(v, { type: 'sawtooth', freq: f, t, a: 0.004, d: Math.min(0.35, dur + 0.1), peak: gain * 0.7, lp: 900, lpTo: 180, lpTime: 0.25, q: 2 });
      tone(v, { freq: f, t, a: 0.004, d: Math.min(0.4, dur + 0.15), peak: gain * 0.8 });
    }
    v.finish(this.dir.release);
  }

  private lead(kind: LeadKind, f: number, t: number, dur: number, gain: number, cutoff: number): void {
    const v = this.voice(t);
    const pan = this.rng.range(-0.35, 0.35);
    switch (kind) {
      case 'bell':
        fm(v, { freq: f, ratio: 4, index: 1.2, indexEnd: 0.1, indexTime: 0.3, t, a: 0.002, d: 1.2, peak: gain, pan });
        break;
      case 'ep':
        fm(v, { freq: f, ratio: 1, index: 1.5, indexEnd: 0.2, indexTime: 0.5, t, a: 0.004, d: Math.max(1.0, dur * 2), peak: gain, pan });
        break;
      case 'pluck':
        tone(v, { type: 'sawtooth', freq: f, t, a: 0.003, d: Math.max(0.18, dur), peak: gain, lp: Math.min(cutoff * 2, 8000), lpTo: Math.max(cutoff * 0.3, 120), lpTime: 0.12, q: 2.5, pan });
        break;
      case 'marimba':
        fm(v, { freq: f, ratio: 4, index: 1.8, indexEnd: 0.05, indexTime: 0.05, t, a: 0.001, d: 0.4, peak: gain * 0.7, pan });
        tone(v, { freq: f, t, a: 0.001, d: 0.5, peak: gain * 0.5, pan });
        break;
    }
    v.finish(this.dir.release);
  }

  private kick(t: number, gain: number): void {
    const v = this.voice(t);
    drum(v, { freq: 110, to: 42, t, d: 0.3, peak: gain, click: 0.1, clickLp: 2000 });
    v.finish(this.dir.release);
  }

  private hat(t: number, gain: number): void {
    const v = this.voice(t);
    noise(v, { filter: 'highpass', f: 7500, t, a: 0.001, d: 0.04, peak: gain, pan: this.rng.range(-0.2, 0.2) });
    v.finish(this.dir.release);
  }

  private shaker(t: number, gain: number): void {
    const v = this.voice(t);
    noise(v, { filter: 'bandpass', f: 5000, q: 1, t, a: 0.012, d: 0.06, peak: gain, pan: 0.25 });
    v.finish(this.dir.release);
  }

  private snare(t: number, gain: number): void {
    const v = this.voice(t);
    noise(v, { filter: 'bandpass', f: 1800, q: 0.8, t, a: 0.001, d: 0.14, peak: gain });
    tone(v, { type: 'triangle', freq: 190, to: 160, glide: 0.05, t, a: 0.001, d: 0.08, peak: gain * 0.5 });
    v.finish(this.dir.release);
  }

  private tom(t: number, gain: number): void {
    const v = this.voice(t);
    drum(v, { freq: 95, to: 60, t, d: 0.7, peak: gain, click: 0.25, clickLp: 500 });
    v.finish(this.dir.release);
  }
}

/** 音乐总控：管理情绪切换、交叉淡化和所有音符 Voice 的生命周期。 */
export class MusicDirector {
  readonly graph: AudioGraph;
  private players: MoodPlayer[] = [];
  private mood: Mood = 'silent';
  private readonly voices = new Set<Voice>();
  private seed = 1;
  /** 音符结束时的回调（箭头函数，避免每个音符新建闭包） */
  readonly release = (v: Voice): void => {
    this.voices.delete(v);
  };

  constructor(graph: AudioGraph) {
    this.graph = graph;
  }

  get currentMood(): Mood {
    return this.mood;
  }

  /** 统计：活跃音符数、节点数、播放器数。 */
  stats(): { voices: number; nodes: number; players: number; created: number } {
    let nodes = 0;
    for (const v of this.voices) nodes += v.nodeCount;
    return { voices: this.voices.size, nodes, players: this.players.length, created: this.created };
  }

  /** 累计创建的音符数（测量节奏密度用） */
  private created = 0;

  voice(t: number, dest: AudioNode): Voice {
    this.created++;
    const v = new Voice(this.graph.ctx, dest, t, 0, this.graph.noise);
    this.voices.add(v);
    return v;
  }

  setMood(m: Mood, now: number): void {
    if (m === this.mood) return;
    this.mood = m;
    for (const p of this.players) if (p.stopAt === Infinity) p.fadeOut(now, CROSSFADE);
    // 快速连切时只保留最近的两个淡出者，更早的快速收掉
    const fading = this.players.filter((p) => p.stopAt !== Infinity);
    for (const p of fading.slice(0, Math.max(0, fading.length - 2))) p.fadeOut(now, 0.3);
    if (m !== 'silent') {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      this.players.push(new MoodPlayer(this, m, now + 0.05, this.seed));
    }
  }

  /** 调度器心跳：排程未来窗口内的音符，回收已结束的播放器。 */
  pump(now: number): void {
    for (const p of this.players) p.pump(now);
    if (this.players.some((p) => p.expired(now))) {
      this.players = this.players.filter((p) => {
        if (!p.expired(now)) return true;
        p.disconnect();
        return false;
      });
    }
  }

  dispose(): void {
    for (const v of [...this.voices]) v.cleanup();
    this.voices.clear();
    for (const p of this.players) p.disconnect();
    this.players = [];
  }
}
