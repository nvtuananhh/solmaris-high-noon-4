// MARAVILLA BAY — submission entrypoint (round 13).
//
// What this program does, in plain terms: the playable game is the static
// folder `game/` next to this file (index.html plus its modules, runnable
// offline in a desktop browser), and `screenshots/` holds the four entry
// images. Running this file gathers both into the output directory and
// writes `dossier.json` there — the summary the judge reads — using the
// vendored make.fun library.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Local play:   node serve.ts, then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps below mirror the competition's own gate limits: at most four
// screenshots of 256 KiB each, at most 993 files / 48 MiB under game/, a
// 1 MiB index.html, and a dossier text budget of 163,840 bytes. Refusing
// here means the scorer would refuse the entry, so fail loudly instead
// of handing in something that cannot be judged.
const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
}

const dossier = buildDossier(outDir, GATE_LIMITS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`maravilla-bay dossier written to ${join(outDir, 'dossier.json')}`);
