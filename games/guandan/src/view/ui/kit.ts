/**
 * 界面小组件：文字、按钮、图标按钮、面板、弹窗、气泡、提示条。
 * 底板全用 Graphics 画（矢量，相机 zoom 后依然锐利），尺寸随用随定，不需要预烘焙贴图。
 */
import Phaser from 'phaser';
import { COLOR, FONT, FONT_NUM, FONT_TITLE, GAME_HEIGHT, RENDER_SCALE, TYPE, css } from '../theme.ts';
import { audio } from '../audio.ts';

export function worldW(scene: Phaser.Scene): number {
  return Math.round(scene.scale.gameSize.width / RENDER_SCALE);
}
export const worldH = GAME_HEIGHT;

export interface TextOpts {
  size?: number;
  color?: number;
  bold?: boolean;
  font?: 'body' | 'title' | 'num';
  align?: 'left' | 'center' | 'right';
  ox?: number;
  oy?: number;
  stroke?: number;
  strokeWidth?: number;
  /** 自动换行宽度（按字符断行） */
  wrap?: number;
  lineSpacing?: number;
  shadow?: boolean;
}

/** 中文按字符断行，行首避开标点。 */
function cjkWrap(text: string, obj: Phaser.GameObjects.Text, width: number): string[] {
  const ctx = obj.context;
  const out: string[] = [];
  const noStart = '，。、；：？！）》」%,.;:?!)';
  for (const para of text.split('\n')) {
    const atoms = para.match(/[A-Za-z0-9.+\-×%]+|./gu) ?? [];
    let line = '';
    for (const a of atoms) {
      if (line && ctx.measureText(line + a).width > width && !noStart.includes(a)) {
        out.push(line);
        line = a.trim() ? a : '';
      } else line += a;
    }
    out.push(line);
  }
  return out;
}

export function text(scene: Phaser.Scene, x: number, y: number, str: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const family = o.font === 'title' ? FONT_TITLE : o.font === 'num' ? FONT_NUM : FONT;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: family,
    fontSize: `${o.size ?? TYPE.body}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: css(o.color ?? COLOR.ink),
    align: o.align ?? 'center',
    resolution: RENDER_SCALE,
    lineSpacing: o.lineSpacing ?? 4,
  };
  if (o.stroke !== undefined) {
    style.stroke = css(o.stroke);
    style.strokeThickness = o.strokeWidth ?? 4;
  }
  if (o.shadow) style.shadow = { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.55)', blur: 4, fill: true, stroke: true };
  const w = o.wrap;
  if (w !== undefined) style.wordWrap = { callback: (t: string, obj: Phaser.GameObjects.Text) => cjkWrap(t, obj, w) };
  return scene.add.text(x, y, str, style).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
}

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export type ButtonStyle = 'red' | 'gold' | 'green' | 'wood' | 'blue';
const STYLE: Record<ButtonStyle, { fill: number; text: number; rim: number }> = {
  red: { fill: 0xc0282f, text: 0xfff3d6, rim: 0xf0c66e },
  gold: { fill: 0xe6b450, text: 0x4a2a0c, rim: 0xfff0c0 },
  green: { fill: 0x2f8a55, text: 0xf2fff4, rim: 0xb8e6c4 },
  wood: { fill: 0x7a4a26, text: 0xffeccb, rim: 0xd7a55b },
  blue: { fill: 0x2f68b0, text: 0xeef6ff, rim: 0xa8cdf5 },
};

/** 圆角按钮底板（带投影、上半高光、金边）。 */
export function drawPlate(g: Phaser.GameObjects.Graphics, w: number, h: number, fill: number, rim: number, r = 14, pressed = false): void {
  g.clear();
  const dy = pressed ? 2 : 0;
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
  g.fillStyle(shade(fill, 0.62), 1);
  g.fillRoundedRect(-w / 2, -h / 2 + 3 + dy, w, h - 3, r);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 4, r);
  g.fillStyle(0xffffff, 0.16);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 3 + dy, w - 8, (h - 4) * 0.42, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, rim, 0.9);
  g.strokeRoundedRect(-w / 2 + 1, -h / 2 + 1 + dy, w - 2, h - 6, r - 1);
}

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image | null = null;
  private enabledFlag = true;
  private styleName: ButtonStyle;
  readonly bw: number;
  readonly bh: number;
  onClick: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, style: ButtonStyle, onClick: () => void, iconKey?: string) {
    super(scene, x, y);
    this.bw = w;
    this.bh = h;
    this.styleName = style;
    this.onClick = onClick;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    const st = STYLE[style];
    const size = h >= 56 ? TYPE.title : TYPE.body;
    if (iconKey && scene.textures.exists(`icon:${iconKey}`)) {
      const isz = Math.round(h * 0.5);
      this.icon = scene.add.image(0, -2, `icon:${iconKey}`).setDisplaySize(isz, isz).setTint(st.text);
      this.add(this.icon);
    }
    this.label = text(scene, 0, -2, label, { size, color: st.text, bold: true, stroke: shade(st.fill, 0.5), strokeWidth: 3 });
    this.add(this.label);
    this.layoutContent();
    drawPlate(this.bg, w, h, st.fill, st.rim);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabledFlag && this.setScale(1.04));
    this.on('pointerout', () => {
      this.setScale(1);
      this.redraw(false);
    });
    this.on('pointerdown', () => {
      if (!this.enabledFlag) return;
      this.redraw(true);
    });
    this.on('pointerup', () => {
      this.redraw(false);
      if (!this.enabledFlag) return;
      audio.sfx('click');
      this.onClick();
    });
    scene.add.existing(this);
  }

  private layoutContent(): void {
    if (this.icon && this.label.text) {
      const iw = this.icon.displayWidth;
      const total = iw + 8 + this.label.width;
      this.icon.x = -total / 2 + iw / 2;
      this.label.x = this.icon.x + iw / 2 + 8 + this.label.width / 2;
    } else if (this.icon) {
      this.icon.x = 0;
    }
  }

  private redraw(pressed: boolean): void {
    const st = STYLE[this.enabledFlag ? this.styleName : 'wood'];
    const fill = this.enabledFlag ? st.fill : 0x5d5049;
    drawPlate(this.bg, this.bw, this.bh, fill, this.enabledFlag ? st.rim : 0x8a7d70, 14, pressed);
    const dy = pressed ? 2 : 0;
    this.label.y = -2 + dy;
    if (this.icon) this.icon.y = -2 + dy;
  }

  setText(s: string): this {
    this.label.setText(s);
    this.layoutContent();
    return this;
  }

  setEnabled(on: boolean): this {
    if (on === this.enabledFlag) return this;
    this.enabledFlag = on;
    const st = STYLE[this.styleName];
    this.label.setColor(css(on ? st.text : 0xb5aaa0));
    this.label.setStroke(css(on ? shade(st.fill, 0.5) : 0x3a302a), 3);
    this.icon?.setTint(on ? st.text : 0xb5aaa0);
    this.redraw(false);
    if (!on) this.setScale(1);
    return this;
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }
}

/** 圆形木质图标按钮（顶栏用）。 */
export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onClick: () => void, size = 48): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = size / 2;
  g.fillStyle(0x000000, 0.3).fillCircle(0, 3, r);
  g.fillStyle(0x4a2a14, 1).fillCircle(0, 0, r);
  g.fillStyle(0x6b3f20, 1).fillCircle(0, -1, r - 3);
  g.lineStyle(2, COLOR.gold, 0.85).strokeCircle(0, -1, r - 3);
  c.add(g);
  const img = scene.add.image(0, -1, `icon:${icon}`).setDisplaySize(size * 0.56, size * 0.56).setTint(0xffe9c2);
  c.add(img);
  c.setSize(size + 8, size + 8);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => c.setScale(1.08));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    audio.sfx('click');
    onClick();
  });
  c.setData('icon', img);
  return c;
}

/** 纸面面板：木框 + 金线 + 象牙底，可带红色标题飘带。原点在面板中心。 */
export function panel(scene: Phaser.Scene, w: number, h: number, title?: string): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4).fillRoundedRect(-w / 2 + 2, -h / 2 + 10, w, h, 22);
  g.fillStyle(0x4a2814, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  g.fillStyle(0x7a4a26, 1).fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 18);
  g.fillStyle(COLOR.paper, 1).fillRoundedRect(-w / 2 + 14, -h / 2 + 14, w - 28, h - 28, 12);
  g.lineStyle(2, COLOR.gold, 1).strokeRoundedRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 15);
  g.lineStyle(1.5, 0xe2c99a, 1).strokeRoundedRect(-w / 2 + 20, -h / 2 + 20, w - 40, h - 40, 9);
  c.add(g);
  if (title) {
    const tw = Math.max(220, title.length * 34 + 90);
    const rg = scene.add.graphics();
    const ty = -h / 2 + 4;
    rg.fillStyle(0x000000, 0.3).fillRoundedRect(-tw / 2, ty - 22 + 4, tw, 50, 12);
    rg.fillStyle(COLOR.redDark, 1).fillTriangle(-tw / 2 - 26, ty - 10, -tw / 2 + 6, ty - 18, -tw / 2 + 6, ty + 22);
    rg.fillTriangle(tw / 2 + 26, ty - 10, tw / 2 - 6, ty - 18, tw / 2 - 6, ty + 22);
    rg.fillStyle(COLOR.red, 1).fillRoundedRect(-tw / 2, ty - 22, tw, 48, 12);
    rg.lineStyle(2, COLOR.gold, 1).strokeRoundedRect(-tw / 2 + 4, ty - 18, tw - 8, 40, 9);
    c.add(rg);
    c.add(text(scene, 0, ty + 1, title, { size: TYPE.title, color: COLOR.goldLight, bold: true, font: 'title', stroke: COLOR.redDark, strokeWidth: 3 }));
  }
  return c;
}

export interface Modal {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  close: () => void;
}

/** 弹窗：半透明遮罩挡住下面的点击 + 居中面板；返回 close。 */
export function modal(scene: Phaser.Scene, w: number, h: number, title?: string, opts: { closeBtn?: boolean; onClose?: () => void; depth?: number } = {}): Modal {
  const W = worldW(scene);
  const root = scene.add.container(0, 0).setDepth(opts.depth ?? 5000);
  const dim = scene.add.graphics();
  dim.fillStyle(COLOR.overlay, 0.62).fillRect(0, 0, W, worldH);
  // 遮罩挡住下面的点击
  const block = scene.add.zone(0, 0, W, worldH).setOrigin(0, 0).setInteractive();
  root.add([dim, block]);
  const body = panel(scene, w, h, title);
  body.setPosition(W / 2, worldH / 2 + (title ? 10 : 0));
  root.add(body);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    scene.tweens.add({ targets: root, alpha: 0, duration: 120, onComplete: () => root.destroy() });
    opts.onClose?.();
  };
  if (opts.closeBtn !== false) {
    const cb = iconButton(scene, w / 2 - 6, -h / 2 + 6, 'close', close, 46);
    body.add(cb);
  }
  root.setAlpha(0);
  body.setScale(0.92);
  scene.tweens.add({ targets: root, alpha: 1, duration: 140 });
  scene.tweens.add({ targets: body, scale: 1, duration: 200, ease: 'Back.easeOut' });
  return { root, body, close };
}

/** 一句话短提示：在 (x,y) 浮出、停留、淡出。同一位置的旧提示先移除。 */
let lastToast: Phaser.GameObjects.Container | null = null;
export function toast(scene: Phaser.Scene, msg: string, x: number, y: number, color: number = COLOR.ink): void {
  if (lastToast?.scene) lastToast.destroy();
  const c = scene.add.container(x, y).setDepth(4000);
  const t = text(scene, 0, 0, msg, { size: TYPE.body, color: 0xfff6e0, bold: true });
  const w = t.width + 40;
  const g = scene.add.graphics();
  g.fillStyle(color === COLOR.ink ? 0x2a1a10 : color, 0.9).fillRoundedRect(-w / 2, -22, w, 44, 22);
  g.lineStyle(2, COLOR.gold, 0.8).strokeRoundedRect(-w / 2, -22, w, 44, 22);
  c.add([g, t]);
  c.setAlpha(0);
  lastToast = c;
  scene.tweens.add({ targets: c, alpha: 1, y: y - 8, duration: 160 });
  scene.tweens.add({ targets: c, alpha: 0, delay: 1500, duration: 300, onComplete: () => c.destroy() });
}

/** 对话气泡。dir 表示尾巴指向（说话人在哪边）。 */
/** 气泡的样子：plain 是平常说话；spicy 是嘲讽（0.6.0，红边、淡红底，一眼看出是在逗人） */
export type BubbleTone = 'plain' | 'spicy';
const BUBBLE: Record<BubbleTone, { fill: number; line: number; ink: number }> = {
  plain: { fill: 0xfffaf0, line: 0x5a3a20, ink: COLOR.ink },
  spicy: { fill: 0xffe4d8, line: 0xc8202a, ink: COLOR.redDark },
};

export function bubble(scene: Phaser.Scene, x: number, y: number, msg: string, dir: 'left' | 'right' | 'up' | 'down', tone: BubbleTone = 'plain'): Phaser.GameObjects.Container {
  const k = BUBBLE[tone];
  const c = scene.add.container(x, y).setDepth(3000);
  const t = text(scene, 0, 0, msg, { size: TYPE.label, color: k.ink, bold: true, wrap: 220 });
  const w = Math.max(56, t.width + 28);
  const h = t.height + 20;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 14);
  g.fillStyle(k.fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.lineStyle(2.5, k.line, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.fillStyle(k.fill, 1);
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
    g.fillTriangle(ax, ay, bx, by, cx, cy);
    g.lineStyle(2.5, k.line, 1).lineBetween(ax, ay, cx, cy).lineBetween(bx, by, cx, cy);
  };
  if (dir === 'left') tri(-w / 2 + 1, -8, -w / 2 + 1, 8, -w / 2 - 14, 4);
  else if (dir === 'right') tri(w / 2 - 1, -8, w / 2 - 1, 8, w / 2 + 14, 4);
  else if (dir === 'up') tri(-10, -h / 2 + 1, 10, -h / 2 + 1, -4, -h / 2 - 14);
  else tri(-10, h / 2 - 1, 10, h / 2 - 1, -4, h / 2 + 14);
  c.add([g, t]);
  c.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
  return c;
}

/** 开关/选项按钮组：一行若干个选项，当前项高亮。 */
export function segmented(
  scene: Phaser.Scene,
  x: number,
  y: number,
  items: { label: string; value: string }[],
  current: string,
  onPick: (v: string) => void,
  itemW = 104,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const btns: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; v: string }[] = [];
  const h = 44;
  const paint = (cur: string): void => {
    for (const b of btns) {
      const on = b.v === cur;
      b.g.clear();
      b.g.fillStyle(on ? COLOR.red : 0xeadbc0, 1).fillRoundedRect(-itemW / 2 + 3, -h / 2, itemW - 6, h, 12);
      b.g.lineStyle(2, on ? COLOR.gold : 0xc9b48e, 1).strokeRoundedRect(-itemW / 2 + 3, -h / 2, itemW - 6, h, 12);
      b.t.setColor(css(on ? COLOR.goldLight : COLOR.ink));
    }
  };
  items.forEach((it, i) => {
    const bx = i * itemW;
    const g = scene.add.graphics().setPosition(bx, 0);
    const t = text(scene, bx, 0, it.label, { size: TYPE.label, bold: true });
    const hit = scene.add.zone(bx, 0, itemW - 4, h).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      audio.sfx('click');
      paint(it.value);
      onPick(it.value);
    });
    btns.push({ g, t, v: it.value });
    c.add([g, t, hit]);
  });
  paint(current);
  return c;
}
