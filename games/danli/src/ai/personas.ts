/**
 * 电脑人物（DESIGN.md 第 5 节）。名字要登记进平台的保留昵称（platform/worker/api/validate.ts 的 RESERVED_PERSONAS），
 * 真人不许起同样的昵称冒充电脑；独立部署时 worker/main.ts 把它们传给 kit 的游客昵称清洗。
 * M1 只有一位、一档；性格和三档强弱 M2 再做。
 */
export interface Persona {
  id: string;
  name: string;
  /** 外观：哪只小动物（DESIGN.md 2.6：角色只换外观） */
  look: 'shiba' | 'panda' | 'cat' | 'penguin';
}

export const PERSONAS: readonly Persona[] = [{ id: 'juzi', name: '橘子', look: 'cat' }];
