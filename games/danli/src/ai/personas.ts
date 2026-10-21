/**
 * 电脑人物（DESIGN.md 第 5 节）。名字要登记进平台的保留昵称（platform/worker/api/validate.ts 的 RESERVED_PERSONAS），
 * 真人不许起同样的昵称冒充电脑；独立部署时 worker/route.ts 把它们传给 kit 的游客昵称清洗。
 * 0.2.0 起 6 位，一档强弱。性格先只体现在挑武器上（weapons 是偏好，第一把是默认）：准备房间里电脑的座位默认拿第一把，玩家可以替它换。
 */
import type { Look } from '../core/types.ts';
import type { WeaponId } from '../core/weapons.ts';

export interface Persona {
  id: string;
  name: string;
  /** 外观：哪只小动物（DESIGN.md 2.6：角色只换外观） */
  look: Look;
  /** 一句话性格（准备房间里换人物时看） */
  line: string;
  /** 偏好的武器，按喜欢的程度排；第一把是默认 */
  weapons: readonly [WeaponId, ...WeaponId[]];
}

export const PERSONAS: readonly Persona[] = [
  { id: 'juzi', name: '橘子', look: 'cat', line: '稳稳当当，什么都会一点', weapons: ['steamer', 'carrot'] },
  { id: 'tuantuan', name: '团团', look: 'panda', line: '慢吞吞，皮最厚，挨几下不怕', weapons: ['milktea', 'frisbee'] },
  { id: 'qiqi', name: '企企', look: 'penguin', line: '守得住，爱打又低又平的球', weapons: ['paddle', 'slipper'] },
  { id: 'chaichai', name: '柴柴', look: 'shiba', line: '大大咧咧，专挑大坑砸', weapons: ['melon', 'steamer'] },
  { id: 'tutu', name: '兔兔', look: 'rabbit', line: '一蹦老高，爱往天上放', weapons: ['rocket', 'melon'] },
  { id: 'shushu', name: '鼠鼠', look: 'mouse', line: '闷头挖地，专挖别人脚下', weapons: ['carrot', 'slipper'] },
];

export function personaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** 电脑按性格挑的武器（准备房间里电脑座位的默认） */
export function favoriteWeapon(p: Persona): WeaponId {
  return p.weapons[0];
}
