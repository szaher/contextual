#!/usr/bin/env node
/* global console */

/**
 * Post-build script: prepend #!/usr/bin/env node shebang
 * to compiled hook handler scripts and make them executable.
 */

import { readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = join(import.meta.dirname, '..', 'dist', 'scripts');
const SHEBANG = '#!/usr/bin/env node\n';

try {
  const files = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const filePath = join(SCRIPTS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(filePath, SHEBANG + content);
      chmodSync(filePath, 0o755);
    }
  }
  console.error(`Added shebangs to ${files.length} scripts`);
} catch {
  // No scripts dir yet — skip silently
  console.error('No scripts to process (dist/scripts/ not found)');
}
