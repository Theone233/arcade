/**
 * 道具栏（单机和好友房共用，DESIGN.md 2.6"界面"）：八个按钮的名字和提示、点一下以后的组合、每个按钮现在的样子、上面那一行"已选"。
 * - 常用道具点一下加一个（能叠），三岔、加力 50% 一回合 1 个（点了"已选"，再点取消）；
 * - 锅盖、纸飞机点一下选上或取消；纸飞机不能和别的一起用：选它就清掉别的，选别的就清掉它。
 * 提示里的数从规则核心取，调数值时不会漏改。
 */
import { COMMON, COMMONS, FORK_PCT, FORK_SPREAD as FORK, PLAIN, SPECIALS, VOLLEY_PCT, type Common, type Loadout } from '../core/items.ts';
import { loadoutBlocked } from '../core/rules.ts';
import type { State } from '../core/types.ts';
import type { ItemKey, ItemView } from './hud.ts';

export const ITEMS: readonly { key: ItemKey; label: string; title: string }[] = [
  { key: 'p1', label: '连发+1', title: `多扔 1 轮，能叠；每颗伤害按总轮数算（2 轮 ${VOLLEY_PCT[2]}%、3 轮 ${VOLLEY_PCT[3]}%……）` },
  { key: 'p2', label: '连发+2', title: '多扔 2 轮，能叠' },
  { key: 'fork', label: '三岔', title: `每一轮都分成三颗，角度各差 ${FORK}°，每颗伤害再乘 ${FORK_PCT}%；一回合 1 个` },
  { key: 'b10', label: '加力10%', title: '伤害 +10%，能叠' },
  { key: 'b20', label: '加力20%', title: '伤害 +20%，能叠' },
  { key: 'b50', label: '加力50%', title: '伤害 +50%；一回合 1 个' },
  { key: 'plane', label: '纸飞机', title: '这一发扔纸飞机，人飞到落点；不能和别的道具一起用' },
  { key: 'lid', label: '锅盖', title: '这一发不受风（每一颗都算）' },
];

const LABEL = Object.fromEntries(ITEMS.map((x) => [x.key, x.label])) as Record<ItemKey, string>;

const isCommon = (key: ItemKey): key is Common => (COMMON as readonly string[]).includes(key);

/** 一回合最多 1 个的 */
export function isOnce(key: ItemKey): boolean {
  return !isCommon(key) || COMMONS[key].max === 1;
}

function count(l: Loadout, key: ItemKey): number {
  if (key === 'plane') return l.plane ? 1 : 0;
  if (key === 'lid') return l.lid ? 1 : 0;
  return l[key];
}

/** 点了 key 以后的组合：常用道具加一个（一回合 1 个的是选上或取消）；锅盖选上或取消；纸飞机独占 */
export function addItem(l: Loadout, key: ItemKey): Loadout {
  if (key === 'plane') return l.plane ? PLAIN : { ...PLAIN, plane: true };
  const base = { ...l, plane: false };
  if (key === 'lid') return { ...base, lid: !l.lid };
  if (COMMONS[key].max === 1) return { ...base, [key]: l[key] ? 0 : 1 };
  return { ...base, [key]: l[key] + 1 };
}

/** "已选"那一行点一项：减一个 */
export function removeItem(l: Loadout, key: ItemKey): Loadout {
  if (key === 'plane') return { ...l, plane: false };
  if (key === 'lid') return { ...l, lid: false };
  return { ...l, [key]: Math.max(0, l[key] - 1) };
}

/** 道具栏每个按钮现在的样子：选了几个、还能不能再加一个（体力、上限、组合），特殊道具这一局还剩几次 */
export function itemViews(s: State, l: Loadout): ItemView[] {
  const me = s.chars[s.actor]!;
  return ITEMS.map(({ key, label, title }) => {
    const n = count(l, key);
    const special = key === 'plane' || key === 'lid' ? key : null;
    const cost = special ? SPECIALS[special].cost : COMMONS[key as Common].cost;
    const once = isOnce(key);
    // 一回合 1 个的、已经选上了：再点是取消，不算"买不起"
    const can = once && n > 0 ? true : !loadoutBlocked(s, me, addItem(l, key)) && !(special && me.special[special] <= 0);
    return { key, label, title, cost, count: n, once, can, ...(special ? { uses: me.special[special] } : {}) };
  });
}

/** 上面那一行：已选的每一种，"连发+1 ×2" */
export function pickedList(l: Loadout): { key: ItemKey; text: string }[] {
  return ITEMS.flatMap(({ key }) => {
    const n = count(l, key);
    if (!n) return [];
    return [{ key, text: n > 1 ? `${LABEL[key]} ×${n}` : LABEL[key] }];
  });
}
