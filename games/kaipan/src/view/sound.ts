import { getSettings, onSettingsChange } from '../platform/settings.ts';
import { createAudio, type AudioApi, type Cue, type Mood, type UiSound } from './audio/index.ts';

/** 最近的 cue 记录条数（调试/验收用） */
const LOG_MAX = 200;

export interface CueRecord {
  /** 相对页面加载的毫秒数 */
  t: number;
  cue: Cue;
}

/**
 * 画面层与音频层之间的薄封装：单例、首次手势解锁、页面隐藏暂停、设置同步，
 * 并记录最近的 cue 供自动化验收。画面层只调用 sound.cue / sound.mood。
 */
class SoundBridge {
  private api: AudioApi | null = null;
  private current: Mood = 'silent';
  private readonly log: CueRecord[] = [];
  private readonly listeners = new Set<(r: CueRecord) => void>();

  init(): void {
    if (this.api) return;
    const api = createAudio();
    this.api = api;
    api.applySettings(getSettings());
    onSettingsChange((s) => api.applySettings(s));
    // 每次手势都尝试解锁：浏览器可能拒绝第一次 resume，unlock 可重复调用且已运行时几乎无开销
    const unlock = (): void => api.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => api.setPaused(document.hidden));
  }

  cue(c: Cue): void {
    this.log.push({ t: Math.round(performance.now()), cue: c });
    if (this.log.length > LOG_MAX) this.log.shift();
    this.api?.cue(c);
    const rec = this.log[this.log.length - 1];
    if (rec) for (const fn of [...this.listeners]) fn(rec);
  }

  /** 调试/验收：订阅之后的 cue，返回取消订阅函数。 */
  onCue(fn: (r: CueRecord) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  ui(name: UiSound): void {
    this.cue({ type: 'ui', name });
  }

  mood(m: Mood): void {
    if (m === this.current) return;
    this.current = m;
    this.api?.setMood(m);
  }

  get currentMood(): Mood {
    return this.current;
  }

  recent(): CueRecord[] {
    return [...this.log];
  }
}

export const sound = new SoundBridge();
