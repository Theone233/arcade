/** 演示页：点按钮从"我"往右家扔道具，或在对家头像旁冒表情。冒烟截图时由脚本调 window.demo。 */
import { PROPS, STICKERS, createFunLayer, playFunSound, showSticker, throwAt, type PropId } from '../src/fun.ts';

const layer = createFunLayer();
const $ = (id: string): HTMLElement => document.getElementById(id)!;
let ac: AudioContext | null = null;

function shake(el: HTMLElement): void {
  el.classList.remove('hit');
  void el.offsetWidth;
  el.classList.add('hit');
}

function toss(prop: PropId, target = 'right'): Promise<boolean> {
  const to = $(target);
  return throwAt(layer, $('me').getBoundingClientRect(), to.getBoundingClientRect(), prop, {
    sound: (p, phase) => {
      ac ??= new AudioContext();
      playFunSound(ac, ac.destination, p, phase);
    },
    onHit: () => shake(to),
    target,
  });
}

for (const p of PROPS) {
  const b = document.createElement('button');
  b.textContent = p;
  b.onclick = () => void toss(p);
  $('bar').appendChild(b);
}
for (const s of STICKERS) {
  const b = document.createElement('button');
  b.textContent = s;
  b.onclick = () => void showSticker(layer, $('top').getBoundingClientRect(), s);
  $('bar').appendChild(b);
}

declare global {
  interface Window {
    demo: { toss: typeof toss; sticker: (i: number, seat?: string) => Promise<boolean>; layer: typeof layer };
  }
}
window.demo = { toss, sticker: (i, seat = 'top') => showSticker(layer, $(seat).getBoundingClientRect(), STICKERS[i]!), layer };
