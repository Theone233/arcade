/**
 * 试听面板（URL 带 soundboard=1 时由 createAudio 挂出）。
 * 列出每种 cue 的全部变体、每种 mood、三个音量滑条与静音，另有按 0.3 结算顺序的“模拟一天”串联播放。
 * 纯 DOM，固定在右上角、可折叠；面板内的指针与键盘事件不会冒泡到游戏。
 */
import { updateSettings, getSettings } from '../../platform/settings.ts';
import type { EngineStats } from './engine.ts';
import { allCueVariants } from './sfx.ts';
import type { AudioApi, Cue, Mood } from './types.ts';

interface SoundboardHost {
  api: AudioApi;
  stats(): (EngineStats & { state: string }) | null;
}

const ID = 'kp-soundboard';
const MOODS: [Mood, string][] = [
  ['title', '标题'],
  ['bull', '牛市·晴'],
  ['flat', '震荡·阴'],
  ['bear', '熊市·雷雨'],
  ['payday', '月底结算'],
  ['victory', '胜利'],
  ['defeat', '失败'],
  ['silent', '静音淡出'],
];

const CSS = `
#${ID}{position:fixed;bottom:8px;left:8px;z-index:2147483000;width:316px;max-height:62vh;display:flex;flex-direction:column-reverse;
  background:rgba(17,24,33,.96);border:1px solid #2a3a4e;border-radius:6px;color:#e6ebf1;box-shadow:0 6px 24px rgba(0,0,0,.5);
  font:12px/1.4 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;user-select:none}
#${ID}.dock-r{left:auto;right:8px}
#${ID} .hd{display:flex;align-items:center;gap:8px;padding:5px 8px;border-top:1px solid #2a3a4e;cursor:pointer}
#${ID} .hd b{color:#f2b134;font-weight:600;flex:1}
#${ID} .hd span{color:#8591a3;font-family:Consolas,Menlo,monospace}
#${ID} .hd button{padding:0 6px;font-size:11px;color:#a3afbf}
#${ID}.collapsed{width:auto}
#${ID}.collapsed .bd,#${ID}.collapsed .hd button{display:none}
#${ID}.collapsed .hd{border-top:0}
#${ID} .bd{overflow:auto;padding:6px 8px 8px}
#${ID} h4{margin:8px 0 4px;color:#a3afbf;font-size:11px;font-weight:600;letter-spacing:.05em}
#${ID} .grid{display:flex;flex-wrap:wrap;gap:4px}
#${ID} button{background:#17202b;color:#e6ebf1;border:1px solid #2a3a4e;border-radius:4px;padding:3px 7px;font:inherit;cursor:pointer}
#${ID} button:hover{border-color:#456080;background:#1d2836}
#${ID} button.on{border-color:#f2b134;color:#f2b134}
#${ID} button.hot{background:#f2b134;color:#1a1305;border-color:#f2b134}
#${ID} label{display:flex;align-items:center;gap:6px;margin:3px 0}
#${ID} label i{font-style:normal;width:42px;white-space:nowrap;color:#a3afbf}
#${ID} label em{font-style:normal;width:30px;text-align:right;font-family:Consolas,Menlo,monospace;color:#a3afbf}
#${ID} input[type=range]{flex:1;accent-color:#f2b134}
#${ID} input[type=checkbox]{accent-color:#f2b134}
#${ID} .st{margin-top:6px;color:#8591a3;font-family:Consolas,Menlo,monospace;font-size:11px;white-space:pre-wrap}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

/** 挂载面板；已存在时返回 null。返回卸载函数。 */
export function mountSoundboard(host: SoundboardHost): (() => void) | null {
  if (document.getElementById(ID)) return null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void): void => {
    const h = setTimeout(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };
  const { api } = host;
  const play = (c: Cue): void => {
    api.unlock();
    api.cue(c);
  };

  const style = el('style', {}, CSS);
  const root = el('div', { id: ID });
  // 默认停靠左下角（盖住的是行情图与策略栏，不挡右侧的交易决策与开盘按钮），可切到右下角或折叠成小条
  const head = el('div', { class: 'hd', title: '点击折叠/展开' });
  const arrow = el('span', {}, '▾');
  const dock = el('button', { title: '停靠到另一侧' }, '⇄ 换边');
  head.append(el('b', {}, '♪ 音频试听'), dock, arrow);
  const body = el('div', { class: 'bd' });
  root.append(head, body);
  const KEY = 'kaipan.soundboard';
  const saved = ((): string => {
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  })();
  const persist = (): void => {
    try {
      sessionStorage.setItem(KEY, `${root.classList.contains('collapsed') ? 'c' : ''}${root.classList.contains('dock-r') ? 'r' : ''}`);
    } catch {
      // 忽略
    }
  };
  const setCollapsed = (c: boolean): void => {
    root.classList.toggle('collapsed', c);
    arrow.textContent = c ? '▴' : '▾';
    persist();
  };
  head.addEventListener('click', () => setCollapsed(!root.classList.contains('collapsed')));
  dock.addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.toggle('dock-r');
    persist();
  });
  root.classList.toggle('dock-r', saved.includes('r'));
  setCollapsed(saved.includes('c'));

  // 音量
  body.append(el('h4', {}, '音量'));
  const s0 = getSettings();
  const slider = (label: string, key: 'masterVolume' | 'sfxVolume' | 'musicVolume'): void => {
    const row = el('label');
    const input = el('input', { type: 'range', min: '0', max: '100', step: '1' });
    input.value = String(Math.round(s0[key] * 100));
    const val = el('em', {}, input.value);
    input.addEventListener('input', () => {
      val.textContent = input.value;
      api.applySettings(updateSettings({ [key]: Number(input.value) / 100 }));
    });
    row.append(el('i', {}, label), input, val);
    body.append(row);
  };
  slider('总音量', 'masterVolume');
  slider('音效', 'sfxVolume');
  slider('音乐', 'musicVolume');
  const muteRow = el('label');
  const mute = el('input', { type: 'checkbox' });
  mute.checked = s0.muted;
  mute.addEventListener('change', () => api.applySettings(updateSettings({ muted: mute.checked })));
  muteRow.append(mute, el('span', {}, '静音'));
  body.append(muteRow);

  // 音乐
  body.append(el('h4', {}, '背景音乐（情绪）'));
  const moodGrid = el('div', { class: 'grid' });
  const moodButtons = new Map<Mood, HTMLButtonElement>();
  for (const [m, label] of MOODS) {
    const b = el('button', { 'data-mood': m }, label);
    b.addEventListener('click', () => {
      api.unlock();
      api.setMood(m);
      for (const [k, btn] of moodButtons) btn.classList.toggle('on', k === m);
    });
    moodButtons.set(m, b);
    moodGrid.append(b);
  }
  body.append(moodGrid);

  // 模拟
  body.append(el('h4', {}, '模拟'));
  const simGrid = el('div', { class: 'grid' });
  const markMood = (m: Mood): void => {
    api.setMood(m);
    for (const [k, btn] of moodButtons) btn.classList.toggle('on', k === m);
  };
  /**
   * 0.3 的一天（设计稿第 5 节）：盘前群聊 → 买入 → 开盘钟 → 天气 → 热度 → 4 只揭晓 → 连线 → 道具 → 账户滚动
   * → 涨停烟花 / 跌停雨云 → 收益落定 → 群友吐槽与说中/说错。moves 为 4 只持仓的涨跌（百分点）。
   */
  const simulate = (to: 'bull' | 'flat' | 'bear', moves: readonly number[], chains: number, ret: number): void => {
    api.unlock();
    markMood('flat');
    for (let i = 0; i < 3; i++) later(i * 450, () => play({ type: 'chat', index: i }));
    later(1500, () => play({ type: 'buy' }));
    const open = 2300;
    later(open, () => play({ type: 'marketOpen' }));
    later(open + 1100, () => {
      markMood(to);
      play({ type: 'weather', to });
    });
    later(open + 2200, () => play({ type: 'heat', up: to === 'bear' ? 1 : 3, down: to === 'bear' ? 3 : 1, max: 15 }));
    const tr = open + 3000;
    moves.forEach((move, i) => {
      const limit = move >= 10 ? 'up' : move <= -10 ? 'down' : null;
      later(tr + i * 420, () => play({ type: 'reveal', move, limit, index: i }));
    });
    const tc = tr + moves.length * 420 + 300;
    for (let k = 0; k < chains; k++) later(tc + k * 200, () => play({ type: 'chain', index: k }));
    const ti = tc + chains * 200 + 300;
    later(ti, () => play({ type: 'item', id: 'longtou', delta: 1.5 }));
    const tu = ti + 600;
    const STEPS = 24;
    for (let k = 0; k <= STEPS; k++) later(tu + k * 40, () => play({ type: 'countUp', progress: k / STEPS }));
    const tf = tu + STEPS * 40 + 150;
    later(tf, () => play({ type: 'settle', ret }));
    if (moves.some((m) => m >= 10)) later(tf + 500, () => play({ type: 'limitUp' }));
    if (moves.some((m) => m <= -10)) later(tf + 500, () => play({ type: 'limitDown' }));
    const tj = tf + 2400;
    later(tj, () => play({ type: 'chat', index: 3 }));
    later(tj + 450, () => play({ type: 'judge', hit: ret > 0 }));
    later(tj + 900, () => play({ type: 'chat', index: 4 }));
  };
  /** 月底：账单 → 印章 → 三选一 → 选中 → 事件 → 结果 → 新月份。 */
  const monthEnd = (paid: boolean): void => {
    api.unlock();
    markMood('payday');
    later(600, () => play({ type: 'bill' }));
    later(1600, () => play({ type: 'stamp', paid, credit: false }));
    if (!paid) return;
    later(3200, () => play({ type: 'rewardShow' }));
    later(4600, () => play({ type: 'reward', kind: 'item' }));
    later(6000, () => play({ type: 'event' }));
    later(7300, () => play({ type: 'eventResult', delta: 1500 }));
    later(8600, () => {
      play({ type: 'monthStart' });
      markMood('flat');
    });
  };
  const sims: [string, () => void][] = [
    ['牛市的一天', () => simulate('bull', [10, 4.2, 1.1, -0.8], 2, 3.6)],
    ['熊市的一天', () => simulate('bear', [-10, -4.5, 0.2, -2.1], 0, -4.4)],
    ['月底 还清', () => monthEnd(true)],
    ['月底 逾期', () => monthEnd(false)],
    ['200 次滚动连发', () => {
      api.unlock();
      for (let i = 0; i < 200; i++) play({ type: 'countUp', progress: i / 199 });
    }],
    ['30 个音效并发', () => {
      api.unlock();
      for (let i = 0; i < 30; i++) play(i % 2 ? { type: 'autoSold', reason: 'stop' } : { type: 'chain', index: i });
    }],
  ];
  for (const [label, fn] of sims) {
    const b = el('button', {}, label);
    b.addEventListener('click', fn);
    simGrid.append(b);
  }
  body.append(simGrid);

  // 音效
  let group = '';
  let grid: HTMLElement | null = null;
  const GROUP_LABEL: Partial<Record<Cue['type'], string>> = {
    ui: '界面',
    guide: '界面',
    chat: '盘前',
    friendJoin: '盘前',
    buy: '盘前',
    sell: '盘前',
    marketOpen: '开盘',
    weather: '开盘',
    thunder: '开盘',
    heat: '开盘',
    reveal: '结算',
    chain: '结算',
    item: '结算',
    countUp: '结算',
    limitUp: '结算',
    limitDown: '结算',
    settle: '结算',
    news: '消息与自动卖出',
    autoSold: '消息与自动卖出',
    judge: '收盘',
    monthStart: '月底',
    bill: '月底',
    stamp: '月底',
    rewardShow: '月底',
    reward: '月底',
    event: '月底',
    eventResult: '月底',
    runWon: '胜负',
    runLost: '胜负',
  };
  for (const v of allCueVariants()) {
    const g = GROUP_LABEL[v.cue.type] ?? '其他';
    if (g !== group || !grid) {
      group = g;
      body.append(el('h4', {}, `音效 · ${g}`));
      grid = el('div', { class: 'grid' });
      body.append(grid);
    }
    const b = el('button', { 'data-cue': v.key, title: v.key }, v.label);
    b.addEventListener('click', () => {
      b.classList.add('hot');
      later(150, () => b.classList.remove('hot'));
      play(v.cue);
    });
    grid.append(b);
  }
  // 序列试听：群聊 6 条、揭晓 −10%→+10% 七档、连线 0..5、账户滚动 0→1
  const seq = (after: string, key: string, label: string, fn: () => void): void => {
    const b = el('button', { 'data-cue': key }, label);
    b.addEventListener('click', fn);
    body.querySelector(`[data-cue="${after}"]`)?.after(b);
  };
  seq('chat', 'chat:seq', '群聊 ×6 序列', () => {
    for (let k = 0; k < 6; k++) later(k * 260, () => play({ type: 'chat', index: k }));
  });
  seq('reveal:limitDown', 'reveal:seq', '揭晓 −10%→+10%', () => {
    const moves = [-10, -6, -3, -1, 0, 1, 3, 6, 10];
    moves.forEach((move, k) => later(k * 300, () => play({ type: 'reveal', move, limit: move >= 10 ? 'up' : move <= -10 ? 'down' : null, index: k % 4 })));
  });
  seq('chain', 'chain:seq', '连线 ×6 序列', () => {
    for (let k = 0; k < 6; k++) later(k * 200, () => play({ type: 'chain', index: k }));
  });
  seq('countUp', 'countUp:seq', '滚动 0→1 序列', () => {
    for (let k = 0; k <= 24; k++) later(k * 40, () => play({ type: 'countUp', progress: k / 24 }));
  });

  const st = el('div', { class: 'st' }, '尚未解锁（点击任一按钮）');
  body.append(st);
  const poll = setInterval(() => {
    const s = host.stats();
    if (!s) return;
    st.textContent = `上下文 ${s.state} · 情绪 ${s.mood}\n音效 ${s.sfxVoices} 个 · 音符 ${s.musicVoices} 个（${s.musicNodes} 节点）· 播放器 ${s.players}\n累计 发出 ${s.played} / 节流 ${s.throttled} / 淘汰 ${s.stolen}`;
  }, 400);

  // 面板内的事件不传给游戏
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'keydown', 'keyup', 'touchstart', 'touchend']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  const mount = (): void => {
    document.head.append(style);
    document.body.append(root);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  return () => {
    clearInterval(poll);
    for (const h of timers) clearTimeout(h);
    timers.clear();
    root.remove();
    style.remove();
  };
}
