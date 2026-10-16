import { describe, expect, it } from 'vitest';
import { isIosSafari, zoomed } from '../src/platform/viewportFit.ts';

/** 0.5.9「添加到主屏幕」提示只给 iOS 上的 Safari：已经从主屏幕打开的、App 里的浏览器、别家浏览器都不提示。 */
describe('iOS Safari 判断', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  it('iPhone、报成 Mac 的 iPad 上的 Safari', () => {
    expect(isIosSafari(iphone, false, 5)).toBe(true);
    expect(isIosSafari(ipad, false, 5)).toBe(true);
  });
  it('已经从主屏幕打开、真的 Mac、iOS 上的 Chrome / 微信', () => {
    expect(isIosSafari(iphone, true, 5)).toBe(false);
    expect(isIosSafari(ipad, false, 0)).toBe(false);
    expect(isIosSafari(iphone.replace('Version/15.6', 'CriOS/120.0'), false, 5)).toBe(false);
    expect(isIosSafari(`${iphone} MicroMessenger/8.0.40`, false, 5)).toBe(false);
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', false, 5)).toBe(false);
  });
});

describe('双指放大', () => {
  it('scale 明显不是 1 才算放大着', () => {
    expect(zoomed(undefined)).toBe(false);
    expect(zoomed(1)).toBe(false);
    expect(zoomed(1.01)).toBe(false);
    expect(zoomed(2)).toBe(true);
    expect(zoomed(0.5)).toBe(true);
  });
});
