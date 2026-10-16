/**
 * 弹窗：确认框、结算、规则。同一时间只有一个；打开时把 kit 的好玩图层藏起来（它在舞台外面，z-index 夹不到中间，见 kit README）。
 */
import { button, el } from './dom.ts';

let current: HTMLElement | null = null;
let hooks: { open(): void; close(): void } = { open() {}, close() {} };

export function dialogHooks(h: { open(): void; close(): void }): void {
  hooks = h;
}

export function closeDialog(): void {
  if (!current) return;
  current.remove();
  current = null;
  hooks.close();
}

/** 开一个弹窗，内容由 fill 画；返回内容盒子 */
export function dialog(parent: HTMLElement, cls: string, fill: (box: HTMLElement) => void, closable = true): HTMLElement {
  closeDialog();
  const mask = el('div', `mask ${cls}`, parent);
  const box = el('div', 'dialog', mask);
  if (closable) {
    button('x', box, '×', closeDialog);
    mask.addEventListener('click', (e) => e.target === mask && closeDialog());
  }
  fill(box);
  current = mask;
  hooks.open();
  return box;
}

export function confirmBox(parent: HTMLElement, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    dialog(
      parent,
      'confirm',
      (box) => {
        el('p', '', box, text);
        const row = el('div', 'row', box);
        button('act soft', row, no, () => {
          closeDialog();
          resolve(false);
        });
        button('act go', row, yes, () => {
          closeDialog();
          resolve(true);
        });
      },
      false,
    );
  });
}
