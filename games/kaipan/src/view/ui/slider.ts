import Phaser from 'phaser';
import { sound } from '../sound.ts';
import { COLOR, PHONE } from '../theme.ts';

const KNOB_R = 9;
/** 点击区域的高：手机上抬到 40，手指好按 */
const HIT_H = PHONE ? 40 : 28;

/** 水平滑条（0..1）；拖动或点击轨道改变数值，松手时发一次提交回调。坐标为左上角。 */
export class Slider extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly sw: number;
  private value: number;
  private dragging = false;
  private readonly onChange: (v: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, value: number, onChange: (v: number) => void) {
    super(scene, x, y);
    this.sw = w;
    this.value = value;
    this.onChange = onChange;
    const track = scene.add.rectangle(0, -3, w, 6, COLOR.edge).setOrigin(0, 0).setRounded(3);
    this.fill = scene.add.rectangle(0, -3, 0, 6, COLOR.accent).setOrigin(0, 0).setRounded(3);
    this.knob = scene.add.circle(0, 0, KNOB_R, COLOR.paperHi).setStrokeStyle(2.5, COLOR.ink, 1);
    const hit = scene.add.rectangle(-KNOB_R, -HIT_H / 2, w + 2 * KNOB_R, HIT_H, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setFromPointer(p);
    });
    const move = (p: Phaser.Input.Pointer): void => {
      if (this.dragging) this.setFromPointer(p);
    };
    const up = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      sound.ui('select');
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, move);
    scene.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, move);
      scene.input.off(Phaser.Input.Events.POINTER_UP, up);
    });
    this.add([track, this.fill, this.knob, hit]);
    this.redraw();
    scene.add.existing(this);
  }

  private setFromPointer(p: Phaser.Input.Pointer): void {
    const left = this.getWorldTransformMatrix().tx;
    const v = Math.min(1, Math.max(0, (p.worldX - left) / this.sw));
    const stepped = Math.round(v * 20) / 20;
    if (stepped === this.value) return;
    this.value = stepped;
    this.redraw();
    this.onChange(stepped);
  }

  private redraw(): void {
    this.fill.setSize(Math.max(0.01, this.sw * this.value), 6);
    this.knob.x = this.sw * this.value;
  }
}
