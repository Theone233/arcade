/**
 * 开盘 Worker 的分流：/games/kaipan/api/*（实盘钱包接口，./live.ts）不看 GATE、总要认人；其余交给登录闸门（./gate.ts）。
 * 两条路径都要列在 wrangler.jsonc 的 assets.run_worker_first 里才会进到 Worker。
 */
import { ME_TIMEOUT_MS, handle, type Env } from './gate.ts';
import { WALLET_TIMEOUT_MS, handleLive } from './live.ts';

const API_PREFIX = '/games/kaipan/api/';

/** timeoutMs 给测试用：不传时闸门按 3 秒、钱包按 5 秒 */
export function route(req: Request, env: Env, timeoutMs?: number): Promise<Response> {
  if (new URL(req.url).pathname.startsWith(API_PREFIX)) return handleLive(req, env, timeoutMs ?? WALLET_TIMEOUT_MS);
  return handle(req, env, timeoutMs ?? ME_TIMEOUT_MS);
}
