/**
 * 一场的筹码账（DESIGN.md 2.8、第 4 节），各玩法共用：付钱（付不起按比例）、给钱包的小结。
 * 筹码是整数；所有运算只有加减乘和整除，不用平台相关的数学函数。
 */

/** 一笔钱：from 付给 to。kind 是玩法自己的分类（川麻：hu、zimo、kan、pig、cha、tax、move） */
export interface Payment {
  kind: string;
  from: number;
  to: number;
  amount: number;
  /** 玩法附带的说明（比如哪一杠），给退税、呼叫转移找回去用 */
  ref?: number;
}

/**
 * 一个人同时付给几个人（自摸以外的"一家付多家"，比如花猪赔三家）：付得起照付；付不起有多少付多少，
 * 按应付的比例分（向下取整），零头按 dues 的顺序一个一个补。返回实际付了的几笔（金额 0 的不记）。
 */
export function payMany(chips: number[], from: number, dues: readonly { to: number; amount: number }[], kind: string, ref?: number): Payment[] {
  const want = dues.reduce((a, d) => a + d.amount, 0);
  const have = Math.max(0, chips[from]!);
  const paid = dues.map((d) => (want <= have ? d.amount : Math.floor((d.amount * have) / want)));
  let left = Math.min(want, have) - paid.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % dues.length) {
    if (paid[i]! < dues[i]!.amount) {
      paid[i]!++;
      left--;
    }
  }
  const out: Payment[] = [];
  dues.forEach((d, i) => {
    const amount = paid[i]!;
    if (amount <= 0) return;
    chips[from]! -= amount;
    chips[d.to]! += amount;
    out.push({ kind, from, to: d.to, amount, ...(ref === undefined ? {} : { ref }) });
  });
  return out;
}

/** 一个人付给一个人（付不起有多少付多少） */
export function payOne(chips: number[], from: number, to: number, amount: number, kind: string, ref?: number): Payment[] {
  return payMany(chips, from, [{ to, amount }], kind, ref);
}

/**
 * 给平台钱包 settle 带的小结（docs/platform-backend.md 5.10）：JSON 后 ≤ 256 字节，不合格平台整份忽略、钱照常结。
 * 字段的意思由游戏定：rounds 局数、wins 胡了几局、best 这一份里最大一局净赢；称号和自定义数的 key 带玩法前缀。
 */
export interface SettleStats {
  rounds: number;
  wins: number;
  best: number;
  titles?: string[];
  max?: Record<string, number>;
  sum?: Record<string, number>;
}

export const MAX_TITLES = 5;
export const TITLE_ID = /^[a-z][a-z0-9_]{0,23}$/;
