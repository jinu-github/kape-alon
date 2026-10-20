import type { HealthResponse } from '@kape/shared';

export type DatabaseProbe = () => Promise<void>;
export async function getHealth(probe: DatabaseProbe): Promise<HealthResponse> {
  try {
    await probe();
    return { status: 'ok', service: 'api', database: 'up' };
  } catch {
    return { status: 'degraded', service: 'api', database: 'down' };
  }
}
