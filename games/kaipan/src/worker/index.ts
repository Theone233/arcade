import type { Env } from './gate.ts';
import { route } from './route.ts';

/**
 * 开盘的 Worker 入口。逻辑都在 ./route.ts（分流）、./gate.ts（登录闸门）、./live.ts（实盘钱包接口）：
 * 入口模块里的具名导出会被运行时当成入口点，所以这里只导出 default（导出常量会让 Worker 起不来）。
 */
export default {
  fetch: (req: Request, env: Env): Promise<Response> => route(req, env),
};
