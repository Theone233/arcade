import Phaser from 'phaser';
import { SLICES, artRef, glyphKey, type Glyph, type SliceKey } from '../assets.ts';
import { COLOR } from '../theme.ts';

/**
 * 使用预加载素材的小工具。素材缺失（加载失败）时退回到纯色图形，界面仍可用。
 * 素材可能来自图集（2 倍烘焙）或按 RENDER_SCALE 倍光栅化的单独 SVG，这里按 artRef 给出的倍数统一换算回世界坐标尺寸。
 */

const SLICE_KEY: Record<SliceKey, string> = {
  phone_frame: 'chat:phone_frame',
  chat_header: 'chat:chat_header',
  bubble_left: 'chat:bubble_left',
  bubble_right: 'chat:bubble_right',
  bubble_card: 'chat:bubble_card',
  system_pill: 'chat:system_pill',
  card_holding: 'ui:card_holding',
  panel_paper: 'ui:panel_paper',
  button_big: 'ui:button_big',
  button_buy: 'ui:button_buy',
  tag_pill: 'ui:tag_pill',
  codex_tab: 'ui:codex_tab',
  codex_tab_active: 'ui:codex_tab_active',
  codex_card: 'ui:codex_card',
  progress_track: 'ui:progress_track',
  progress_fill: 'ui:progress_fill',
  recap_paper: 'ui:recap_paper',
};

export type Box = Phaser.GameObjects.Rectangle | Phaser.GameObjects.NineSlice;

/**
 * 九宫格（左上角为原点）。九宫格素材在 RENDER_SCALE 倍纹理上切片，再整体缩小回世界尺寸。
 * 宽高小于两端切片之和时退回到圆角矩形。
 */
export function addSlice(scene: Phaser.Scene, x: number, y: number, w: number, h: number, kind: SliceKey): Box {
  const ref = artRef(scene.textures, SLICE_KEY[kind]);
  const [l, r, t, b] = SLICES[kind];
  if (!ref || w < l + r || (t + b > 0 && h < t + b)) {
    return scene.add.rectangle(x, y, w, h, COLOR.paper).setOrigin(0, 0).setRounded(Math.min(10, h / 2)).setStrokeStyle(2, COLOR.ink, 1);
  }
  const s = ref.px;
  // 只切左右（上下为 0）时用三段式
  const ns =
    t + b === 0
      ? scene.add.nineslice(x, y, ref.tex, ref.frame, w * s, h * s, l * s, r * s)
      : scene.add.nineslice(x, y, ref.tex, ref.frame, w * s, h * s, l * s, r * s, t * s, b * s);
  return ns.setOrigin(0, 0).setScale(1 / s);
}

/** 图片按世界尺寸显示；(x, y) 为中心。素材缺失时隐藏。 */
export function addImage(scene: Phaser.Scene, x: number, y: number, key: string, w: number, h: number = w): Phaser.GameObjects.Image {
  const ref = artRef(scene.textures, key);
  const img = ref ? scene.add.image(x, y, ref.tex, ref.frame) : scene.add.image(x, y, '__WHITE');
  img.setDisplaySize(w, h);
  if (!ref) img.setVisible(false);
  return img;
}

/** 换图（保持显示尺寸）；素材缺失时不变，返回是否换成功。 */
export function setArt(img: Phaser.GameObjects.Image, key: string): boolean {
  const ref = artRef(img.scene.textures, key);
  if (!ref) return false;
  const w = img.displayWidth;
  const h = img.displayHeight;
  img.setTexture(ref.tex, ref.frame).setDisplaySize(w, h);
  return true;
}

/** 平铺纹理（聊天背景、纸纹）。 */
export function addTile(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key: string, alpha = 1): Phaser.GameObjects.GameObject {
  const ref = artRef(scene.textures, key);
  if (!ref) return scene.add.rectangle(x, y, w, h, COLOR.paper, 0).setOrigin(0, 0);
  const s = ref.px;
  return scene.add
    .tileSprite(x, y, w * s, h * s, ref.tex, ref.frame)
    .setOrigin(0, 0)
    .setScale(1 / s)
    .setAlpha(alpha);
}

/** 纸面板：九宫格纸张 + 可选纸纹。 */
export function addPaper(scene: Phaser.Scene, x: number, y: number, w: number, h: number, grain = true): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  c.add(addSlice(scene, 0, 0, w, h, 'panel_paper'));
  if (grain) c.add(addTile(scene, 8, 8, w - 16, h - 16, 'ui:paper_tile', 0.5));
  return c;
}

/** 胶囊标签：底色 fill，文字由调用方叠加。返回胶囊本身（左上角原点）。 */
export function addPill(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, stroke = true): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(x, y, w, h, fill).setOrigin(0, 0).setRounded(h / 2);
  if (stroke) r.setStrokeStyle(1.5, COLOR.ink, 1);
  return r;
}

/**
 * 0.5 小图标（见 assets.ts 的 GLYPHS）：(x, y) 为中心，size 为边长；tint 给箭头着涨跌色。
 * 素材缺失时隐藏（文字标签仍在）。
 */
export function addGlyph(scene: Phaser.Scene, x: number, y: number, g: Glyph, size: number, tint?: number): Phaser.GameObjects.Image {
  const img = addImage(scene, x, y, glyphKey(g), size);
  if (tint !== undefined) img.setTint(tint);
  return img;
}
