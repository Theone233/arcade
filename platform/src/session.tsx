/** 登录状态：有登录提示 cookie 才去问 /api/me，没登录的访客不发任何请求。 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiFail, isNetworkFail, type Notice, setUnauthorizedHandler, type User } from './api.ts';

/** 登录后服务端设的提示 cookie（不是 HttpOnly）：有它才调接口，没登录的人一个请求都不发。 */
function hasLoginHint(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith('__Host-arcade_li='));
}

/**
 * ok：正常；readonly：服务器忙，只能看不能改；off：账号服务暂停（接口明确回了 busy）；
 * unreachable：连不上（断网，或者回来的不是我们的接口，比如 Cloudflare 的出错页），可以重试。
 */
export type Service = 'ok' | 'readonly' | 'off' | 'unreachable';

interface SessionState {
  /** 还在问服务器（只在有登录提示 cookie 时出现；超时重试期间也算）。 */
  loading: boolean;
  /** 第一次问 /api/me 超时或网络出错了，正在后台重试：大厅卡片不再等，直接给"进入游戏"（游戏有自己的登录闸门）。 */
  slow: boolean;
  user: User | null;
  service: Service;
  /** 云存档暂停（存档预算用完或停增长档）：游戏里的进度先存在本机。 */
  savesPaused: boolean;
  /** 大厅公告（0.10.8），管理员在管理页发、撤 */
  notice: Notice | null;
  setUser: (u: User | null) => void;
  /** 重新问一次 /api/me（"重试"按钮、在别的设备改过昵称）。 */
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(hasLoginHint);
  const [user, setUser] = useState<User | null>(null);
  const [service, setService] = useState<Service>('ok');
  const [savesPaused, setSavesPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 超时（8 秒，api.ts）或网络出错时再试 2 次，隔 1、2 秒；三次都不行才算"连不上"
  const refresh = useCallback(async () => {
    setLoading(true);
    for (let attempt = 0; ; attempt++) {
      try {
        const me = await api.me();
        setUser(me.user);
        setService(me.service);
        setSavesPaused(me.saves === 'paused');
        setNotice(me.notice ?? null);
        setSlow(false);
        break;
      } catch (e) {
        if (isNetworkFail(e) && attempt < 2) {
          setSlow(true);
          await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
          continue;
        }
        // 只有接口明确说 busy 才是停服；断网、网关出错页都算"连不上"，给重试
        setService(e instanceof ApiFail && e.code === 'busy' ? 'off' : 'unreachable');
        setUser(null);
        break;
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasLoginHint()) void refresh();
  }, [refresh]);

  // 任何请求回 401 unauthorized：会话在别处失效了（改了密码、退出其他设备、过期），这里也当成没登录
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  return <Ctx.Provider value={{ loading, slow, user, service, savesPaused, notice, setUser, refresh }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession 要在 SessionProvider 里用');
  return s;
}
