/**
 * danli Worker 的入口：default 是路由（./route.ts）；具名导出只放 wrangler.jsonc 里绑定的 Durable Object 类
 * （好友房 DanliRoom、kit 的计量 RoomMeter）。别的具名导出会让单独部署的 Worker 起不来，测试从 route.ts、room.ts 引。
 */
import { route, type Env } from './route.ts';

export { DanliRoom } from './room.ts';
export { RoomMeter } from 'arcade-kit/meter';

export default { fetch: route } satisfies ExportedHandler<Env>;
