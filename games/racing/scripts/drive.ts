/**
 * 冒烟、截图共用的"替我开一回合"：照驾驶台的顺序走——① 挂挡（按 prefer 的顺序挑第一个能挂的）→ 挂好了 → ② 点手牌放进出牌区 → 出牌；
 * 亮牌以后轮到我回答时按 answer 点（"冲刺"或"不了"，弃牌一律"不弃"）。做了一步返回 true。
 */
import type { Page } from 'playwright-core';

export async function drive(page: Page, prefer: number[], boost: boolean): Promise<boolean> {
  if (await page.$('.ask')) {
    const b = (boost ? await page.$('.ask button:has-text("冲刺")') : null) ?? (await page.$('.ask button:has-text("不弃")')) ?? (await page.$('.ask button:has-text("不了")'));
    await b?.click().catch(() => {});
    return true;
  }
  const shift = await page.$('.dash-action .act.go:has-text("挂好了")');
  if (shift) {
    for (const g of prefer) {
      const b = await page.$(`.gearbox.live .gate-btn[aria-label="${g} 挡"]:not([disabled])`);
      if (b) {
        await b.click().catch(() => {});
        break;
      }
    }
    await page.click('.dash-action .act.go:has-text("挂好了")').catch(() => {});
    return true;
  }
  const go = await page.$('.dash-action .act.go');
  if (!go) return false;
  // 每点一张驾驶台都重画，所以每次重新找
  for (let k = 0; k < 8 && (await page.$('.dash-action .act.go:disabled')); k++) {
    const c = await page.$('.hand.live .card:not(:disabled)');
    if (!c) break;
    await c.click().catch(() => {});
  }
  const btn = await page.$('.dash-action .act.go:not(:disabled)');
  if (btn) await btn.click().catch(() => {});
  return true;
}
