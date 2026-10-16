/**
 * 本机试 Worker 时代替平台的假 arcade（冒烟 scripts/smoke-room.ts），不部署：
 * cookie __Host-sid=<id> 就认作这个人，没有就是没登录；钱包用 test/fake-wallet.ts（RPC 和浏览器的 /api/wallet*）。
 */
import { walletHttp, type FakeEnv } from './fake-wallet.ts';

export { FakeBank, WalletService } from './fake-wallet.ts';

export default {
  async fetch(request: Request, env: FakeEnv): Promise<Response> {
    const wallet = await walletHttp(request, env);
    if (wallet) return wallet;
    const sid = /__Host-sid=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
    return Response.json({ user: sid ? { id: sid, displayName: `本机${sid}` } : null });
  },
};
