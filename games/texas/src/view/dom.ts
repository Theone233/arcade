/** 小工具：建元素、量位置。画面都是固定节点，状态变了只改属性和文字（DESIGN.md 8.1，不引框架）。 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** 改文字：一样就不动，免得无谓的重排 */
export function setText(e: Element, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function toggle(e: Element, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

/** 元素中心在舞台坐标里的位置（舞台按比例缩放过，要除回去） */
export function centerIn(e: Element, stage: HTMLElement, scale: number): { x: number; y: number } {
  const r = e.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - s.left) / scale, y: (r.top + r.height / 2 - s.top) / scale };
}
