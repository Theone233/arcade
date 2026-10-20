/** 建 DOM 的小工具 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** 弹一个确认框（遮罩 + 纸片），回 true 是点了 yes */
export function confirmBox(host: HTMLElement, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((done) => {
    const mask = el('div', 'dl-mask confirm', host);
    const card = el('div', 'dl-card', mask);
    el('p', 'dl-card-text', card, text);
    const row = el('div', 'dl-card-row', card);
    const close = (v: boolean): void => {
      mask.remove();
      done(v);
    };
    el('button', 'dl-btn soft', row, no).addEventListener('click', () => close(false));
    el('button', 'dl-btn go', row, yes).addEventListener('click', () => close(true));
  });
}
