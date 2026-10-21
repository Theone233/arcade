/**
 * 准备房间的设置（DESIGN.md 5.5）和设置存档 danli.prefs（DESIGN.md 第 8 节）。
 * 房间只在浏览器里（单机）：对阵、地图（或"随机"）、我的样子和武器、电脑座位的人物和武器。点"开打"时换成规则核心的开局设置（Setup）。
 * 读存档时逐项检查，哪一项读不出来就用默认值，不整个丢掉。
 * 同一只小动物一局只上一次（设计稿）：我和五个电脑座位的样子互不相同；换成别人身上的那只就和他对调。
 * 存储由调用方传进来（页面里是 localStorage），这样能在 Node 里测。
 */
import { favoriteWeapon, personaById, PERSONAS } from './ai/personas.ts';
import { isMapId, MAP_IDS, type MapId } from './core/maps.ts';
import { LOOKS, type Look, type PlayerSetup, type Setup } from './core/types.ts';
import { isWeaponId, type WeaponId } from './core/weapons.ts';

export const PREFS_KEY = 'danli.prefs';

export type TeamSize = 1 | 2 | 3;
export const SIZES: readonly TeamSize[] = [1, 2, 3];

/** 一个电脑座位：哪位人物、拿什么武器 */
export interface BotSeat {
  persona: string;
  weapon: WeaponId;
}

export interface RoomConfig {
  size: TeamSize;
  map: MapId | 'random';
  me: { look: Look; weapon: WeaponId };
  /** 蓝队 2、3 号位（我的队友），一直存满 2 个，按对阵截取：换对阵时之前的选择不丢 */
  mates: BotSeat[];
  /** 黄队 1–3 号位，一直存满 3 个 */
  foes: BotSeat[];
}

export interface Prefs {
  v: 1;
  muted: boolean;
  room: RoomConfig;
}

const bot = (id: string): BotSeat => ({ persona: id, weapon: favoriteWeapon(personaById(id)!) });

/**
 * 默认阵容（策划 2026-10-21 定：两队武器均衡，两队各有一把大范围的；电脑还是拿自己性格偏好的武器，只调谁和谁一队）：
 * 我是柴柴的样子、拿西瓜投石器（大）；1v1 对兔兔（冲天烟花筒，大）；2v2 再加橘子（包子蒸笼）对鼠鼠（萝卜钻），都是中范围；
 * 3v3 再加团团（奶茶炮）对企企（弹弹球拍）。
 */
export function defaultRoom(): RoomConfig {
  return {
    size: 1,
    map: 'kitchen',
    me: { look: 'shiba', weapon: 'melon' },
    mates: [bot('juzi'), bot('tuantuan')],
    foes: [bot('tutu'), bot('shushu'), bot('qiqi')],
  };
}

export function defaultPrefs(): Prefs {
  return { v: 1, muted: false, room: defaultRoom() };
}

/** 五个电脑座位的顺序：队友 2 个、对手 3 个 */
export function botSeats(r: RoomConfig): BotSeat[] {
  return [...r.mates, ...r.foes];
}

/** 读进来的房间设置：逐项检查，坏了的用默认值；电脑人物重复的换成没人用的 */
export function parseRoom(raw: unknown): RoomConfig {
  const d = defaultRoom();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const me = (r.me && typeof r.me === 'object' ? r.me : {}) as Record<string, unknown>;
  const seats = (list: unknown, fallback: BotSeat[]): BotSeat[] =>
    fallback.map((f, i) => {
      const s = Array.isArray(list) ? (list[i] as Record<string, unknown> | undefined) : undefined;
      const persona = s && typeof s.persona === 'string' && personaById(s.persona) ? s.persona : f.persona;
      return { persona, weapon: s && isWeaponId(s.weapon) ? s.weapon : favoriteWeapon(personaById(persona)!) };
    });
  const out: RoomConfig = {
    size: SIZES.includes(r.size as TeamSize) ? (r.size as TeamSize) : d.size,
    map: r.map === 'random' || isMapId(r.map) ? (r.map as MapId | 'random') : d.map,
    me: { look: LOOKS.includes(me.look as Look) ? (me.look as Look) : d.me.look, weapon: isWeaponId(me.weapon) ? me.weapon : d.me.weapon },
    mates: seats(r.mates, d.mates),
    foes: seats(r.foes, d.foes),
  };
  // 小动物不重复（我也算）：后面重复的换成还没人用的（换了人物，武器跟着换成新人物喜欢的）
  const all = botSeats(out);
  const seen = new Set<Look>([out.me.look]);
  for (const s of all) {
    const look = personaById(s.persona)!.look;
    if (seen.has(look)) {
      const free = PERSONAS.find((p) => !seen.has(p.look) && !all.some((o) => o !== s && o.persona === p.id))!;
      s.persona = free.id;
      s.weapon = favoriteWeapon(free);
    }
    seen.add(personaById(s.persona)!.look);
  }
  return out;
}

function copyRoom(r: RoomConfig): RoomConfig {
  return { ...r, me: { ...r.me }, mates: r.mates.map((s) => ({ ...s })), foes: r.foes.map((s) => ({ ...s })) };
}

/** 哪个人物是这只小动物 */
function personaOfLook(look: Look): string {
  return PERSONAS.find((p) => p.look === look)!.id;
}

/**
 * 给某个电脑座位换人物：别的电脑座位已经是这位就和它对调；我是这只小动物，就我换成这个座位原来那只。
 * 换上的人物拿他喜欢的武器。
 */
export function setPersona(r: RoomConfig, seat: number, persona: string): RoomConfig {
  const next = copyRoom(r);
  const all = botSeats(next);
  const cur = all[seat]!;
  const look = personaById(persona)!.look;
  const other = all.find((s, i) => i !== seat && s.persona === persona);
  if (other) {
    other.persona = cur.persona;
    other.weapon = favoriteWeapon(personaById(cur.persona)!);
  } else if (next.me.look === look) next.me.look = personaById(cur.persona)!.look;
  cur.persona = persona;
  cur.weapon = favoriteWeapon(personaById(persona)!);
  return next;
}

/** 我换小动物：哪个电脑座位是这只，就和我对调（他换成我原来那只的人物，拿那位喜欢的武器） */
export function setMyLook(r: RoomConfig, look: Look): RoomConfig {
  const next = copyRoom(r);
  const other = botSeats(next).find((s) => personaById(s.persona)!.look === look);
  if (other) {
    const swap = personaById(personaOfLook(next.me.look))!;
    other.persona = swap.id;
    other.weapon = favoriteWeapon(swap);
  }
  next.me.look = look;
  return next;
}

/** 点"开打"：房间设置换成开局设置。座位顺序：蓝队（我、队友），再黄队；"随机"地图由 pick 定 */
export function roomSetup(r: RoomConfig, myName: string, pick: (ids: readonly MapId[]) => MapId): Setup {
  const players: PlayerSetup[] = [{ name: myName, team: 0, look: r.me.look, weapon: r.me.weapon, ai: false }];
  const add = (s: BotSeat, team: 0 | 1): void => {
    const p = personaById(s.persona)!;
    players.push({ name: p.name, team, look: p.look, weapon: s.weapon, ai: true });
  };
  for (const s of r.mates.slice(0, r.size - 1)) add(s, 0);
  for (const s of r.foes.slice(0, r.size)) add(s, 1);
  return { map: r.map === 'random' ? pick(MAP_IDS) : r.map, players };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPrefs(store: Store | null): Prefs {
  try {
    const raw = store?.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return defaultPrefs();
    return { v: 1, muted: p.muted === true, room: parseRoom(p.room) };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(store: Store | null, p: Prefs): void {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // 存不上（隐私模式、满了）就只记这一次
  }
}
