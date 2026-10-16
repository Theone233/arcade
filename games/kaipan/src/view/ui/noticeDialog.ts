import type Phaser from 'phaser';
import { COLOR, TYPE } from '../theme.ts';
import { Button } from './button.ts';
import { Dialog } from './dialog.ts';
import { addText } from './text.ts';

const W = 520;

/** 一段提示（读档提示等）：标题、正文、「知道了」。 */
export class NoticeDialog extends Dialog {
  constructor(scene: Phaser.Scene, title: string, body: string, onClosed?: () => void) {
    super(scene, W, 260, title, onClosed);
    this.inner.add(addText(scene, 32, 80, body, { size: TYPE.label + 2, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    this.actions({ label: '知道了', hotkey: 'Esc', name: 'notice:ok', onClick: () => this.close() });
  }
}

/** 确认框：正文 + 「确认 / 取消」。Esc 等于取消，回车等于确认。 */
export class ConfirmDialog extends Dialog {
  constructor(scene: Phaser.Scene, title: string, body: string, okLabel: string, onOk: () => void, onCancel?: () => void) {
    let decided = false;
    super(scene, W, 260, title, () => {
      if (!decided) onCancel?.();
    });
    this.inner.add(addText(scene, 32, 80, body, { size: TYPE.label + 2, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    const { primary } = this.actions(
      {
        label: okLabel,
        hotkey: '回车',
        name: 'confirm:ok',
        onClick: () => {
          decided = true;
          this.close();
          onOk();
        },
      },
      { label: '取消', hotkey: 'Esc', name: 'confirm:cancel', onClick: () => this.close() },
    );
    const ok = primary as Button;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') ok.press();
    };
    scene.input.keyboard?.on('keydown', onKey);
    this.once('destroy', () => scene.input.keyboard?.off('keydown', onKey));
  }
}

/** 二选一（0.6.0 实盘没打完时开别的局：继续这局 / 提前收手）：两个按钮各有去处，Esc 或 × 什么都不做。 */
export class ChoiceDialog extends Dialog {
  constructor(scene: Phaser.Scene, title: string, body: string, primary: { label: string; name: string; onClick: () => void }, secondary: { label: string; name: string; onClick: () => void }) {
    super(scene, W, 260, title);
    this.inner.add(addText(scene, 32, 80, body, { size: TYPE.label + 2, color: COLOR.ink, wrap: W - 64, lineSpacing: 6 }));
    const go = (fn: () => void) => (): void => {
      this.close();
      fn();
    };
    this.actions({ label: primary.label, name: primary.name, onClick: go(primary.onClick) }, { label: secondary.label, name: secondary.name, onClick: go(secondary.onClick) });
  }
}
