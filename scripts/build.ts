import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const RELEASE_DIR = 'release';
const ARCHIVE_NAME = 'gemini-proxy.tar.gz';

async function main() {
  process.stdout.write('[1/4] Cleaning release directory...\n');
  rmSync(RELEASE_DIR, { recursive: true, force: true });
  mkdirSync(RELEASE_DIR, { recursive: true });

  process.stdout.write('[2/4] Bundling with esbuild...\n');
  await build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: join(RELEASE_DIR, 'server.mjs'),
    minify: false,
    sourcemap: false,
    packages: 'external',
  });

  process.stdout.write('[3/4] Copying static assets...\n');
  cpSync('public', join(RELEASE_DIR, 'public'), { recursive: true });

  writeFileSync(
    join(RELEASE_DIR, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );

  process.stdout.write('[4/4] Creating archive...\n');
  execSync(`tar -czf ${ARCHIVE_NAME} -C ${RELEASE_DIR} .`, { stdio: 'inherit' });

  process.stdout.write(`\nBuild complete!\n`);
  process.stdout.write(`  Bundle:  ${RELEASE_DIR}/server.mjs\n`);
  process.stdout.write(`  Archive: ${ARCHIVE_NAME}\n`);
}

main().catch((err) => {
  process.stderr.write(`Build failed: ${String(err)}\n`);
  process.exit(1);
});
