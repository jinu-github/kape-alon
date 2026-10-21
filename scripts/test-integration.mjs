import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'apps/api/test/customer.integration.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, INTEGRATION_TESTS: '1' } },
);
process.exit(result.status ?? 1);
