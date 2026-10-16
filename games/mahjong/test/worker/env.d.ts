import type { Env as WorkerEnv } from '../../worker/main.ts';
import type { FakeEnv } from '../fake-wallet.ts';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv, FakeEnv {}
    interface GlobalProps {
      mainModule: typeof import('./entry.ts');
    }
  }
}
