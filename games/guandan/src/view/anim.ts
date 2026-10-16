import type Phaser from 'phaser';
import { SPEED_FACTOR, getSettings } from './store.ts';

/**
 * 动画节奏：所有时长都经过 dur() 换算（设置里的动画速度；URL anim=0 时几乎瞬间完成，冒烟用）。
 * 动画用 Promise 串起来，事件按顺序 await 播放。
 */
export const anim = {
  /** URL 参数强制的倍速（null = 跟设置走） */
  forcedSpeed: null as number | null,
  /** anim=0：所有动画 0 时长 */
  instant: false,
};

export function speed(): number {
  return anim.forcedSpeed ?? SPEED_FACTOR[getSettings().speed];
}

export function dur(ms: number): number {
  if (anim.instant) return 0;
  return Math.round(ms / speed());
}

export function tweenP(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    const d = typeof cfg.duration === 'number' ? dur(cfg.duration) : cfg.duration;
    const delay = typeof cfg.delay === 'number' ? dur(cfg.delay) : cfg.delay;
    if (d === 0 && !cfg.yoyo && !cfg.repeat) {
      // 0 时长直接落到终值，免得补间系统多走一帧
      scene.tweens.add({ ...cfg, duration: 0, delay: 0, onComplete: () => resolve() });
      return;
    }
    const done = cfg.onComplete;
    scene.tweens.add({
      ...cfg,
      duration: d,
      delay,
      onComplete: (...args: unknown[]) => {
        (done as ((...a: unknown[]) => void) | undefined)?.(...args);
        resolve();
      },
    });
  });
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  const d = dur(ms);
  if (d <= 0) return Promise.resolve();
  return new Promise((resolve) => scene.time.delayedCall(d, () => resolve()));
}
