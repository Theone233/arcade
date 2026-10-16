/**
 * 钱包的状态（docs/platform-backend.md 5.9、15.9）：登录后问一次 /api/wallet，顶栏的小牌子和钱包页共用；
 * 打开钱包页时再刷新一次。不轮询：余额只在游戏里变，回到平台看个大概就够，要准的进钱包页。
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type LedgerEntry, type Wallet } from './api.ts';
import { useSession } from './session.tsx';

interface WalletState {
  wallet: Wallet | null;
  /** 补给补到多少（服务端给的，现在是 2,000） */
  reliefTo: number;
  /** 单机实盘每个游戏每天最多赢几份（服务端给的，0.10.2 起 10） */
  winUnits: number;
  /** 今天各游戏带筹码上过桌的人数（大厅卡片上显示，0.9.9） */
  playing: Record<string, number>;
  /** 自己最近 30 笔进出，新的在前（钱包页"最近进出"，0.10.10） */
  ledger: LedgerEntry[];
  /** 本周各游戏的净赢，这周玩过的才有（大厅卡片上显示，0.10.12） */
  week: Record<string, number>;
  /** 读不到时的一句话（顶栏不显示，钱包页显示） */
  error: unknown;
  refresh: () => Promise<void>;
  /** 领补给之后用服务端回的钱包直接换上，不再多问一次 */
  set: (w: Wallet) => void;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [reliefTo, setReliefTo] = useState(2_000);
  const [winUnits, setWinUnits] = useState(10);
  const [playing, setPlaying] = useState<Record<string, number>>({});
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [week, setWeek] = useState<Record<string, number>>({});
  const [error, setError] = useState<unknown>(null);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    try {
      const r = await api.wallet();
      setWallet(r.wallet);
      setReliefTo(r.reliefTo);
      setPlaying(r.playing ?? {});
      setLedger(r.ledger ?? []);
      setWeek(r.week ?? {});
      if (r.winUnits) setWinUnits(r.winUnits);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  // 换了人（登录、退出、会话失效）：清掉上一个人的，登录着就问一次
  useEffect(() => {
    setWallet(null);
    setLedger([]);
    setWeek({});
    setError(null);
    if (userId) void refresh();
  }, [userId, refresh]);

  return <Ctx.Provider value={{ wallet, reliefTo, winUnits, playing, ledger, week, error, refresh, set: setWallet }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useWallet 要在 WalletProvider 里用');
  return s;
}
