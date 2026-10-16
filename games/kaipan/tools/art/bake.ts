/**
 * v3 图集烘焙：把 public/assets/art/v3/ 下的小件 SVG 按 2× 栅格化、裁透明边、装箱成 Phaser multiatlas。
 *
 *   node tools/art/bake.ts               全量烘焙，只重写内容有变化的文件
 *   node tools/art/bake.ts --check       只比较不写盘；有变化时退出码 1
 *   node tools/art/bake.ts --list        只列出纳入的 SVG 与 frame 名，不渲染
 *   node tools/art/bake.ts --jobs 4      并行渲染的浏览器页数（默认 min(4, CPU 数)）
 *   node tools/art/bake.ts --png         改输出 PNG（RGB 量化到 6 bit，见 QUANT_STEP）；默认输出 WebP 近无损
 *   node tools/art/bake.ts --png --lossless   输出无损 PNG
 *
 * 输出 public/assets/art/v3/atlas/ 两套 Phaser multiatlas（JSON Array 格式）：
 *   game.json + game-N.webp（对局用，首屏加载）、meta.json + meta-N.webp（长线界面用，按需加载），分组见 GROUPS。
 * 写盘是原子的：页图与 json 都先写临时文件再改名，且先写页图、后写 json、最后删多余旧页。
 * 用法与命名规则见该目录 README.md。
 * 是否需要重写某页按"未编码的整页像素"的 sha256 判断（记在 game.json / meta.json 的 meta.pageHashes），而不是比较编码后的
 * 字节：WebP 由 Chromium canvas 编码，换 Chromium 版本字节可能不同，但像素没变就不会重写，--check 也照此判断。
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { availableParallelism } from 'node:os';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = new URL('../../', import.meta.url).pathname;
const V3 = `${ROOT}public/assets/art/v3/`;
const OUT = `${V3}atlas/`;

/** 烘焙倍率：输出像素 = SVG 原生尺寸 × SCALE */
const SCALE = 2;
/** 单页上限 */
const PAGE = 2048;
/** 帧四周各留 1px：贴着原画布边缘的一侧外扩边缘像素，被裁掉的一侧保持透明 */
const GUTTER = 1;
/** 相邻帧外圈之间再空 2px 透明 */
const SPACING = 2;
/** 除 stocks/<id>/*.svg 外整目录（递归）纳入的子目录；不存在就跳过 */
const DIRS = ['items', 'avatars', 'achievements', 'difficulty', 'personas', 'guide', 'ui', 'fx', 'themes', 'chat'];
/** 不进图集、保持单独文件的大件（2× 后单张就占半页以上，放进来会多出一页） */
const EXCLUDE = new Set(['chat/phone_frame.svg']);
/**
 * 分两套图集，按需加载：
 *   game：对局用（股票表情与眨眼、道具、群友头像、fx、themes、chat、对局 ui）——首屏加载
 *   meta：长线界面用（personas、difficulty、achievements、guide 说明书插图、ui/codex_*、ui/progress_*、ui/rotate_phone）——进对应界面再载
 * 规则：下面 META 命中的归 meta，其余全部归 game。
 */
const GROUPS = ['game', 'meta'] as const;
type Group = (typeof GROUPS)[number];
const META = [/^personas\//, /^difficulty\//, /^achievements\//, /^guide\//, /^ui\/codex_/, /^ui\/progress_/, /^ui\/rotate_phone$/];
function groupOf(frame: string): Group {
  return META.some((r) => r.test(frame)) ? 'meta' : 'game';
}
/** 九宫格 / 平铺素材所在目录：不裁边，帧保持整幅画布（Phaser NineSlice 不支持 trimmed 帧） */
const NO_TRIM = new Set(['ui', 'chat']);
/** 每次 page.evaluate 渲染的 SVG 数 */
const BATCH = 8;
/**
 * 默认有损压缩：alpha > 0 的像素 RGB 各通道四舍五入到 QUANT_STEP 的倍数（6 bit），alpha 不动。
 * 颗粒滤镜让无损 PNG 很难压缩，量化后体积约小三分之一，最大误差 2/255，肉眼不可见。仅 --png 时使用，--png --lossless 关闭；WebP 默认不量化。
 */
const QUANT_STEP = 4;

/** 原地量化整页 RGB（确定性）；全透明像素保持 0 */
function quantize(buf: Uint8Array, step: number): Uint8Array {
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    for (let k = i; k < i + 3; k++) buf[k] = Math.min(255, Math.round((buf[k] as number) / step) * step);
  }
  return buf;
}

interface Src {
  /** frame 名：相对 v3/ 的路径去掉 .svg */
  name: string;
  /** 根元素宽高改成 2× 后的 SVG 文本 */
  svg: string;
  /** SVG 原生尺寸（显示尺寸） */
  dw: number;
  dh: number;
  /** 栅格尺寸 = 原生 × SCALE */
  pw: number;
  ph: number;
  trim: boolean;
}

interface Sprite extends Src {
  /** 裁边后的包围盒（栅格像素坐标） */
  tx: number;
  ty: number;
  tw: number;
  th: number;
  rgba: Uint8Array;
  page: number;
  /** 帧左上角在页内的位置 */
  x: number;
  y: number;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function list(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[]).map((p) => p.split('\\').join('/'));
}

/** 按目录扫描纳入的 SVG（相对 v3/ 的路径，已排序） */
function scan(): string[] {
  const out: string[] = [];
  for (const p of list(`${V3}stocks`)) {
    const seg = p.split('/');
    // 只取 stocks/<id>/*.svg 顶层合成图，不含 parts/**
    if (seg.length === 2 && p.endsWith('.svg')) out.push(`stocks/${p}`);
  }
  for (const d of DIRS) {
    for (const p of list(V3 + d)) if (p.endsWith('.svg') && !EXCLUDE.has(`${d}/${p}`)) out.push(`${d}/${p}`);
  }
  return out.sort(cmp);
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`).exec(tag);
  return m ? (m[2] ?? null) : null;
}

/** 读 SVG、取原生尺寸，并把根 <svg> 的 width/height 改写成 2×（保留 viewBox），让矢量按 2× 重新栅格化 */
function prepare(rel: string): Src {
  const text = readFileSync(V3 + rel, 'utf8');
  const m = /<svg\b[^>]*>/.exec(text);
  if (!m) throw new Error(`${rel}: 找不到根 <svg>`);
  const tag = m[0];
  const px = (v: string | null): number => (v !== null && /^\s*[0-9.]+\s*(px)?\s*$/.test(v) ? parseFloat(v) : NaN);
  let dw = px(attr(tag, 'width'));
  let dh = px(attr(tag, 'height'));
  const vb = attr(tag, 'viewBox');
  if (!(dw > 0 && dh > 0)) {
    const n = (vb ?? '').trim().split(/[\s,]+/).map(Number);
    if (n.length !== 4 || !((n[2] ?? 0) > 0 && (n[3] ?? 0) > 0)) throw new Error(`${rel}: 根元素既无 width/height 也无可用 viewBox`);
    dw = n[2] as number;
    dh = n[3] as number;
  }
  const pw = Math.round(dw * SCALE);
  const ph = Math.round(dh * SCALE);
  let t = tag.replace(/\s(width|height)\s*=\s*(["']).*?\2/g, '');
  const extra = ` width="${pw}" height="${ph}"${vb === null ? ` viewBox="0 0 ${dw} ${dh}"` : ''}`;
  t = t.replace(/^<svg\b/, `<svg${extra}`);
  const svg = text.slice(0, m.index) + t + text.slice(m.index + tag.length);
  return { name: rel.slice(0, -4), svg, dw, dh, pw, ph, trim: !NO_TRIM.has(rel.split('/')[0] ?? '') };
}

/** 页内渲染：SVG 作为 data URL 图片画进 CPU canvas，取回非预乘 RGBA（base64） */
async function renderBatch(page: Page, items: readonly Src[]): Promise<string[]> {
  return page.evaluate(async (list: { url: string; w: number; h: number }[]) => {
    const toB64 = (u8: Uint8ClampedArray): string => {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return Promise.all(
      list.map(async (it) => {
        const img = new Image();
        img.src = it.url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = it.w;
        c.height = it.h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas 2d 不可用');
        ctx.drawImage(img, 0, 0, it.w, it.h);
        return toB64(ctx.getImageData(0, 0, it.w, it.h).data);
      }),
    );
  }, items.map((s) => ({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`, w: s.pw, h: s.ph })));
}

async function renderAll(browser: Browser, srcs: readonly Src[], jobs: number): Promise<Uint8Array[]> {
  const out: Uint8Array[] = new Array(srcs.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    try {
      while (next < srcs.length) {
        const start = next;
        next = Math.min(srcs.length, next + BATCH);
        const batch = srcs.slice(start, next);
        let b64: string[];
        try {
          b64 = await renderBatch(page, batch);
        } catch (err) {
          throw new Error(`渲染失败（${batch.map((s) => s.name).join(', ')}）：${err instanceof Error ? err.message : String(err)}`);
        }
        b64.forEach((s, i) => {
          const src = srcs[start + i] as Src;
          const px = Buffer.from(s, 'base64');
          if (px.length !== src.pw * src.ph * 4) throw new Error(`${src.name}: 像素长度不符`);
          out[start + i] = px;
        });
        done += batch.length;
        if (done % 128 < batch.length || done === srcs.length) console.log(`  渲染 ${done}/${srcs.length}`);
      }
    } finally {
      await ctx.close();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, srcs.length)) }, worker));
  return out;
}

/** alpha > 0 的包围盒；全透明时返回左上角 1×1 */
function bbox(px: Uint8Array, w: number, h: number): [number, number, number, number] {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (px[row + x * 4 + 3] !== 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return [0, 0, 1, 1];
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// ---------- MaxRects 装箱（Best Short Side Fit，确定性） ----------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class MaxRects {
  free: Rect[];
  constructor(w: number, h: number) {
    this.free = [{ x: 0, y: 0, w, h }];
  }

  insert(w: number, h: number): Rect | null {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of this.free) {
      if (f.w < w || f.h < h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (
        short < bestShort ||
        (short === bestShort && long < bestLong) ||
        (short === bestShort && long === bestLong && best !== null && (f.y < best.y || (f.y === best.y && f.x < best.x)))
      ) {
        best = { x: f.x, y: f.y, w, h };
        bestShort = short;
        bestLong = long;
      }
    }
    if (best) this.place(best);
    return best;
  }

  private place(r: Rect): void {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    // 去掉被其他空闲矩形包含的（相同的只留第一个）
    this.free = next.filter((a, i) =>
      !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || j < i)),
    );
  }
}

/** 装箱，返回每页尺寸；sprite.page/x/y 原地写入 */
function pack(sprites: Sprite[]): { w: number; h: number }[] {
  const box = (s: Sprite): [number, number] => [s.tw + 2 * GUTTER + SPACING, s.th + 2 * GUTTER + SPACING];
  for (const s of sprites) {
    const [bw, bh] = box(s);
    if (bw > PAGE + SPACING || bh > PAGE + SPACING) throw new Error(`${s.name}: 裁边后 ${s.tw}×${s.th} 超出单页 ${PAGE}`);
  }
  // 大的先放：长边、高、宽降序，最后按名字，保证顺序确定
  let rest = [...sprites].sort((a, b) => {
    const [aw, ah] = box(a);
    const [bw, bh] = box(b);
    return Math.max(bw, bh) - Math.max(aw, ah) || bh - ah || bw - aw || cmp(a.name, b.name);
  });
  const pages: { w: number; h: number }[] = [];
  while (rest.length > 0) {
    // 画布多算 SPACING：最右 / 最下一列帧外侧的间隔可以落在页外
    const bin = new MaxRects(PAGE + SPACING, PAGE + SPACING);
    const left: Sprite[] = [];
    let w = 0;
    let h = 0;
    for (const s of rest) {
      const [bw, bh] = box(s);
      const r = bin.insert(bw, bh);
      if (!r) {
        left.push(s);
        continue;
      }
      s.page = pages.length;
      s.x = r.x + GUTTER;
      s.y = r.y + GUTTER;
      w = Math.max(w, r.x + bw - SPACING);
      h = Math.max(h, r.y + bh - SPACING);
    }
    // 非最后一页保持满尺寸，最后一页收缩到实际用到的尺寸
    pages.push(left.length > 0 ? { w: PAGE, h: PAGE } : { w, h });
    rest = left;
  }
  return pages;
}

/** 把帧拷进页面；贴原画布边缘的一侧外扩 1px 边缘像素，被裁掉的一侧留透明 */
function compose(sprites: readonly Sprite[], pi: number, pw: number, ph: number): Uint8Array {
  const buf = new Uint8Array(pw * ph * 4);
  const put = (dx: number, dy: number, s: Sprite, sx: number, sy: number): void => {
    const so = ((s.ty + sy) * s.pw + s.tx + sx) * 4;
    const d = (dy * pw + dx) * 4;
    buf[d] = s.rgba[so] as number;
    buf[d + 1] = s.rgba[so + 1] as number;
    buf[d + 2] = s.rgba[so + 2] as number;
    buf[d + 3] = s.rgba[so + 3] as number;
  };
  for (const s of sprites) {
    if (s.page !== pi) continue;
    for (let y = 0; y < s.th; y++) {
      const so = ((s.ty + y) * s.pw + s.tx) * 4;
      buf.set(s.rgba.subarray(so, so + s.tw * 4), ((s.y + y) * pw + s.x) * 4);
    }
    const L = s.tx === 0;
    const T = s.ty === 0;
    const R = s.tx + s.tw === s.pw;
    const B = s.ty + s.th === s.ph;
    for (let y = 0; y < s.th; y++) {
      if (L) put(s.x - 1, s.y + y, s, 0, y);
      if (R) put(s.x + s.tw, s.y + y, s, s.tw - 1, y);
    }
    for (let x = 0; x < s.tw; x++) {
      if (T) put(s.x + x, s.y - 1, s, x, 0);
      if (B) put(s.x + x, s.y + s.th, s, x, s.th - 1);
    }
    if (T && L) put(s.x - 1, s.y - 1, s, 0, 0);
    if (T && R) put(s.x + s.tw, s.y - 1, s, s.tw - 1, 0);
    if (B && L) put(s.x - 1, s.y + s.th, s, 0, s.th - 1);
    if (B && R) put(s.x + s.tw, s.y + s.th, s, s.tw - 1, s.th - 1);
  }
  return buf;
}

// ---------- PNG 编码（RGBA8，逐行自适应滤波 + zlib level 9，确定性） ----------

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f] as Uint8Array;
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = cur[i] as number;
        const a = i >= 4 ? (cur[i - 4] as number) : 0;
        const b = up[i] as number;
        const c = i >= 4 ? (up[i - 4] as number) : 0;
        let p: number;
        if (f === 0) p = 0;
        else if (f === 1) p = a;
        else if (f === 2) p = b;
        else if (f === 3) p = (a + b) >> 1;
        else {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (x - p) & 0xff;
        o[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best] as Uint8Array, y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bit RGBA，非隔行
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------- game.json / meta.json ----------

type Format = 'webp' | 'png' | 'png-lossless';

function atlasJson(group: Group, sprites: readonly Sprite[], pages: readonly { w: number; h: number }[], fmt: Format, hashes: readonly string[]): string {
  const ext = fmt === 'webp' ? 'webp' : 'png';
  const textures = pages.map((pg, pi) => {
    const frames = sprites
      .filter((s) => s.page === pi)
      .sort((a, b) => cmp(a.name, b.name))
      .map((s) =>
        JSON.stringify({
          filename: s.name,
          frame: { x: s.x, y: s.y, w: s.tw, h: s.th },
          rotated: false,
          trimmed: s.tw !== s.pw || s.th !== s.ph,
          spriteSourceSize: { x: s.tx, y: s.ty, w: s.tw, h: s.th },
          sourceSize: { w: s.pw, h: s.ph },
          display: { w: s.dw, h: s.dh },
        }),
      );
    const head = JSON.stringify({ image: `${group}-${pi}.${ext}`, format: 'RGBA8888', size: { w: pg.w, h: pg.h }, scale: SCALE });
    return `    ${head.slice(0, -1)},\n      "frames": [\n        ${frames.join(',\n        ')}\n      ]\n    }`;
  });
  const meta = {
    app: 'tools/art/bake.ts',
    group,
    version: 1,
    source: 'public/assets/art/v3/',
    scale: SCALE,
    frames: sprites.length,
    pages: pages.length,
    maxPageSize: PAGE,
    gutter: GUTTER,
    spacing: SPACING,
    untrimmedDirs: [...NO_TRIM].sort(cmp),
    encoding: fmt === 'webp' ? { type: 'webp', quality: 1, encoder: 'chromium canvas', note: '近无损（canvas 预乘带来 ≤2/255 误差）' } : { type: 'png' },
    quantize: fmt === 'png' ? { channels: 'rgb', step: QUANT_STEP, bits: Math.round(Math.log2(256 / QUANT_STEP)), alpha: 'unchanged' } : null,
    pageHashes: hashes,
    note: 'frame/sourceSize 为 2× 像素；display 为 SVG 原生尺寸，按它 setDisplaySize',
  };
  return `{\n  "textures": [\n${textures.join(',\n')}\n  ],\n  "meta": ${JSON.stringify(meta)}\n}\n`;
}

// ---------- 写盘：只写内容有变化的文件 ----------

function same(path: string, data: Uint8Array): boolean {
  let old: Uint8Array;
  try {
    old = readFileSync(path);
  } catch {
    return false;
  }
  if (old.length !== data.length) return false;
  for (let i = 0; i < old.length; i++) if (old[i] !== data[i]) return false;
  return true;
}

/** 原子写：先写同目录临时文件再改名，读者永远只看到完整的旧文件或新文件 */
function atomicWrite(path: string, data: Uint8Array): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function fmtBytes(n: number): string {
  return n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`;
}

/** 上一次该组 json 里记录的每页像素哈希（image 名 → 哈希） */
function readOldHashes(group: Group): Map<string, string> {
  const m = new Map<string, string>();
  try {
    const j = JSON.parse(new TextDecoder().decode(readFileSync(`${OUT}${group}.json`))) as { textures?: { image: string }[]; meta?: { pageHashes?: string[] } };
    j.textures?.forEach((t, i) => {
      const h = j.meta?.pageHashes?.[i];
      if (h) m.set(t.image, h);
    });
  } catch {
    // 没有旧文件或格式不同：全部重写
  }
  return m;
}

/** 用 Chromium canvas 把整页非预乘 RGBA 编成 WebP（quality 1，近无损） */
async function encodeWebp(browser: Browser, w: number, h: number, rgba: Uint8Array): Promise<Uint8Array> {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const b64 = await page.evaluate(
      ({ data, w, h }: { data: string; w: number; h: number }) => {
        const bin = atob(data);
        const u8 = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        if (!g) throw new Error('canvas 2d 不可用');
        g.putImageData(new ImageData(u8, w, h), 0, 0);
        const url = c.toDataURL('image/webp', 1);
        if (!url.startsWith('data:image/webp')) throw new Error('浏览器不支持 WebP 编码');
        return url.slice(url.indexOf(',') + 1);
      },
      { data: Buffer.from(rgba).toString('base64'), w, h },
    );
    return Buffer.from(b64, 'base64');
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fmt: Format = args.includes('--png') ? (args.includes('--lossless') ? 'png-lossless' : 'png') : 'webp';
  const ext = fmt === 'webp' ? 'webp' : 'png';
  const ji = args.indexOf('--jobs');
  const jobs = ji >= 0 ? Math.max(1, Number(args[ji + 1]) || 1) : Math.min(4, availableParallelism());
  const t0 = performance.now();

  const rels = scan();
  if (rels.length === 0) throw new Error('没有找到要烘焙的 SVG');
  const srcs = rels.map(prepare);
  if (args.includes('--list')) {
    for (const s of srcs) console.log(`${s.name}\t${s.dw}×${s.dh}${s.trim ? '' : '\t(不裁边)'}`);
    console.log(`共 ${srcs.length} 个`);
    return;
  }
  console.log(`烘焙 ${srcs.length} 个 SVG（${SCALE}×，${jobs} 个渲染页，${fmt === 'webp' ? 'WebP 近无损' : fmt === 'png' ? `PNG，RGB 量化步长 ${QUANT_STEP}` : 'PNG 无损'}）`);

  let browser: Browser | null = null;
  let t1 = 0;
  let allSprites: Sprite[] = [];
  const plans: { group: Group; sprites: Sprite[]; pages: { w: number; h: number }[]; pagesOut: [string, Uint8Array | null][]; json: Uint8Array }[] = [];
  try {
    browser = await chromium.launch({
      args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'],
    });
    const pixels = await renderAll(browser, srcs, jobs);
    t1 = performance.now();
    allSprites = srcs.map((s, i) => {
      const rgba = pixels[i] as Uint8Array;
      const [tx, ty, tw, th] = s.trim ? bbox(rgba, s.pw, s.ph) : [0, 0, s.pw, s.ph];
      return { ...s, tx, ty, tw, th, rgba, page: -1, x: 0, y: 0 };
    });
    for (const group of GROUPS) {
      const sprites = allSprites.filter((sp) => groupOf(sp.name) === group);
      if (sprites.length === 0) continue;
      const pages = pack(sprites);
      const oldHashes = readOldHashes(group);
      const hashes: string[] = [];
      const pagesOut: [string, Uint8Array | null][] = [];
      for (const [pi, pg] of pages.entries()) {
        const name = `${group}-${pi}.${ext}`;
        let raw = compose(sprites, pi, pg.w, pg.h);
        if (fmt === 'png') raw = quantize(raw, QUANT_STEP);
        const hash = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
        hashes.push(hash);
        // 像素没变、文件还在：不重新编码（null 表示保持原文件）
        if (oldHashes.get(name) === hash && existsSync(OUT + name)) {
          pagesOut.push([name, null]);
          continue;
        }
        pagesOut.push([name, fmt === 'webp' ? await encodeWebp(browser, pg.w, pg.h, raw) : encodePng(pg.w, pg.h, raw)]);
      }
      plans.push({ group, sprites, pages, pagesOut, json: new TextEncoder().encode(atlasJson(group, sprites, pages, fmt, hashes)) });
    }
  } finally {
    await browser?.close().catch(() => {});
  }
  const t2 = performance.now();

  mkdirSync(OUT, { recursive: true });
  let changed = 0;
  let grand = 0;
  const summary: string[] = [];
  for (const plan of plans) {
    const { group, sprites, pages, pagesOut, json } = plan;
    let total = 0;
    // 顺序：先页图（临时文件改名）→ 再 json（临时文件改名）→ 最后删多出来的旧页。
    // 任何时刻 json 引用的页图都存在。
    const put = (name: string, data: Uint8Array | null): void => {
      if (data === null) {
        const n = readFileSync(OUT + name).length;
        total += n;
        console.log(`  unchanged ${name}（${fmtBytes(n)}，像素未变）`);
        return;
      }
      total += data.length;
      if (same(OUT + name, data)) {
        console.log(`  unchanged ${name}（${fmtBytes(data.length)}）`);
        return;
      }
      changed += 1;
      if (check) console.log(`  会更新  ${name}（${fmtBytes(data.length)}）`);
      else {
        atomicWrite(OUT + name, data);
        console.log(`  written   ${name}（${fmtBytes(data.length)}）`);
      }
    };
    for (const [name, data] of pagesOut) put(name, data);
    put(`${group}.json`, json);
    const keep = new Set(pagesOut.map(([n]) => n));
    const re = new RegExp(`^${group}-\\d+\\.(png|webp)$`);
    for (const f of readdirSync(OUT).filter((x) => re.test(x) && !keep.has(x)).sort(cmp)) {
      changed += 1;
      if (check) console.log(`  会删除  ${f}`);
      else {
        unlinkSync(OUT + f);
        console.log(`  deleted   ${f}`);
      }
    }
    grand += total;
    const trimmed = sprites.filter((sp) => sp.tw !== sp.pw || sp.th !== sp.ph).length;
    summary.push(`${group}：${sprites.length} 帧（裁边 ${trimmed}），${pages.length} 页 [${pages.map((p) => `${p.w}×${p.h}`).join(', ')}]，${fmtBytes(total)}`);
  }
  for (const line of summary) console.log(line);
  console.log(
    `共 ${allSprites.length} 帧、${fmtBytes(grand)}；渲染 ${((t1 - t0) / 1000).toFixed(1)}s，装箱编码 ${((t2 - t1) / 1000).toFixed(1)}s，总 ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  );
  if (changed === 0) console.log('全部 unchanged，未写任何文件。');
  else if (check) {
    console.log(`${changed} 个文件需要更新（--check 未写盘）。`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
}
