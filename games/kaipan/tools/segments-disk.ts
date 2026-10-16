/**
 * 机器人、模拟、测试用：从 public/data/segments 读行情段（画面层走 fetch，见 src/view/segments.ts）。
 */
import { readFileSync } from 'node:fs';
import { hashSeed, pickSegmentId, type Segment, type SegmentIndex } from '../src/core/index.ts';

const DIR = 'public/data/segments';
let index: SegmentIndex | null = null;
const cache = new Map<string, Segment>();

export function segmentIndex(): SegmentIndex {
  index ??= JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
  return index;
}

/** 段 id ↔ "年-月-市况" key 的对照（tools/data/segments-manifest.json，段文件里没有年份）。 */
let manifest: { id: string; key: string }[] | null = null;

/** 接受段 id（seg_xxx）或数据工具里的 key（2008-10-crash），返回段 id。 */
function segmentId(idOrKey: string): string {
  manifest ??= JSON.parse(readFileSync('tools/data/segments-manifest.json', 'utf8')) as { id: string; key: string }[];
  return manifest.find((m) => m.key === idOrKey)?.id ?? idOrKey;
}

export function loadSegment(idOrKey: string): Segment {
  const id = segmentId(idOrKey);
  let s = cache.get(id);
  if (!s) {
    const e = segmentIndex().segments.find((x) => x.id === id);
    if (!e) throw new Error(`没有这个行情段：${id}`);
    s = JSON.parse(readFileSync(`${DIR}/${e.file}`, 'utf8')) as Segment;
    cache.set(id, s);
  }
  return s;
}

/** 和画面层一样按种子抽段。 */
export function segmentForSeed(seed: string): Segment {
  const id = pickSegmentId(seed, segmentIndex().segments.map((x) => x.id), hashSeed);
  if (!id) throw new Error('行情段目录是空的');
  return loadSegment(id);
}
