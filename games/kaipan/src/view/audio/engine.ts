/**
 * 音频引擎：把音频图、音效池、节流和音乐总控组装在一起。
 * 不关心 AudioContext 从哪来——实时播放（index.ts）和离线渲染测量（offline.ts）共用它。
 */
import { AudioGraph, Voice, VoicePool } from './graph.ts';
import { RAPID_INTERVAL, Throttle, busLevels, cueProfile, mergeDuck, pickVictim, type BusLevels } from './logic.ts';
import { MusicDirector } from './music.ts';
import { buildSfx } from './sfx.ts';
import type { Cue, Mood } from './types.ts';
import type { Settings } from '../../platform/settings.ts';

/** 同时发声的音效上限（音乐音符不计入） */
const MAX_SFX_VOICES = 16;
/** 排程音效时的提前量：保证包络起点不落在过去 */
const START_OFFSET = 0.005;

export interface EngineStats {
  sfxVoices: number;
  musicVoices: number;
  musicNodes: number;
  players: number;
  mood: Mood;
  /** 累计：发出 / 被节流 / 被淘汰或丢弃 */
  played: number;
  throttled: number;
  stolen: number;
}

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly graph: AudioGraph;
  readonly music: MusicDirector;
  private readonly pool = new VoicePool(MAX_SFX_VOICES);
  private readonly hover = new Throttle(0.06);
  private readonly uiRepeat = new Throttle(0.04);
  /** 连发型 cue（账户滚动、群聊、揭晓、连线、道具）各自一个节流闸，间隔见 RAPID_INTERVAL */
  private readonly rapid = new Map<Cue['type'], Throttle>();
  private duckState: { depthDb: number; until: number } | null = null;
  private counters = { played: 0, throttled: 0, stolen: 0 };
  private readonly releaseSfx = (v: Voice): void => {
    this.pool.remove(v);
  };

  /** 节流用的时钟（秒）。实时播放传 performance.now：currentTime 按音频回调块推进，粒度粗且不均匀 */
  private readonly clock: () => number;

  constructor(ctx: BaseAudioContext, levels: BusLevels, clock?: () => number) {
    this.ctx = ctx;
    this.clock = clock ?? (() => ctx.currentTime);
    this.graph = new AudioGraph(ctx, levels);
    this.music = new MusicDirector(this.graph);
    for (const [type, gap] of Object.entries(RAPID_INTERVAL) as [Cue['type'], number][]) this.rapid.set(type, new Throttle(gap));
  }

  applySettings(s: Settings, immediate = false): void {
    this.graph.setLevels(busLevels(s), immediate);
  }

  /** 实时入口：应用节流后在“现在”发声。 */
  cue(c: Cue): void {
    const at = this.ctx.currentTime + START_OFFSET;
    const now = this.clock();
    const gate = c.type === 'ui' ? (c.name === 'hover' ? this.hover : this.uiRepeat) : this.rapid.get(c.type);
    if (gate && !gate.allow(now)) {
      this.counters.throttled++;
      return;
    }
    this.playAt(c, at);
  }

  /** 在 t 时刻发声（不经节流）；返回 Voice，被丢弃时返回 null。离线测量直接调用它。 */
  playAt(c: Cue, t: number): Voice | null {
    const prof = cueProfile(c);
    if (this.pool.size >= this.pool.limit) {
      const list = [...this.pool.voices];
      const idx = pickVictim(list, prof.priority);
      const victim = idx >= 0 ? list[idx] : undefined;
      this.counters.stolen++;
      if (!victim) return null;
      victim.kill(this.ctx.currentTime);
      this.pool.remove(victim);
    }
    const v = new Voice(this.ctx, this.graph.sfxDry, t, prof.priority, this.graph.noise);
    const wet = buildSfx(v, c, t);
    if (wet > 0) v.out.connect(v.gain(wet)).connect(this.graph.sfxSend);
    this.pool.add(v);
    v.finish(this.releaseSfx);
    this.counters.played++;
    if (prof.duckDb < 0) {
      this.duckState = mergeDuck(this.duckState, t, prof.duckDb, prof.duckHold);
      this.graph.duck(t, this.duckState.depthDb, this.duckState.until);
    }
    return v;
  }

  setMood(m: Mood): void {
    this.music.setMood(m, this.ctx.currentTime);
  }

  /** 音乐调度心跳。 */
  pump(): void {
    this.music.pump(this.ctx.currentTime);
  }

  stats(): EngineStats {
    const ms = this.music.stats();
    return {
      sfxVoices: this.pool.size,
      musicVoices: ms.voices,
      musicNodes: ms.nodes,
      players: ms.players,
      mood: this.music.currentMood,
      ...this.counters,
    };
  }

  dispose(): void {
    this.pool.cleanupAll();
    this.music.dispose();
    this.graph.dispose();
  }
}
