/**
 * Jest cannot import @react-pdf/renderer (ESM). The fidelity check runs
 * under ts-node, the same loader the API uses to build the slip.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';

describe('printed slip matches the shown visit', () => {
  it('keeps every medicine and the other sections in the real PDF', () => {
    const script = path.join(__dirname, 'prescription-print-fidelity.check.ts');
    const result = spawnSync(
      'npx',
      ['ts-node', '--transpile-only', script],
      {
        cwd: path.join(__dirname, '../../..'),
        encoding: 'utf8',
        timeout: 90_000,
      },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'print fidelity check failed');
    }
    expect(result.stdout).toContain('print fidelity ok');
  }, 90_000);
});
