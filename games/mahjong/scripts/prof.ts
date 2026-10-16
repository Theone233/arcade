import { sichuanXuezhan as XZ, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { runAuto } from '../src/game/driver.ts';
const K = ['ai', 'ai', 'ai', 'ai'] as const;
const t0 = performance.now();
for (let i = 0; i < 5; i++) {
  let s = XZ.begin([i, 1, 2, 3, 4, 5, 6, 7], XZ.defaults, K, { share: 2000, base: 40, personas: [0, 1, 2, 3] }) as XzState;
  while (!XZ.over(s)) { const st = runAuto(XZ, s, K, 5000); if (st.length) s = st.at(-1)!.state as XzState; if (!XZ.over(s)) s = XZ.resume(s); }
}
console.log('ms/match', (performance.now() - t0) / 5);
