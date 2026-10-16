/**
 * 掼蛋 Worker 的请求处理：默认导出，逻辑在 gate.ts（登录闸门 + 房间路由）。
 * 这个文件只有默认导出、不引用房间类，闸门测试（普通 Node 里的 vitest）才能直接引用它；
 * 部署入口是 main.ts，在这里的默认导出之外再具名导出房间类 Room。
 */
import { handle, type Env } from './gate.ts';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
