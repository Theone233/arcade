import Phaser from 'phaser';
import type { ViewOptions } from '../options.ts';

/**
 * 场景内的动画节拍器。所有「需要等待」的表现都经过这里，以便统一处理：
 * - anim=0：全部瞬间完成，画面直接跳到终态；
 * - speed=N：等待时间除以 N；
 * - hurry()：玩家点击/空格跳过动画，快进到底，但仍停在「等继续」的画面；
 * - abort()：自动化插入新操作或场景切换，连「等继续」也一并放行。
 */
export class Animator {
  private readonly scene: Phaser.Scene;
  private readonly opts: ViewOptions;
  private skipping = false;
  private aborted = false;
  /** 场景已关闭：只放行等待，不再更新任何显示对象 */
  private disposed = false;
  /** 正在等待的计时器与数值滚动，快进时立即完成 */
  private readonly pending = new Set<() => void>();
  /** 正在等待玩家继续 */
  private readonly inputs = new Set<() => void>();

  constructor(scene: Phaser.Scene, opts: ViewOptions) {
    this.scene = scene;
    this.opts = opts;
  }

  /** 当前是否应跳过动画（anim=0 或已被快进）。 */
  get instant(): boolean {
    return !this.opts.anim || this.skipping;
  }

  /** 是否应省略大幅效果（震屏、闪光、大量粒子）：动画关闭、正在快进或玩家开启了「减少动态效果」。 */
  get calm(): boolean {
    return this.instant || this.opts.reduceMotion;
  }

  /** 一段表现开始前调用，清除上一段的快进状态。 */
  begin(): void {
    this.skipping = false;
    this.aborted = false;
  }

  /**
   * 分段快进：玩家按一次空格只跳过当前这一段（例如盘中走势），下一段（计分）恢复正常速度。
   * 被 abort（自动化插入新操作、场景切换）时保持快进。
   */
  relax(): void {
    if (!this.aborted) this.skipping = false;
  }

  /** 当前是否处于快进中（anim=0 不算）。 */
  get hurried(): boolean {
    return this.skipping;
  }

  hurry(): void {
    this.skipping = true;
    for (const finish of [...this.pending]) finish();
  }

  abort(): void {
    this.aborted = true;
    this.hurry();
    for (const finish of [...this.inputs]) finish();
  }

  /** 场景关闭时调用：放行全部等待；此时显示对象可能已销毁，数值滚动不再回写。 */
  dispose(): void {
    this.disposed = true;
    this.abort();
  }

  /** 是否有动画正在播放（可被 hurry 快进）。 */
  get playing(): boolean {
    return this.pending.size > 0;
  }

  /** 等待 ms 毫秒（按倍速缩放）。 */
  wait(ms: number): Promise<void> {
    if (this.instant || ms <= 0) return Promise.resolve();
    return this.track(ms / this.opts.speed);
  }

  /** 当前场景时钟（毫秒）。 */
  now(): number {
    return this.scene.time.now;
  }

  /**
   * 等到 start 之后 ms 毫秒（按倍速缩放）。用固定起点而不是逐段累加，
   * 帧率低时不会因每段都晚一帧而越拖越长。
   */
  waitUntil(start: number, ms: number): Promise<void> {
    if (this.instant) return Promise.resolve();
    const left = start + ms / this.opts.speed - this.scene.time.now;
    return left > 0 ? this.track(left) : Promise.resolve();
  }

  /** 数值滚动：onUpdate 会收到中间值，最后一定以 to 结束。 */
  count(from: number, to: number, ms: number, onUpdate: (v: number) => void, ease = 'Cubic.easeOut'): Promise<void> {
    if (this.instant || ms <= 0 || from === to) {
      onUpdate(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const tween = this.scene.tweens.addCounter({
        from,
        to,
        duration: ms / this.opts.speed,
        ease,
        onUpdate: (tw) => onUpdate(tw.getValue() ?? to),
        onComplete: () => finish(),
      });
      const finish = (): void => {
        if (done) return;
        done = true;
        this.pending.delete(finish);
        if (tween.isPlaying()) tween.stop();
        if (!this.disposed) onUpdate(to);
        resolve();
      };
      this.pending.add(finish);
    });
  }

  /** 线性进度 0→1（自己按进度摆放多个对象，如发牌）；快进时直接到 1。 */
  drive(ms: number, onUpdate: (t: number) => void): Promise<void> {
    return this.count(0, 1, ms, onUpdate, 'Linear');
  }

  /** 纯装饰性的补间（闪烁、飘字）：anim=0 或快进时不播放，直接执行 end 收尾。 */
  fx(config: Phaser.Types.Tweens.TweenBuilderConfig, end?: () => void): void {
    if (this.instant) {
      end?.();
      return;
    }
    const scaled = { ...config };
    if (typeof scaled.duration === 'number') scaled.duration /= this.opts.speed;
    if (typeof scaled.delay === 'number') scaled.delay /= this.opts.speed;
    if (typeof scaled.hold === 'number') scaled.hold /= this.opts.speed;
    const userComplete = config.onComplete;
    scaled.onComplete = (...args) => {
      userComplete?.(...args);
      // 目标可能已随面板/场景销毁，此时不再收尾
      const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
      if (targets.some((t) => t instanceof Phaser.GameObjects.GameObject && !t.active)) return;
      end?.();
    };
    this.scene.tweens.add(scaled);
  }

  /** 等待玩家继续：由 trigger 或 abort 放行（不会自动继续）。 */
  waitInput(): { promise: Promise<void>; trigger: () => void } {
    let trigger: () => void = () => {};
    if (this.aborted) return { promise: Promise.resolve(), trigger };
    const promise = new Promise<void>((resolve) => {
      const finish = (): void => {
        this.inputs.delete(finish);
        resolve();
      };
      trigger = finish;
      this.inputs.add(finish);
    });
    return { promise, trigger };
  }

  private track(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        this.pending.delete(finish);
        timer.remove(false);
        resolve();
      };
      const timer = this.scene.time.delayedCall(ms, finish);
      this.pending.add(finish);
    });
  }
}
