/**
 * 0.4 重做：开局时按种子抽一段真实行情（只下载抽中的那一段）。下载失败、格式不对时返回 null，
 * 由 Session 退回 0.3 的合成行情并提示一句。
 */
import { THEME_IDS, checkSegment, hashSeed, pickSegmentId, type Segment, type SegmentIndex } from '../core/index.ts';

const BASE = `${import.meta.env.BASE_URL ?? '/'}data/segments/`;
let index: Promise<SegmentIndex | null> | null = null;
const cache = new Map<string, Segment>();

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function loadIndex(): Promise<SegmentIndex | null> {
  index ??= getJson(`${BASE}index.json`, 8000)
    .then((raw) => {
      const x = raw as SegmentIndex;
      return x && x.v === 1 && Array.isArray(x.segments) && x.segments.length > 0 ? x : null;
    })
    .catch((err: unknown) => {
      console.warn('行情段目录加载失败：', err);
      index = null;
      return null;
    });
  return index;
}

/**
 * 按种子抽一段并下载；同一种子总是同一段。force 指定段 id（调试、每日挑战）：
 * 每日挑战传 dailySegmentId(日期)，只在冻结的段池里抽，段库加了新段也还是同一段，大家打的是同一局。
 */
export async function segmentFor(seed: string, force: string | null = null): Promise<Segment | null> {
  const idx = await loadIndex();
  if (!idx) return null;
  const id = force ?? pickSegmentId(seed, idx.segments.map((s) => s.id), hashSeed);
  const entry = idx.segments.find((s) => s.id === id);
  if (!entry) return null;
  const hit = cache.get(entry.id);
  if (hit) return hit;
  try {
    const raw = await getJson(`${BASE}${entry.file}`, 10000);
    const bad = checkSegment(raw, THEME_IDS);
    if (bad) throw new Error(`行情段 ${entry.id} 格式不对：${bad}`);
    const seg = raw as Segment;
    cache.set(seg.id, seg);
    return seg;
  } catch (err) {
    console.warn('行情段加载失败：', err);
    return null;
  }
}

/** 页面上方的提示条（"正在挑选行情……"、退回合成行情的提示）；返回关闭函数。 */
export function showBanner(text: string, ms = 0): () => void {
  const el = document.createElement('div');
  el.className = 'kp-banner';
  el.textContent = text;
  el.style.cssText =
    // 放在顶栏下面：交易画面顶栏上有账户和要还的钱，提示条不要盖住它们
    'position:fixed;left:50%;top:calc(10vh + 4px);transform:translateX(-50%);z-index:50;padding:10px 22px;border-radius:999px;' +
    'background:rgba(40,32,24,.88);color:#fff8ec;font:600 16px/1.4 system-ui,"Noto Sans CJK SC","PingFang SC",sans-serif;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;';
  document.body.appendChild(el);
  const close = (): void => el.remove();
  if (ms > 0) setTimeout(close, ms);
  return close;
}
