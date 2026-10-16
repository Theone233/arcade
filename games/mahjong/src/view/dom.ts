/** 建 DOM 的小工具 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function button(cls: string, parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function clear(e: HTMLElement): void {
  e.replaceChildren();
}
