/**
 * 平台钱包的 RPC（docs/platform-backend.md 5.9）：服务绑定 WALLET → arcade 的 WalletService，绑定上写 props.game = "texas"。
 * 德州只在两处调它：单机的带入、结回（main.ts 的 api/solo/*，client 模式）和好友房的 TexasRoom.perform（server 模式）。
 * 业务上的拒绝走返回值 { ok: false, error }；抛错的是连不上（调用方当"可能到了"处理，用同一个操作 id 重办）。
 */
import type { SettleStats } from '../src/core/fame.ts';
import type { StakesId } from '../src/core/stakes.ts';
import type { Mode, WalletReply } from '../src/net/wallet.ts';

interface Base {
  userId: string;
  game: 'texas';
  /** 钱包里"桌上那一份"的号，8–64 位 [A-Za-z0-9_-] */
  ref: string;
  mode: Mode;
  /** 操作 id，8–64 位 [A-Za-z0-9_-]，平台按游戏去重 */
  op: string;
}

/** 德州用到的两个方法（看钱包页面直接走平台的 /api/wallet；refund 只给没打就走用，单机一坐下就发牌、好友房按筹码结，用不上） */
export interface PlatformWallet {
  /** 带入：新开一份只要余额够这次带入（平台 0.10.2）；同一 ref、同一档、同一 mode 才能加（补码）；until 最多 24 小时 */
  buyin(req: Base & { tier: StakesId; amount: number; until: number }): Promise<WalletReply>;
  /** 结回：清掉那一份，没有回 no_stake、到期退回过的回 expired；client 模式超过每日上限的在 capped 里 */
  settle(req: Base & { amount: number; stats?: SettleStats | unknown }): Promise<WalletReply & { statsIgnored?: string }>;
}

export const GAME = 'texas' as const;

/** ref、op 的格式（平台同样的检查，这里先挡掉，免得白调一次） */
export const WALLET_ID = /^[A-Za-z0-9_-]{8,64}$/;
