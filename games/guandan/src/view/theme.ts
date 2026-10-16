/**
 * 配色、字体、世界尺寸与渲染倍数。
 *
 * 世界坐标高度固定 720，宽度随屏幕宽高比在 1280..1720 之间变（手机横屏更宽，不留黑边，手牌能排得更开）。
 * 宽高比按实际可见区域算（device.ts 的 appBox，不用 screen 和 100vh）。
 * 画布按 RENDER_SCALE 倍的物理像素绘制，相机同倍数 zoom，文字和贴图按实际像素栅格化，FIT 缩放时只缩小不放大，字就不糊。
 */
import { pickRenderScale } from './device.ts';

export const COLOR = {
  felt: 0x1f5a43,
  feltDark: 0x123a2b,
  wood: 0x6b3b1f,
  woodDark: 0x3e2110,
  red: 0xb3202a,
  redDark: 0x7d121a,
  gold: 0xe0b45a,
  goldLight: 0xffe3a0,
  goldDark: 0x9a7330,
  ivory: 0xfff7e6,
  paper: 0xfbf1dc,
  ink: 0x2b1d14,
  muted: 0x7a6555,
  dim: 0xb8a690,
  green: 0x2f9e5b,
  blue: 0x3a78c8,
  teamUs: 0xd9443a,
  teamThem: 0x3a78c8,
  overlay: 0x0b0806,
  grey: 0x8c8378,
  white: 0xffffff,
} as const;

export const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Droid Sans Fallback", sans-serif';
/** 标题和大字：优先游戏自带的宋体子集（fonts.ts，缺字时逐字回退），再系统宋体，没有就退回黑体 */
export const FONT_TITLE = '"GD Title", "Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Sans CJK SC", "Microsoft YaHei", serif';
export const FONT_NUM = '"Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", "Noto Sans CJK SC", sans-serif';

export function css(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export const GAME_HEIGHT = 720;
export const MIN_WIDTH = 1280;
export const MAX_WIDTH = 1720;

/** 按窗口宽高比算世界宽度：16:9 及更窄时 1280（上下留边），更宽时加宽到最多 1720。 */
export function worldWidthFor(w: number, h: number): number {
  if (!(w > 0 && h > 0)) return MIN_WIDTH;
  const want = Math.round((GAME_HEIGHT * w) / h / 4) * 4;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, want));
}

/** 渲染倍数（1..3）：按实际可见区域 × DPR，iOS 封顶 2，省内存模式 1；算法见 device.ts。 */
export const RENDER_SCALE = pickRenderScale();

/** 字号只用几级，保证手机横屏上最小字也有约 10 CSS 像素（720 高缩到 390 时 ×0.54）。 */
export const TYPE = { huge: 68, big: 40, title: 28, body: 23, label: 20, small: 18 } as const;
