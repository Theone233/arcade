/**
 * 轮到我了（0.3.0 朋友们："到自己出牌来点音效提示一下"）：一声提示音、能振动的短振一下、页面在后台时标签页标题闪"轮到你了"；
 * 好友房有计时，最后 5 秒嘀嗒，越到后面越密。单机没有计时，只有前面三样。只是提醒，不碰计时、不碰规则。
 */
import { play } from './sound.ts';

const TITLE = document.title;
let flash = 0;
let ticks: number[] = [];
let last = '';

/** 这一次轮到我（key 是这一个决定点，同一个 key 只提醒一次） */
export function myTurn(key: string): void {
  if (key === last) return;
  last = key;
  play('turn');
  try {
    navigator.vibrate?.(60);
  } catch {
    // 不让振动的浏览器：不管
  }
  if (document.hidden) flashTitle();
}

/** 不轮到我了：标题复原、嘀嗒停掉（last 不清：同一个决定点重画时不再响第二次） */
export function notMyTurn(): void {
  stopFlash();
  stopTicks();
}

/** 计时最后 5 秒的嘀嗒：5、4、3 秒各一下，最后 2 秒每半秒一下；deadline 变了重排 */
let tickFor: number | null = null;
export function tickUntil(deadline: number | null): void {
  if (deadline === tickFor) return;
  stopTicks();
  tickFor = deadline;
  if (deadline === null) return;
  const at = [5000, 4000, 3000, 2000, 1500, 1000, 500];
  for (const ms of at) {
    const wait = deadline - ms - Date.now();
    if (wait >= 0) ticks.push(window.setTimeout(() => play('tick'), wait));
  }
}

function stopTicks(): void {
  for (const t of ticks) window.clearTimeout(t);
  ticks = [];
  tickFor = null;
}

function flashTitle(): void {
  stopFlash();
  let on = false;
  flash = window.setInterval(() => {
    on = !on;
    document.title = on ? '轮到你了' : TITLE;
  }, 900);
}

function stopFlash(): void {
  window.clearInterval(flash);
  flash = 0;
  document.title = TITLE;
}

// 切回来就别闪了
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) stopFlash();
});
