import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PHONE, RENDER_SCALE, VIEW } from './theme.ts';

/** 按手机布局（960×444）搭的场景。setupCamera 时登记，不靠比较相机缩放来猜。 */
const phoneScenes = new WeakSet<object>();

/**
 * 相机怎么摆（0.5.5）：电脑上，或手机上适配过的场景（phoneReady），按渲染倍数 1:1 显示世界；
 * 手机上还按 1280×720 布局的场景整体缩小、居中放进 960×444（和以前在手机上看到的一样大）。
 */
export function cameraFor(phoneReady: boolean, phone = PHONE, scale = RENDER_SCALE): { zoom: number; scrollX: number; scrollY: number; phoneLayout: boolean } {
  if (!phone || phoneReady) return { zoom: scale, scrollX: 0, scrollY: 0, phoneLayout: phone };
  const k = Math.min(VIEW_PHONE.w / GAME_WIDTH, VIEW_PHONE.h / GAME_HEIGHT);
  return { zoom: scale * k, scrollX: (GAME_WIDTH - VIEW_PHONE.w / k) / 2, scrollY: (GAME_HEIGHT - VIEW_PHONE.h / k) / 2, phoneLayout: false };
}

/** 手机的世界尺寸（VIEW 在电脑上是 1280×720，这里单独写一份给 cameraFor 算兜底用） */
const VIEW_PHONE = { w: 960, h: 444 };

/** 按 cameraFor 设好场景的相机，并登记这个场景是不是手机布局。 */
export function applyCamera(scene: Phaser.Scene, phoneReady: boolean): void {
  const c = cameraFor(phoneReady);
  scene.cameras.main.setOrigin(0, 0).setZoom(c.zoom).setScroll(c.scrollX, c.scrollY);
  if (c.phoneLayout) phoneScenes.add(scene);
  else phoneScenes.delete(scene);
}

/**
 * 场景实际在用的世界尺寸：电脑上一律 1280×720；手机上适配过的场景是 960×444，
 * 还没适配的场景整体缩小放进来、仍按 1280×720 布局。
 * 遮罩、居中弹窗、悬停说明的夹紧都按它来，不直接用 GAME_WIDTH / GAME_HEIGHT。
 */
export function viewOf(scene: Phaser.Scene): { w: number; h: number } {
  return PHONE && phoneScenes.has(scene) ? VIEW : { w: GAME_WIDTH, h: GAME_HEIGHT };
}

/** 这个场景是不是按手机布局（960×444）。 */
export function phoneLayout(scene: Phaser.Scene): boolean {
  return PHONE && phoneScenes.has(scene);
}
