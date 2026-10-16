import { describe, expect, it } from 'vitest';
import { frameName, normalizeAtlas } from '../src/view/assets.ts';

describe('图集', () => {
  const frame = (filename: string, extra: Record<string, unknown> = {}) => ({ filename, frame: { x: 0, y: 0, w: 10, h: 10 }, ...extra });

  it('帧名 = 相对 v3 的路径去掉 .svg', () => {
    expect(frameName({ path: 'assets/art/v3/stocks/ai_leader/blink.svg' })).toBe('stocks/ai_leader/blink');
    expect(frameName({ path: 'assets/art/v3/items/longtou.svg' })).toBe('items/longtou');
  });

  it('multiatlas：多页、带倍数，去掉锚点', () => {
    const a = normalizeAtlas({ textures: [{ image: 'atlas-0.png', scale: 2, frames: [frame('items/longtou', { anchor: { x: 0.5, y: 0.5 } })] }, { image: 'atlas-1.png', frames: [frame('fx/flame.svg')] }] });
    expect(a?.pages.length).toBe(2);
    expect(a?.scale).toBe(2);
    expect(a?.pages[0]?.frames[0]).not.toHaveProperty('anchor');
    expect(a?.pages[1]?.frames[0]?.filename).toBe('fx/flame');
  });

  it('JSON Hash 单页', () => {
    const a = normalizeAtlas({ frames: { 'ui/tag_pill': { frame: { x: 1, y: 2, w: 3, h: 4 } } }, meta: { image: 'a.png', scale: '2' } });
    expect(a?.pages[0]?.frames[0]?.filename).toBe('ui/tag_pill');
    expect(a?.scale).toBe(2);
  });

  it('认不出的格式返回 null（回退到单独的 SVG）', () => {
    expect(normalizeAtlas(null)).toBeNull();
    expect(normalizeAtlas('<!doctype html>')).toBeNull();
    expect(normalizeAtlas({ frames: {} })).toBeNull();
    expect(normalizeAtlas({ textures: [] })).toBeNull();
  });
});
