/**
 * 冒烟、截图里替"我"出手：问一下电脑会怎么打（页面上的 __danli.suggest，只是参考），再用真的按钮和手势照着做——
 * 按"爬"按钮挪位置、在道具栏点上道具、拖角度盘（先拖一次定朝向，等镜头停稳再拖一次定角度）、按住"发射"蓄力到那个力度再松手。
 * 力度按按住的时长算，手机降速时会有一点出入，所以不保证和电脑想的一模一样。
 */
import type { Page } from 'playwright-core';

interface Hook {
  state(): { phase: string; actor: number; chars: { ai: boolean }[] };
  busy(): boolean;
  suggest(): { moves: (1 | -1)[]; angle: number; power: number; facing: 1 | -1; loadout: Loadout };
  actorScreen(): [number, number] | null;
  aim(): { angle: number; facing: 1 | -1 } | null;
}
type W = Window & { __danli?: Hook };

export interface Loadout {
  mode: 'single' | 'double' | 'triple' | 'fork';
  boost: 0 | 10 | 20 | 50;
  lid: boolean;
  plane: boolean;
}

/** 按道具栏的按钮把这一套道具选上（道具栏一回合开始是空的） */
export async function pickItems(page: Page, l: Loadout): Promise<void> {
  const keys = [l.plane ? 'plane' : '', l.mode !== 'single' ? l.mode : '', l.boost ? `b${l.boost}` : '', l.lid ? 'lid' : ''].filter(Boolean);
  for (const k of keys) await page.click(`.dl-item[data-item="${k}"]`);
}

/** 轮到我、底栏能按了吗 */
export async function myTurn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const d = (window as W).__danli;
    if (!d || !document.querySelector('.dl-bottom:not(.off)')) return false;
    const s = d.state();
    return s.phase === 'play' && !s.chars[s.actor]!.ai && !d.busy();
  });
}

const CHARGE_MS = 1800;

/** 拖角度盘：从角色身边按下，拖到这个角度的方向上（远一点更准） */
export async function dragDial(page: Page, angle: number, facing: 1 | -1): Promise<void> {
  const at = await page.evaluate(() => (window as W).__danli!.actorScreen());
  if (!at) return;
  const [x, y] = at;
  const r = (angle * Math.PI) / 180;
  await page.mouse.move(x + facing * Math.cos(r) * 40, y - Math.sin(r) * 40);
  await page.mouse.down();
  for (const k of [80, 160, 260]) await page.mouse.move(x + facing * Math.cos(r) * k, y - Math.sin(r) * k);
  await page.mouse.up();
}

/** 出一手（道具照电脑的建议选，override 给了就用它）；onAimed 在角度对好、还没发射时调（截"瞄准"用） */
export async function playTurn(page: Page, onAimed?: () => Promise<void>, override?: Partial<Loadout>): Promise<void> {
  const p = await page.evaluate(() => (window as W).__danli!.suggest());
  const loadout = { ...p.loadout, ...override };
  for (const dir of p.moves) {
    const btn = page.locator(dir < 0 ? '.dl-climb-btn.left' : '.dl-climb-btn.right');
    const box = await btn.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  await pickItems(page, loadout);
  await dragDial(page, p.angle, p.facing);
  await page.waitForTimeout(700);
  await dragDial(page, p.angle, p.facing);
  await page.waitForTimeout(150);
  await onAimed?.();
  const fire = await page.locator('.dl-fire').boundingBox();
  if (!fire) return;
  await page.mouse.move(fire.x + fire.width / 2, fire.y + fire.height / 2);
  await page.mouse.down();
  await page.waitForTimeout((p.power / 100) * CHARGE_MS);
  await page.mouse.up();
}

/** 拖角度盘（两次，等镜头停稳）再按住发射蓄到 power 松手 */
export async function aimAndFire(page: Page, angle: number, facing: 1 | -1, power: number): Promise<void> {
  await dragDial(page, angle, facing);
  await page.waitForTimeout(700);
  await dragDial(page, angle, facing);
  await page.waitForTimeout(150);
  const b = (await page.locator('.dl-fire').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout((power / 100) * CHARGE_MS);
  await page.mouse.up();
}
