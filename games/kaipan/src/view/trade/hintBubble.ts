import Phaser from 'phaser';
import { CAT_HINT_KEY, hasArt } from '../assets.ts';
import type { Animator } from '../fx/anim.ts';
import type { Rect } from '../rect.ts';
import { COLOR } from '../theme.ts';
import { addImage } from '../ui/art.ts';
import { MIN_TEXT_SIZE, addText } from '../ui/text.ts';
import { shortHint } from '../labels.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { HINT_AREA } from './layout.ts';

/** 新手提示的位置：看板和显示器之间、桌面上方（不挡持仓卡和开盘按钮）。 */
const HINT_RECT: Rect = HINT_AREA;
const CAT = 52;

/**
 * 开盘前猫说的一句话（今天的第一建议，字比别处大）：左下角猫头像，上面一个对话气泡。点 × 关掉（只关今天这句）。
 * 猫头像缺素材时画一个橘色圆脸。
 */
export class HintBubble {
  private readonly scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  private text = '';
  private closedDay = -1;
  private onClose: (() => void) | null = null;
  /** 0.5.5 手机：小结卡占着左下角时先藏起来（提示还在，收起小结就露出来） */
  private suppressed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 显示（同一句不重画）；day 用来记住"今天已经关掉了"。 */
  show(text: string, day: number, anim: Animator | null, onClose?: () => void, header = '今天先看这条 · 猫的建议', full = false): void {
    if (this.closedDay === day) return this.hide();
    if (this.root && this.text === text) return;
    this.hide();
    this.text = text;
    this.onClose = onClose ?? null;
    const s = this.scene;
    const { x, y, w, h } = HINT_RECT;
    const root = s.add.container(0, 0).setDepth(40);
    // 0.5：气泡里只放一句短话（≤16 字），整句和来历在悬停提示里
    // 新玩法的说明要整句看完（截成 16 字会把关键那半句截掉）：字号从 15 往下缩到放得下为止
    const room = h - CAT + 4 - 40;
    const t = addText(s, 0, 0, full ? text : shortHint(text), { size: 15, bold: true, color: COLOR.ink, wrap: w - 28, lineSpacing: 3 });
    for (let size = 14; full && t.height > room && size >= Math.max(12, MIN_TEXT_SIZE); size--) t.setFontSize(size);
    // 0.5.1：气泡顶上找回小标题（谁在说：猫 / 新手提示），用小字 + 色点
    const bh = Math.min(h - CAT + 4, t.height + 40);
    const by = y + h - CAT - bh + 8;
    const bubble = s.add.rectangle(x, by, w, bh, 0xfffbe8).setOrigin(0, 0).setRounded(12).setStrokeStyle(2.5, COLOR.ink, 1);
    const tail = s.add.triangle(0, 0, x + 18, by + bh - 1, x + 34, by + bh - 1, x + 22, by + bh + 12, 0xfffbe8).setOrigin(0, 0);
    const tailLine = s.add.graphics().lineStyle(2.5, COLOR.ink, 1).strokePoints([new Phaser.Math.Vector2(x + 18, by + bh), new Phaser.Math.Vector2(x + 22, by + bh + 12), new Phaser.Math.Vector2(x + 34, by + bh)]);
    t.setPosition(x + 12, by + 28);
    const dot = s.add.circle(x + 17, by + 15, 4, COLOR.accent);
    const who = addText(s, x + 26, by + 15, header, { size: 11, bold: true, color: COLOR.accentDark, originY: 0.5 });
    const close = addText(s, x + w - 10, by + 4, '×', { size: 18, color: COLOR.muted, originX: 1 }).setInteractive({ useHandCursor: true });
    close.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.closedDay = day;
      this.hide();
      this.onClose?.();
    });
    const cx = x + 14 + CAT / 2;
    const cy = y + h - CAT / 2 + 6;
    const cat = hasArt(s.textures, CAT_HINT_KEY)
      ? [addImage(s, cx, cy, CAT_HINT_KEY, CAT)]
      : [s.add.circle(cx, cy, CAT / 2 - 2, 0xf3a54a).setStrokeStyle(2.5, COLOR.ink, 1), addText(s, cx, cy, '喵', { size: 16, bold: true, color: COLOR.ink, originX: 0.5, originY: 0.5 })];
    root.add([bubble, tail, tailLine, dot, who, t, close, ...cat]);
    const hit = s.add.rectangle(x, by, w, bh, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => ({ x, y: by, w, h: bh }), () => ({ title: header, body: `${text}\n\n猫只看公开的信息（看板、推荐、你的持仓）随口一说，不保证对。不想看可以在设置里关掉。` }));
    root.addAt(hit, 1);
    root.setVisible(!this.suppressed);
    this.root = root;
    if (anim && !anim.calm) {
      root.setAlpha(0);
      anim.fx({ targets: root, alpha: 1, duration: 220 }, () => root.setAlpha(1));
    }
  }

  hide(): void {
    this.root?.destroy();
    this.root = null;
    this.text = '';
  }

  setSuppressed(on: boolean): void {
    this.suppressed = on;
    this.root?.setVisible(!on);
  }

  get visible(): boolean {
    return this.root !== null;
  }

  /** 气泡占的区域（教程气泡要避开它；没显示时为 null）。 */
  rect(): Rect | null {
    return this.root && !this.suppressed ? { ...HINT_RECT } : null;
  }

  get shownText(): string {
    return this.root ? this.text : '';
  }
}
