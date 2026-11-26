// Token Radar, entrypoint (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot, scores every pre-token protocol
// with model radar-2, and hands in the entry:
//
//   /output/board.json    the ranked board, one row per protocol
//   /output/data.js       the same board, compact, for the dashboard
//   /output/dashboard/   the static page (index.html, app.css, app.js)
//   /output/screenshots/ the three screenshots of that page
//   /output/dossier.json the judge's summary, written by the kit library
//
// The program runs twice in grading and both runs must write the same
// bytes, so there is no clock, no randomness and no network here: every
// number comes from the snapshot file it was given.
//
// Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

// The caps the scorer holds the entry to; the dossier's text cap shapes
// how much of the dashboard the judge reads whole.
const DOSSIER_TEXT_MAX = 65_536;
const SCREENSHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASHBOARD_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after `--name value` or `--name=value`, else `fallback`. */
function flag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === `--${name}` && i + 1 < argv.length) return argv[i + 1]!;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

function fail(message: string, code = 1): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(code);
}

/** The snapshot file out of `--input <file|dir>`, defaulting to the sealed /input. */
function snapshotPath(): string {
  const given = flag('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

const inputFile = snapshotPath();
if (!existsSync(inputFile)) {
  fail(
    `no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
    2,
  );
}

const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const refused = boardIssue(board, snapshot);
if (refused !== null) fail(`the model wrote a board the gate refuses: ${refused}`);

/** Write `text` to `path`, creating the parent directory first. */
function writeText(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

/** Copy every regular file of `from` into `to`, skipping dotfiles; returns the names copied. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

mkdirSync(outDir, { recursive: true });
writeText(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeText(join(outDir, 'data.js'), dataScript(radar));

const pageFiles = copyDir(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
if (!pageFiles.includes('index.html')) fail('dashboard/ holds no index.html');
if (!pageFiles.some((f) => f.endsWith('.css'))) fail('dashboard/ holds no stylesheet');
if (!pageFiles.some((f) => f.endsWith('.js'))) fail('dashboard/ holds no script');

const shots = copyDir(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier is written last: the scorer rebuilds it from this output and compares it byte for byte.
const dossierPath = join(outDir, 'dossier.json');
writeText(
  dossierPath,
  buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: SCREENSHOT_LIMIT,
    dashboard: DASHBOARD_LIMIT,
  }),
);
const dossierBytes = statSync(dossierPath).size;

process.stdout.write(
  `token-radar: ${snapshot.protocols.length} protocols in the snapshot, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token-radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${pageFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')} (${dossierBytes} bytes)\n`,
);
