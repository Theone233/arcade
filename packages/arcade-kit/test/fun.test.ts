/**
 * 好玩素材（0.7.0）：素材是自己画的 SVG（不用 emoji 字体、不引外部资源），抛物线、名额上限、污渍最多叠 3 层。
 * 这里在 workerd 里跑，没有真的 DOM：图层用一个最小的假元素（没有 animate，动画按时长等），只看播放的账。
 */
import { describe, expect, it } from 'vitest';
import { MAX_PLAYING, MAX_STAINS, PROPS, STICKERS, arcPoints, centerIn, playingCount, propSvg, stickerSvg, throwAt, type FunLayer } from '../src/fun.ts';

class FakeEl {
  style: Record<string, unknown> & { setProperty(k: string, v: string): void } = { cssText: '', setProperty: () => {} };
  classList = { contains: () => false };
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  innerHTML = '';
  className = '';
  constructor(readonly ownerDocument: { createElement(): FakeEl }) {}
  appendChild(c: FakeEl): FakeEl {
    this.children.push(c);
    c.parent = this;
    return c;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }
}

function fakeLayer(): { layer: FunLayer; root: FakeEl } {
  const doc = { createElement: (): FakeEl => new FakeEl(doc) };
  const root = new FakeEl(doc);
  return { layer: { el: root as unknown as HTMLElement, hide() {}, show() {}, destroy() {} }, root };
}

const rect = (x: number, y: number) => ({ left: x, top: y, width: 80, height: 80 });

describe('素材', () => {
  it('表情 12 个、道具 8 个，名字不重复；都是自己画的 SVG：没有文字、外部引用、非 ASCII 字符', () => {
    expect(STICKERS).toHaveLength(12);
    expect(PROPS).toHaveLength(8);
    expect(new Set([...STICKERS, ...PROPS]).size).toBe(20);
    const all = [...STICKERS.map(stickerSvg), ...PROPS.map(propSvg)];
    for (const svg of all) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/<text|<image|<script|href=|url\(|<foreignObject/i);
      expect([...svg].every((c) => c.charCodeAt(0) < 128)).toBe(true);
      expect((svg.match(/"/g) ?? []).length % 2).toBe(0);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it('抛物线：首尾是起点终点，中间比两头都高；屏幕矩形换算成图层里的中心', () => {
    const pts = arcPoints({ x: 0, y: 300 }, { x: 400, y: 300 }, 9);
    expect(pts[0]).toEqual({ x: 0, y: 300 });
    expect(pts[8]).toEqual({ x: 400, y: 300 });
    expect(pts[4]!.y).toBeLessThan(300 - 50);
    expect(centerIn({ left: 110, top: 220, width: 80, height: 60 }, { x: 10, y: 20 })).toEqual({ c: { x: 140, y: 230 }, s: 60 });
  });
});

describe('播放的账', () => {
  it(`同时最多 ${MAX_PLAYING} 个，多的直接丢掉；同一个头像的污渍最多 ${MAX_STAINS} 层；播完名额还回来`, async () => {
    const { layer, root } = fakeLayer();
    const runs = Array.from({ length: MAX_PLAYING }, () => throwAt(layer, rect(0, 400), rect(600, 100), 'tomato'));
    expect(playingCount(layer)).toBe(MAX_PLAYING);
    expect(await throwAt(layer, rect(0, 400), rect(600, 100), 'egg')).toBe(false);
    expect(await Promise.all(runs)).toEqual([true, true, true, true]);
    expect(playingCount(layer)).toBe(0);
    // 污渍组（will-change:opacity 的容器）还挂着，但最多 3 层
    const stains = root.children.filter((c) => String(c.style.cssText).includes('will-change:opacity'));
    expect(stains.length).toBe(MAX_STAINS);
  }, 10_000);
});
