// Solara Bay — the entry program for make.fun's gta6-01 competition.
// Node 22, standard library only. It hands the game in: copy this repo's
// game/ and screenshots/ beside this file into the output directory
// (/output in the grader, or $MAKEFUN_OUTPUT_DIR elsewhere) and write
// /output/dossier.json with the vendored make.fun library's buildDossier.
// The game itself is plain static files under game/ — no build step, no
// network at runtime — so the copy is the whole hand-in.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's own caps: text_max_bytes shapes the dossier text, and the rest
// refuse exactly what the scorer would refuse — more than 4 screenshots or
// one over 256 KiB, more than 993 files in game/ or 48 MiB of game files in
// all, or a game path over 1000 bytes. game/ shares /output's 1000-entry cap
// with screenshots/ and dossier.json, so these limits leave room for both.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
