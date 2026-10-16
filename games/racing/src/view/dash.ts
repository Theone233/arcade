/**
 * 驾驶台（DESIGN.md 2.2、2.7、第 8 节）：自己的手牌、挡位杆、引擎和牌堆、出牌前的落点预览、预设，以及亮牌后轮到自己时的问题。
 * 预览只用自己的视图算（手抖按 1–4 的范围），算出来的格子交给赛道画一辆虚影车。
 */
import { HEAT, STRESS, discardable, faceValue } from '../core/cards.ts';
import { crossedCorners, gearOptions } from '../core/rules.ts';
import type { Action, Plan, Pre } from '../core/types.ts';
import type { View } from '../core/view.ts';
import { getTrack } from '../track/index.ts';
import { cardSvg } from './cards.ts';
import { button, el } from './dom.ts';
import { ASK_TEXT } from './text.ts';

export interface Presets {
  boost: Pre;
  adren: Pre;
  slip: Pre;
  /** true：出牌时顺手标要弃的牌；false：每回合轮到时问 */
  markDiscard: boolean;
}

export interface DashHooks {
  plan(p: Plan): void;
  answer(a: Action): void;
  /** 落点预览（null 是不画） */
  preview(pos: number | null, lane: number, kind: 'ok' | 'pay' | 'spin'): void;
  /** 预设改了（存进 racing.prefs） */
  presets(p: Presets): void;
}

const FLAME = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1c3 3 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3-.5-3 0-5 1-7.5z"/></svg>';

interface Preview {
  min: number;
  max: number;
  /** 最好、最坏情况下过弯付几张；会不会打滑 */
  pay: [number, number];
  spin: 'no' | 'maybe' | 'yes';
  corners: number[];
  cool: number;
  shiftPaid: number;
}

export class Dash {
  readonly root: HTMLElement;
  private v: View | null = null;
  private gear = 1;
  private sel: number[] = [];
  private marks: number[] = [];
  private markMode = false;
  /** 这一回合是不是已经按当前挡位初始化过（新回合重置选择） */
  private round = -1;
  private until: number | null = null;
  private timerEl: HTMLElement | null = null;
  private tick = 0;

  private presets: Presets;
  private readonly hooks: DashHooks;

  constructor(parent: HTMLElement, presets: Presets, hooks: DashHooks) {
    this.presets = presets;
    this.hooks = hooks;
    this.root = el('div', 'dash', parent);
    this.tick = window.setInterval(() => this.paintTimer(), 250);
  }

  destroy(): void {
    window.clearInterval(this.tick);
    this.root.remove();
  }

  /** 这一手的截止时间（好友房；单机不计时） */
  setTimer(until: number | null): void {
    this.until = until;
    this.paintTimer();
  }

  private paintTimer(): void {
    if (!this.timerEl) return;
    if (this.until === null) {
      this.timerEl.hidden = true;
      return;
    }
    const left = Math.max(0, this.until - Date.now());
    this.timerEl.hidden = false;
    this.timerEl.textContent = `${Math.ceil(left / 1000)}`;
    this.timerEl.classList.toggle('hurry', left < 5_000);
  }

  render(v: View): void {
    this.v = v;
    const me = v.me;
    this.root.replaceChildren();
    this.timerEl = null;
    if (!me) {
      el('div', 'dash-note', this.root, '旁观中');
      this.hooks.preview(null, 0, 'ok');
      return;
    }
    const car = v.cars[me.seat]!;
    if (this.round !== v.round) {
      this.round = v.round;
      this.gear = car.gear;
      this.sel = [];
      this.marks = [];
      this.markMode = false;
    }
    // 这一回合交过的计划：摆着自己交的
    if (me.plan && v.phase === 'plan') {
      this.gear = me.plan.gear;
      this.sel = me.plan.cards.slice();
      this.marks = me.plan.discard === 'ask' ? [] : me.plan.discard.slice();
    }
    this.mat(car.gear, car.engine, car.deck, car.discardTop);
    const mid = el('div', 'dash-mid', this.root);
    const right = el('div', 'dash-side', this.root);
    this.timerEl = el('div', 'dash-timer', this.root);
    this.paintTimer();
    if (car.rank !== null) {
      this.hand(mid, false);
      el('div', 'dash-note big', right, `冲线！第 ${car.rank + 1} 名`);
      this.hooks.preview(null, 0, 'ok');
      return;
    }
    if (v.phase === 'plan' && !me.plan) return this.planUi(mid, right);
    if (v.phase === 'act' && v.cur === me.seat && v.ask) return this.askUi(mid, right);
    this.hand(mid, false);
    this.hooks.preview(null, 0, 'ok');
    if (v.phase === 'plan') el('div', 'dash-note', right, '出好了，等别人……');
    else if (v.cur !== null) el('div', 'dash-note', right, '等别人决定……');
    else el('div', 'dash-note', right, '');
  }

  /** 左边：挡位、引擎、牌堆 */
  private mat(gear: number, engine: number, deck: number, top: number | null): void {
    const m = el('div', 'mat', this.root);
    const g = el('div', 'mat-gear', m);
    el('span', 'lbl', g, '挡');
    el('b', '', g, String(gear));
    const e = el('div', 'mat-engine', m);
    e.innerHTML = `${FLAME}<b>${engine}</b>`;
    e.title = `引擎里还有 ${engine} 张热量`;
    const d = el('div', 'mat-deck', m, `牌堆 ${deck}`);
    d.title = '还没抽的牌';
    if (top !== null) {
      const t = el('div', 'mat-top', m);
      t.innerHTML = cardSvg(top);
      t.title = '弃牌堆最上面一张';
    }
  }

  private hand(parent: HTMLElement, pick: boolean, onPick?: (id: number) => void, picked: number[] = [], marked: number[] = []): void {
    const me = this.v!.me!;
    const row = el('div', 'hand', parent);
    for (const h of me.hand) {
      const c = el('button', 'card', row);
      c.type = 'button';
      c.innerHTML = cardSvg(h.kind);
      if (h.kind === HEAT) c.classList.add('heat');
      if (picked.includes(h.id)) c.classList.add('sel');
      if (marked.includes(h.id)) c.classList.add('mark');
      if (pick && onPick) c.addEventListener('click', () => onPick(h.id));
      else c.disabled = true;
    }
  }

  // ---------- 选挡出牌 ----------

  private planUi(mid: HTMLElement, right: HTMLElement): void {
    const v = this.v!;
    const me = v.me!;
    const car = v.cars[me.seat]!;
    const kindOf = (id: number): number => me.hand.find((h) => h.id === id)?.kind ?? HEAT;
    const usable = me.hand.filter((h) => h.kind !== HEAT);
    const gears = gearOptions({ gear: car.gear, engine: car.engine });
    if (!gears.includes(this.gear)) this.gear = car.gear;
    const stall = usable.length < this.gear;

    const lever = el('div', 'lever', mid);
    for (let g = 1; g <= 4; g++) {
      const ok = gears.includes(g);
      const b = button(`gear${g === this.gear ? ' on' : ''}`, lever, String(g), () => {
        this.gear = g;
        if (this.sel.length > g) this.sel = this.sel.slice(this.sel.length - g);
        this.render(v);
      });
      b.disabled = !ok;
      if (ok && Math.abs(g - car.gear) === 2) el('i', 'cost', b, '热1');
      b.title = ok ? `${g} 挡：出 ${g} 张${g === 1 ? '，散热 3' : g === 2 ? '，散热 1' : ''}` : '一次最多升降 2 挡（2 挡要 1 张热量）';
    }

    this.hand(
      mid,
      true,
      (id) => {
        const kind = kindOf(id);
        if (this.markMode) {
          if (!discardable(kind) || this.sel.includes(id)) return;
          this.marks = this.marks.includes(id) ? this.marks.filter((x) => x !== id) : [...this.marks, id];
        } else {
          if (kind === HEAT) return;
          this.marks = this.marks.filter((x) => x !== id);
          if (this.sel.includes(id)) this.sel = this.sel.filter((x) => x !== id);
          else {
            this.sel.push(id);
            if (this.sel.length > this.gear) this.sel.shift();
          }
        }
        this.render(v);
      },
      this.sel,
      this.marks,
    );

    const p = stall ? null : this.sel.length === this.gear ? this.previewOf(this.gear, this.sel) : null;
    const info = el('div', 'preview', right);
    if (stall) {
      el('div', 'warn', info, `能打的牌不够 ${this.gear} 张：会熄火（车不动，回 1 挡）`);
      this.hooks.preview(null, 0, 'ok');
    } else if (!p) {
      el('div', 'hint', info, `挂 ${this.gear} 挡，选 ${this.gear} 张牌（还差 ${this.gear - this.sel.length}）`);
      this.hooks.preview(null, 0, 'ok');
    } else {
      el('div', 'speed', info, p.min === p.max ? `速度 ${p.min}` : `速度 ${p.min}–${p.max}`);
      const line: string[] = [];
      if (p.shiftPaid) line.push('跳挡 热量 −1');
      if (p.cool) line.push(`散热 ${p.cool}`);
      if (p.corners.length) line.push(`过 ${p.corners.map((l) => `限${l}`).join('、')}`);
      if (line.length) el('div', 'hint', info, line.join(' · '));
      const pay = p.pay[0] === p.pay[1] ? `${p.pay[0]}` : `${p.pay[0]}–${p.pay[1]}`;
      if (p.spin === 'yes') el('div', 'warn', info, '热量不够，会打滑！');
      else if (p.spin === 'maybe') el('div', 'warn', info, `手气差会打滑（付 ${pay}）`);
      else if (p.pay[1] > 0) el('div', 'pay', info, `过弯付热量 ${pay}`);
      const mid2 = Math.round((p.min + p.max) / 2);
      this.hooks.preview(car.pos + mid2, car.lane, p.spin !== 'no' ? 'spin' : p.pay[1] > 0 ? 'pay' : 'ok');
    }

    const chips = el('div', 'chips', right);
    const chip = (label: string, key: 'boost' | 'adren' | 'slip', values: Pre[], names: Record<Pre, string>): void => {
      const cur = this.presets[key];
      button(`chip p-${cur}`, chips, `${label}：${names[cur]}`, () => {
        const i = values.indexOf(cur);
        this.presets = { ...this.presets, [key]: values[(i + 1) % values.length]! };
        this.hooks.presets(this.presets);
        this.render(v);
      });
    };
    chip('冲刺', 'boost', ['ask', 'no'], { ask: '问我', no: '不冲', yes: '冲' });
    chip('尾流', 'slip', ['ask', 'yes', 'no'], { ask: '问我', yes: '能吸就吸', no: '不吸' });
    if (car.adren) chip('拼劲', 'adren', ['ask', 'yes', 'no'], { ask: '问我', yes: '多走 1 格', no: '不用' });
    button(`chip ${this.presets.markDiscard ? 'p-yes' : 'p-ask'}`, chips, this.presets.markDiscard ? '弃牌：现在标' : '弃牌：轮到时问', () => {
      this.presets = { ...this.presets, markDiscard: !this.presets.markDiscard };
      this.markMode = false;
      this.marks = [];
      this.hooks.presets(this.presets);
      this.render(v);
    });
    if (this.presets.markDiscard) {
      button(`chip mark-mode${this.markMode ? ' on' : ''}`, chips, this.markMode ? `点牌标弃（${this.marks.length}）· 完成` : `标要弃的牌${this.marks.length ? `（${this.marks.length}）` : ''}`, () => {
        this.markMode = !this.markMode;
        this.render(v);
      });
    }

    const go = button('act go', right, stall ? '熄火' : '出牌', () => {
      const plan: Plan = {
        gear: this.gear,
        cards: stall ? [] : this.sel.slice(),
        boost: this.presets.boost,
        adren: this.presets.adren,
        slip: this.presets.slip,
        discard: this.presets.markDiscard ? this.marks.filter((id) => !this.sel.includes(id)) : 'ask',
      };
      this.hooks.preview(null, 0, 'ok');
      this.hooks.plan(plan);
    });
    go.disabled = !stall && this.sel.length !== this.gear;
  }

  private previewOf(gear: number, cards: number[]): Preview | null {
    const v = this.v!;
    const me = v.me!;
    const car = v.cars[me.seat]!;
    const track = getTrack(v.opts.track);
    if (!track) return null;
    const kinds = cards.map((id) => me.hand.find((h) => h.id === id)?.kind ?? 0);
    const fixed = kinds.reduce((a, k) => a + (k === STRESS ? 0 : faceValue(k)), 0);
    const stress = kinds.filter((k) => k === STRESS).length;
    const anyBasic = [1, 2, 3, 4].some((k) => (me.pool[k] ?? 0) > 0);
    const lo = anyBasic ? Math.min(...[1, 2, 3, 4].filter((k) => (me.pool[k] ?? 0) > 0)) : 0;
    const hi = anyBasic ? Math.max(...[1, 2, 3, 4].filter((k) => (me.pool[k] ?? 0) > 0)) : 0;
    const min = fixed + stress * lo;
    const max = fixed + stress * hi;
    const shiftPaid = Math.abs(gear - car.gear) === 2 ? 1 : 0;
    const heatInHand = me.hand.filter((h) => h.kind === HEAT).length;
    const cool = Math.min((gear === 1 ? 3 : gear === 2 ? 1 : 0) + (car.adren ? 1 : 0), heatInHand);
    const engine = car.engine - shiftPaid + cool;
    let payMin = Infinity;
    let payMax = 0;
    let spins = 0;
    const lines = new Set<number>();
    for (let s = min; s <= max; s++) {
      let left = engine;
      let pay = 0;
      let spun = false;
      for (const k of crossedCorners(track, v.finish, car.pos, car.pos + s)) {
        lines.add(k.limit);
        const over = s - k.limit;
        if (over <= 0) continue;
        if (left < over) {
          spun = true;
          break;
        }
        left -= over;
        pay += over;
      }
      if (spun) spins++;
      else {
        payMin = Math.min(payMin, pay);
        payMax = Math.max(payMax, pay);
      }
    }
    const n = max - min + 1;
    return {
      min,
      max,
      pay: [payMin === Infinity ? 0 : payMin, payMax],
      spin: spins === 0 ? 'no' : spins === n ? 'yes' : 'maybe',
      corners: [...lines],
      cool,
      shiftPaid,
    };
  }

  // ---------- 亮牌以后的问题 ----------

  private askUi(mid: HTMLElement, right: HTMLElement): void {
    const v = this.v!;
    const me = v.me!;
    const car = v.cars[me.seat]!;
    const ask = v.ask!;
    this.hooks.preview(null, 0, 'ok');
    if (ask === 'discard') {
      this.hand(
        mid,
        true,
        (id) => {
          const kind = me.hand.find((h) => h.id === id)?.kind ?? HEAT;
          if (!discardable(kind)) return;
          this.marks = this.marks.includes(id) ? this.marks.filter((x) => x !== id) : [...this.marks, id];
          this.render(v);
        },
        [],
        this.marks,
      );
    } else this.hand(mid, false);
    const box = el('div', 'ask', right);
    el('div', 'ask-q', box, ASK_TEXT[ask]);
    if (ask !== 'discard') el('div', 'hint', box, `这回合速度 ${car.speed ?? 0} · 引擎 ${car.engine}`);
    const row = el('div', 'row', box);
    if (ask === 'discard') {
      button('act soft', row, '不弃', () => this.hooks.answer({ t: 'discard', cards: [] }));
      const b = button('act go', row, this.marks.length ? `弃掉 ${this.marks.length} 张` : '弃掉', () => {
        const cards = this.marks.slice();
        this.marks = [];
        this.hooks.answer({ t: 'discard', cards });
      });
      b.disabled = this.marks.length === 0;
      return;
    }
    const yes = ask === 'boost' ? '冲刺' : ask === 'adren' ? '多走 1 格' : '吸尾流';
    button('act soft', row, '不了', () => this.hooks.answer({ t: ask, yes: false }));
    button('act go', row, yes, () => this.hooks.answer({ t: ask, yes: true }));
  }
}
