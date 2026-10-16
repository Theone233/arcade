import type Phaser from 'phaser';
import { APP_VERSION, BUILD_TIME } from '../../platform/version.ts';
import { isTouch } from '../input.ts';
import { ABOUT_CONTROLS, ABOUT_TOUCH_CONTROLS, aboutRules } from '../labels.ts';
import { COLOR } from '../theme.ts';
import { Button } from './button.ts';
import { Dialog } from './dialog.ts';
import { addText } from './text.ts';
import { phoneLayout } from '../viewport.ts';

const W = 700;
const PHONE_W = 920;

/** 关于：版本、原创声明、0.3 的玩法简介、操作与快捷键（触屏设备只列点击操作）。 */
export class AboutPanel extends Dialog {
  constructor(scene: Phaser.Scene) {
    // 手机横屏（960×444）放不下 580 高：改成两栏，左边版本和玩法，右边操作
    const phone = phoneLayout(scene);
    const w = phone ? PHONE_W : W;
    super(scene, w, phone ? 400 : 580, '关于《开盘》');
    const touch = isTouch();
    const built = BUILD_TIME ? BUILD_TIME.replace('T', ' ').slice(0, 16) : '开发版';
    const leftW = phone ? 500 : W - 64;
    this.inner.add([
      addText(scene, 32, 72, `版本 ${APP_VERSION} · 构建于 ${built}`, { size: 14 }),
      addText(scene, 32, 94, '画面和声音都是程序生成的原创内容；股票、群友、公司全是虚构的。', { size: 13, color: COLOR.muted, wrap: leftW }),
    ]);
    let y = 126;
    for (const line of aboutRules()) {
      const t = addText(scene, 32, y, line, { size: 14, color: COLOR.ink, wrap: leftW, lineSpacing: 4 });
      this.inner.add(t);
      y += t.height + 6;
    }
    y += 8;
    // 手机：操作列在右栏，从玩法同一高度开始
    const cx = phone ? 32 + leftW + 36 : 32;
    if (phone) y = 72;
    const keyW = phone ? 110 : 188;
    const descW = w - (cx + keyW) - 32;
    this.inner.add(addText(scene, cx, y, touch ? '操作' : '操作与快捷键', { size: 16, bold: true, color: COLOR.accentDark }));
    y += 28;
    for (const [key, desc] of touch ? ABOUT_TOUCH_CONTROLS : ABOUT_CONTROLS) {
      const k = addText(scene, cx, y, key, { size: 14, bold: true, wrap: keyW - 8 });
      const d = addText(scene, cx + keyW, y, desc, { size: 14, color: COLOR.muted, wrap: descW, lineSpacing: 2 });
      this.inner.add([k, d]);
      y += Math.max(k.height, d.height) + 6;
    }
    const ok = new Button(scene, w - 32 - 130, this.dh - 64, { width: 130, height: 44, label: '知道了', variant: 'primary', fontSize: 16 });
    ok.setHandler(() => this.close());
    this.inner.add(ok);
    this.named['about:ok'] = ok;
  }
}
