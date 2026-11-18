// Solmar Heat, the gta6-01 entry program (Node 22, standard library only).
//
// What it does, in plain terms: it takes this repository's game/ folder (the
// whole open-world game, plain static files a desktop browser loads offline)
// and the screenshots/ folder, copies both into the grader's output directory,
// and writes output/dossier.json with the kit's vendored library. The dossier
// is the summary the judge reads: the screenshots plus the game's source text.
//
// The grader runs this program twice and both runs must write identical bytes,
// so there is no clock, no randomness and no network here: just copies and the
// deterministic dossier build. Outside the grader, MAKEFUN_OUTPUT_DIR stands
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyEntryFolder(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyEntryFolder('game');
copyEntryFolder('screenshots');

// The scorer's caps, as the gate states them: the dossier text is capped at
// 160 KiB, at most 4 screenshots of 256 KiB each, game/ holds at most 993
// files and 48 MiB, and no path under game/ is longer than 1000 bytes. The
// dossier builder enforces the text cap; the rest are refused here so a bad
// entry fails loudly at build time instead of silently at the gate.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
