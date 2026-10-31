#!/usr/bin/env node
// conflicts.mjs — find name collisions and overlapping routing triggers in the installed skills.
//
// Routing in DSH is description-only: the catalog renders name + a capped description, and the
// model picks between them with no other signal. Two skills whose descriptions promise the same
// thing are therefore a real defect — the model can route to the wrong one, or flip between them
// across turns. Exact name collisions are the other failure: the registry resolves by rank, so a
// duplicate silently shadows one of them.
//
// What it reports, in order:
//   1. exact name collisions (same name from more than one entry)
//   2. alias collisions (a flat <name>.md beside a bundle of the same name)
//   3. cross-set trigger overlap: every ds-* skill against every non-ds skill in the same roots,
//      scored on distinctive description words (Jaccard), with the shared words shown.
//
// Usage:
//   node tools/conflicts.mjs                       default: ~/.agents/skills vs the manifest
//   node tools/conflicts.mjs --root <dir>          another installed root
//   node tools/conflicts.mjs --min 0.15            overlap threshold
//   node tools/conflicts.mjs --json                machine-readable

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const root = resolve(flag('--root') || join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills'));
const manifestPath = flag('--manifest') || join(dirname(root), '.ds-stack-manifest.json');
const minScore = Number(flag('--min') ?? 0.12);
const asJson = argv.includes('--json');

if (!existsSync(root)) { console.error(`no such root: ${root}`); process.exit(1); }

const STOP = new Set(('a an the and or but if then than that this these those to of in on at for with without '
  + 'from by as is are was were be been being it its their your you we i they he she not no do does did done '
  + 'use uses used using when while before after so such can could should would may might must will shall '
  + 'one two first next last any all each every other same own just only also very more most much many '
  + 'skill skills agent agents task tasks work works working help helps').split(' '));

function words(text) {
  return new Set(
    String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function readEntries(dir, sourceLabel) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    let file = null;
    let kind = null;
    if (st.isDirectory() && existsSync(join(p, 'SKILL.md'))) { file = join(p, 'SKILL.md'); kind = 'bundle'; }
    else if (st.isFile() && name.endsWith('.md')) { file = p; kind = 'flat'; }
    if (!file) continue;
    const text = readFileSync(file, 'utf8');
    const nameM = /^name:\s*(.*)$/m.exec(text);
    const descM = /^description:\s*(.*)$/m.exec(text);
    const unq = (s) => String(s ?? '').trim().replace(/^["']|["']$/g, '');
    out.push({
      id: unq(nameM?.[1]) || basename(name, '.md'),
      entry: kind === 'flat' ? basename(name, '.md') : name,
      kind,
      description: unq(descM?.[1]),
      file,
      source: sourceLabel,
    });
  }
  return out;
}

// Ground truth for "ours": the manifest this repo wrote.
let mine = new Set();
if (existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    mine = new Set([...Object.keys(m.skills || {}), ...Object.keys(m.aliases || {})]);
  } catch { /* ignore */ }
}

const entries = readEntries(root, 'agents');
for (const e of entries) e.ours = mine.has(e.entry);

// 1. exact name collisions -------------------------------------------------------------------
const byName = new Map();
for (const e of entries) {
  const k = e.id;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(e);
}
const nameCollisions = [...byName.entries()].filter(([, list]) => list.length > 1);

// 2. alias collisions: flat file and bundle claiming the same name ---------------------------------
const aliasCollisions = [];
const byEntry = new Map();
for (const e of entries) {
  if (!byEntry.has(e.entry)) byEntry.set(e.entry, []);
  byEntry.get(e.entry).push(e);
}
for (const [entry, list] of byEntry) {
  if (list.length > 1 && list.some((e) => e.kind === 'flat') && list.some((e) => e.kind === 'bundle')) {
    aliasCollisions.push({ entry, kinds: list.map((e) => e.kind) });
  }
}

// 3. trigger overlap, only across the ours/not-ours boundary ------------------------------------
const ours = entries.filter((e) => e.ours);
const theirs = entries.filter((e) => !e.ours);
for (const e of ours) e.words = words(e.description);
for (const e of theirs) e.words = words(e.description);

const pairs = [];
for (const a of ours) {
  for (const b of theirs) {
    const inter = [...a.words].filter((w) => b.words.has(w));
    const union = new Set([...a.words, ...b.words]);
    const score = union.size ? inter.length / union.size : 0;
    if (score >= minScore) pairs.push({ score, a: a.entry, b: b.entry, shared: inter.sort() });
  }
}
pairs.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a));

if (asJson) {
  console.log(JSON.stringify({ root, counts: { entries: entries.length, ours: ours.length, theirs: theirs.length }, nameCollisions, aliasCollisions, pairs }, null, 2));
  process.exit(nameCollisions.length || aliasCollisions.length ? 1 : 0);
}

console.log(`root: ${root}`);
console.log(`${entries.length} entries: ${ours.length} from this pack, ${theirs.length} pre-existing\n`);

console.log('== exact name collisions');
if (!nameCollisions.length) console.log('   none');
for (const [name, list] of nameCollisions) console.log(`   ${name}: ${list.map((e) => `${e.source}/${e.kind}`).join(', ')}`);

console.log('\n== alias collisions (flat file beside a bundle of the same name)');
if (!aliasCollisions.length) console.log('   none');
for (const c of aliasCollisions) console.log(`   ${c.entry}: ${c.kinds.join(' + ')}`);

console.log(`\n== overlapping triggers, this pack vs pre-existing (score >= ${minScore})`);
if (!pairs.length) console.log('   none');
for (const p of pairs) {
  console.log(`   ${p.score.toFixed(2)}  ${p.a.padEnd(18)} <-> ${p.b}`);
  console.log(`         shared: ${p.shared.join(', ')}`);
}

process.exit(nameCollisions.length || aliasCollisions.length ? 1 : 0);
