import type { Settings } from '../platform/settings.ts';

/** 画面层的运行选项：来自玩家设置，URL 参数（自动化用）优先。对象会被原地更新。 */
export interface ViewOptions {
  /** false 时关闭所有动画，状态直接跳到终态 */
  anim: boolean;
  /** 动画倍速 */
  speed: number;
  /** 显示调试浮层 */
  debug: boolean;
  /** 减少动态效果：关闭震屏、闪光与大幅粒子 */
  reduceMotion: boolean;
}

/** URL 上显式给出的动画参数；为 null 时跟随设置。 */
export interface AnimOverride {
  anim: boolean | null;
  speed: number | null;
}

/** 按设置刷新选项（原地修改），URL 参数优先。 */
export function applySettingsToOptions(opts: ViewOptions, s: Settings, url: AnimOverride): void {
  opts.anim = url.anim ?? s.animSpeed > 0;
  opts.speed = url.speed ?? (s.animSpeed > 0 ? s.animSpeed : 1);
  opts.reduceMotion = s.reduceMotion;
}
