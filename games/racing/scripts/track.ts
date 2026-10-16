/**
 * 赛道自查（DESIGN.md 3.2）：按 shape.ts 的控制点算每一格转了多少度，找出弯（连着转得多的几格），
 * 和 fixed.ts 里写的弯道线对一对；再画一张带格子、弯道线、限速的 SVG（shots/track-<id>.svg，--png 时顺手截成 PNG）。
 *
 *   node scripts/track.ts            每条赛道打印建议的弯道线
 *   node scripts/track.ts --png      另外截图到 shots/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { FIXED } from '../src/track/fixed.ts';
import { geometry } from '../src/track/shape.ts';
import type { Track } from '../src/track/types.ts';

const DEG = 180 / Math.PI;
/** 一格转过这么多度就算在弯里 */
const BEND = 6;

function bends(t: Track): { at: number; deg: number; cells: number }[] {
  const g = geometry(t);
  const N = t.spaces;
  const inBend = g.turn.map((r) => Math.abs(r * DEG) >= BEND);
  // 从一个不在弯里的格开始绕一圈，免得弯被 0 号格切成两半
  const start = inBend.findIndex((b) => !b);
  const out: { at: number; deg: number; cells: number }[] = [];
  let cur: { at: number; deg: number; cells: number; sign: number } | null = null;
  for (let k = 0; k < N; k++) {
    const i = (start + k) % N;
    const d = g.turn[i]! * DEG;
    if (inBend[i]) {
      const sign = Math.sign(d);
      if (cur && cur.sign === sign) {
        cur.deg += d;
        cur.cells++;
      } else {
        if (cur) out.push(cur);
        cur = { at: i, deg: d, cells: 1, sign };
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.sort((a, b) => a.at - b.at).map(({ at, deg, cells }) => ({ at, deg: Math.round(deg), cells }));
}

function svg(t: Track): string {
  const g = geometry(t);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620" width="1000" height="620"><rect width="1000" height="620" fill="#2d6a3e"/>`);
  parts.push(`<path d="${g.path}" fill="none" stroke="#555" stroke-width="${g.width + 8}" stroke-linejoin="round"/>`);
  parts.push(`<path d="${g.path}" fill="none" stroke="#777" stroke-width="${g.width}" stroke-linejoin="round"/>`);
  g.edges.forEach((e, i) => {
    const nx = Math.sin(e.angle) * (g.width / 2);
    const ny = -Math.cos(e.angle) * (g.width / 2);
    const corner = t.corners.find((c) => c.at === i);
    const color = i === 0 ? '#fff' : corner ? '#e33' : '#999';
    parts.push(`<line x1="${e.c.x + nx}" y1="${e.c.y + ny}" x2="${e.c.x - nx}" y2="${e.c.y - ny}" stroke="${color}" stroke-width="${corner || i === 0 ? 3 : 1}"/>`);
    if (corner) parts.push(`<text x="${e.c.x + nx * 1.9}" y="${e.c.y + ny * 1.9 + 6}" font-size="18" fill="#fff" text-anchor="middle" font-weight="700">${corner.limit}</text>`);
  });
  g.cells.forEach((c, i) => {
    parts.push(`<text x="${c.c.x}" y="${c.c.y + 4}" font-size="10" fill="#ff0" text-anchor="middle">${i}</text>`);
  });
  parts.push('</svg>');
  return parts.join('');
}

mkdirSync('shots', { recursive: true });
for (const t of FIXED) {
  const g = geometry(t);
  console.log(`\n${t.id}（${t.name}）一圈 ${t.spaces} 格，长 ${Math.round(g.length)}，每格 ${(g.length / t.spaces).toFixed(1)}`);
  console.log('  按形状找到的弯：', bends(t).map((b) => `第 ${b.at} 格起 ${b.cells} 格转 ${b.deg}°`).join('；'));
  console.log('  fixed.ts 写的弯道线：', t.corners.map((c) => `${c.at}（限 ${c.limit}）`).join('、'));
  writeFileSync(`shots/track-${t.id}.svg`, svg(t));
}

if (process.argv.includes('--png')) {
  const { launch } = await import('./browser.ts');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  for (const t of FIXED) {
    await page.setContent(`<body style="margin:0">${svg(t)}</body>`);
    await page.screenshot({ path: `shots/track-${t.id}.png` });
  }
  await browser.close();
  console.log('\n截图在 shots/');
}
