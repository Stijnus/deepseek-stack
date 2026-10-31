#!/usr/bin/env node
// install.mjs — install the optimized ds-* skills and gesture aliases into the DSH user skill root.
//
// Target root: $DSH_AGENTS_HOME/skills or ~/.agents/skills  (DSH rank 500, "user-agents").
// A native provider root: it wins duplicate resolution against the .claude provider (rank 950)
// and is watched at depth 1, so an install reaches a RUNNING session without a restart.
//
// Sources:
//   skills/<name>/SKILL.md   the 29 optimized skills  -> <target>/<name>/
//   aliases/<name>.md        the 6 gesture aliases    -> <target>/<name>.md
// (Aliases are installed straight from aliases/. They are deliberately never copied through
//  skills/, because a diff-based patch pipeline must not be able to swallow them.)
//
// Safety, in order:
//   1. tools/stamp.mjs verify — the tree must be the output of a successful build. This is what
//      stops an unpatched or hand-edited tree from being shipped.
//   2. validate.mjs — the published skill contract.
//   3. a manifest (~/.agents/.ds-stack-manifest.json) records exactly what this tool owns. It
//      refuses to overwrite anything it did not install, and uninstall removes only its own.
//   4. Reconciliation — a name that disappeared from this repo is REMOVED from the target, so a
//      deleted alias cannot keep answering its gesture.
//   5. Post-install verification — byte comparison + a contract check of what actually landed.
//
// Usage:
//   node tools/install.mjs                 install
//   node tools/install.mjs --dry-run       show the plan only
//   node tools/install.mjs --verify-install   read-only: does the installed root still match this repo?
//   node tools/install.mjs --uninstall     remove what this tool installed, verifying sha256
//   node tools/install.mjs --force         also remove/replace entries that changed since install
//   node tools/install.mjs --target <dir>  override the skills root (must end in /skills)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsSrc = join(here, 'skills');
const aliasesSrc = join(here, 'aliases');
const upstreamDir = join(here, 'upstream', 'deepseek-stack', 'skills');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = has('--dry-run');
const uninstall = has('--uninstall');
const force = has('--force');

const agentsHome = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents');
const target = resolve(opt('--target') || join(agentsHome, 'skills'));
const manifestPath = join(dirname(target), '.ds-stack-manifest.json');
const node = process.execPath;

if (!target.endsWith('/skills')) {
  console.error(`refusing: target "${target}" does not look like a skills root (must end in /skills)`);
  process.exit(1);
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const humanSize = (n) => (n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}KB`);

/** Declared alias target: metadata.aliasOf, then a flat aliasOf:, then the body mention. */
function aliasTargetFrom(text) {
  const meta = /^metadata:[ \t]*\n((?:[ \t]+.*\n?)*)/m.exec(text);
  if (meta) {
    const a = /^[ \t]+aliasOf:[ \t]*["']?([^"'\s#]+)/m.exec(meta[1]);
    if (a) return a[1];
  }
  const flat = /^aliasOf:[ \t]*["']?([^"'\s#]+)/m.exec(text);
  if (flat) return flat[1];
  return /`(ds-[a-z0-9-]+)`/.exec(text)?.[1] ?? null;
}

/** Every regular file under dir, as paths relative to it. */
function filesUnder(dir, prefix = '') {
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...filesUnder(p, `${prefix}${n}/`));
    else if (st.isFile()) out.push(`${prefix}${n}`);
  }
  return out;
}

function readManifest() {
  if (!existsSync(manifestPath)) return { version: 2, skills: {}, aliases: {} };
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return { version: 2, skills: {}, aliases: {} }; }
}

const manifest = readManifest();
const ownedSkills = new Set(Object.keys(manifest.skills || {}));
const ownedAliases = new Set(Object.keys(manifest.aliases || {}));

// ---------------------------------------------------------------- uninstall
//
// Ownership is not permission to delete. The manifest records the sha256 written at install time;
// a mismatch means the file changed afterwards — a local edit, a different pack, or a hand-written
// skill that happens to reuse the name. Removing it would destroy work, so uninstall verifies
// first and keeps anything it cannot account for. `--force` overrides, deliberately.
if (uninstall) {
  const entries = [];
  for (const n of ownedSkills) {
    entries.push({ kind: 'skill', name: n, dest: join(target, n), recorded: manifest.skills?.[n]?.sha256 ?? null });
  }
  for (const n of ownedAliases) {
    entries.push({ kind: 'alias', name: n, dest: join(target, `${n}.md`), recorded: manifest.aliases?.[n]?.sha256 ?? null });
  }

  // Skills were recorded by their SKILL.md digest; aliases are a single file.
  // A skill is a directory. Checking only SKILL.md left any other file unprotected — editing
  // scripts/watch_pr.py and uninstalling would delete it silently. Every recorded file is compared,
  // and an unexpected extra file is treated as a change too (safer to keep than to delete).
  const violation = (e) => {
    if (e.kind === 'alias') {
      return !e.recorded || sha(e.dest) === e.recorded ? null : 'sha256 differs — changed since install';
    }
    const rec = manifest.skills?.[e.name];
    if (!rec) return 'no manifest entry for this directory';
    if (rec.fileHashes) {
      const now = filesUnder(e.dest);
      const recorded = Object.keys(rec.fileHashes);
      if (now.length !== recorded.length) return 'file list changed since install';
      for (const rel of now) {
        if (!(rel in rec.fileHashes)) return `unexpected file "${rel}"`;
        if (sha(join(e.dest, rel)) !== rec.fileHashes[rel]) return `"${rel}" changed since install`;
      }
      return null;
    }
    // Older manifests recorded only SKILL.md; keep that behaviour rather than refusing loudly.
    const sk = join(e.dest, 'SKILL.md');
    if (!existsSync(sk)) return 'SKILL.md is missing';
    return rec.sha256 && sha(sk) === rec.sha256 ? null : 'sha256 differs — changed since install';
  };

  const toRemove = [];
  const toKeep = [];
  const alreadyGone = [];
  for (const e of entries) {
    if (!existsSync(e.dest)) { alreadyGone.push(e); continue; }
    if (force) { toRemove.push(e); continue; }
    const why = violation(e);
    if (why) toKeep.push({ ...e, why });
    else toRemove.push(e);
  }

  if (!toRemove.length && !toKeep.length && !alreadyGone.length) {
    console.log('nothing to uninstall: no manifest-owned entries in ' + target);
    process.exit(0);
  }

  for (const e of toRemove) {
    console.log(`${dryRun ? 'would remove' : 'remove'}  ${e.dest}  ${force ? '(forced)' : '(sha256 verified)'}`);
    if (!dryRun) rmSync(e.dest, { recursive: true, force: true });
  }
  for (const e of toKeep) {
    console.log(`${dryRun ? 'would keep  ' : 'keep      '}${e.dest}  — ${e.why}; use --force to delete`);
  }
  for (const e of alreadyGone) {
    console.log(`already gone  ${e.dest}`);
  }

  if (!dryRun) {
    // Only forget what is actually no longer installed, so a kept entry stays discoverable.
    for (const e of [...toRemove, ...alreadyGone]) {
      if (e.kind === 'skill') { if (manifest.skills) delete manifest.skills[e.name]; }
      else { if (manifest.aliases) delete manifest.aliases[e.name]; }
    }
    manifest.uninstalledAt = new Date().toISOString();
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  console.log(`\n${dryRun ? 'would remove' : 'removed'} ${toRemove.length} entrie(s)` +
    (toKeep.length ? `, kept ${toKeep.length} (unverified — see above)` : '') +
    (alreadyGone.length ? `, ${alreadyGone.length} already absent` : '') +
    `; manifest ${dryRun ? 'unchanged' : 'updated'}`);
  process.exit(toKeep.length ? 1 : 0);
}

// ---------------------------------------------------------------- verify-install (read-only)
//
// Contract validation (tools/validate.mjs) proves the installed root is *well-formed*. It says
// nothing about whether it is *current*: a stale alias left behind after the repo dropped it, or a
// skill directory edited in place, still validates clean. This compares content byte-for-byte.
if (has('--verify-install')) {
  const srcSkills = existsSync(skillsSrc)
    ? readdirSync(skillsSrc).filter((n) => statSync(join(skillsSrc, n)).isDirectory()).sort()
    : [];
  const srcAliases = existsSync(aliasesSrc)
    ? readdirSync(aliasesSrc).filter((n) => n.endsWith('.md') && statSync(join(aliasesSrc, n)).isFile()).map((n) => basename(n, '.md')).sort()
    : [];
  const missing = [];
  const different = [];
  const stale = [];

  for (const n of srcSkills) {
    const dst = join(target, n);
    if (!existsSync(dst)) { missing.push(`skills/${n}/`); continue; }
    for (const f of filesUnder(join(skillsSrc, n))) {
      const a = join(skillsSrc, n, f);
      const b = join(dst, f);
      if (!existsSync(b)) missing.push(`skills/${n}/${f}`);
      else if (sha(a) !== sha(b)) different.push(`skills/${n}/${f}`);
    }
  }
  for (const n of srcAliases) {
    const a = join(aliasesSrc, `${n}.md`);
    const b = join(target, `${n}.md`);
    if (!existsSync(b)) missing.push(`${n}.md`);
    else if (sha(a) !== sha(b)) different.push(`${n}.md`);
  }
  // Owned by the manifest, still installed, but no longer produced by this repo.
  for (const n of ownedSkills) if (!srcSkills.includes(n) && existsSync(join(target, n))) stale.push(`skills/${n}/`);
  for (const n of ownedAliases) if (!srcAliases.includes(n) && existsSync(join(target, `${n}.md`))) stale.push(`${n}.md`);

  for (const m of missing) console.log(`missing    ${m}   (in this repo, not installed)`);
  for (const d of different) console.log(`differs    ${d}   (installed content changed)`);
  for (const s of stale) console.log(`stale      ${s}   (installed, no longer produced by this repo)`);

  const drift = missing.length + different.length + stale.length;
  if (drift) {
    console.log(`\n${drift} drift(s) between ${target} and this repo — run: node tools/install.mjs`);
    process.exit(1);
  }
  console.log(`installed root matches this repo: ${srcSkills.length} skill(s) + ${srcAliases.length} alias(es) byte-identical`);
  process.exit(0);
}

// ---------------------------------------------------------------- gate 1: build stamp
try {
  execFileSync(node, [join(here, 'tools', 'stamp.mjs'), 'verify'], { stdio: 'pipe' });
} catch (e) {
  console.error(String(e.stderr || e.message).trim());
  process.exit(1);
}

// ---------------------------------------------------------------- gate 2: contract
console.log('validating…');
try {
  // upstream/ is fetched on demand and may be absent on a fresh clone; the body-preservation
  // comparison is a WARN, not a gate, so only pass it when the tree is actually there.
  const upArgs = existsSync(upstreamDir) ? ['--upstream', upstreamDir] : [];
  execFileSync(node, [join(here, 'tools', 'validate.mjs'), skillsSrc, '--aliases', aliasesSrc, '--expect-aliases', '6', ...upArgs], { stdio: 'pipe' });
  console.log('validation passed\n');
} catch (e) {
  console.error('validation FAILED — not installing. Fix the tree first:\n');
  console.error(String(e.stdout || e.message));
  process.exit(1);
}

// ---------------------------------------------------------------- plan
const skillNames = readdirSync(skillsSrc)
  .filter((n) => statSync(join(skillsSrc, n)).isDirectory())
  .sort();
const aliasNames = existsSync(aliasesSrc)
  ? readdirSync(aliasesSrc).filter((n) => n.endsWith('.md') && statSync(join(aliasesSrc, n)).isFile()).map((n) => basename(n, '.md')).sort()
  : [];
const desiredSkills = new Set(skillNames);
const desiredAliases = new Set(aliasNames);

// Reconciliation: things this tool installed that no longer exist here.
const stale = [
  ...[...ownedSkills].filter((n) => !desiredSkills.has(n)).map((n) => ({ kind: 'skill', name: n, dest: join(target, n) })),
  ...[...ownedAliases].filter((n) => !desiredAliases.has(n)).map((n) => ({ kind: 'alias', name: n, dest: join(target, `${n}.md`) })),
].filter((e) => existsSync(e.dest));

const conflicts = [];
for (const n of skillNames) {
  const dest = join(target, n);
  if (existsSync(dest) && !ownedSkills.has(n) && !force) conflicts.push(dest);
}
for (const n of aliasNames) {
  const dest = join(target, `${n}.md`);
  if (existsSync(dest) && !ownedAliases.has(n) && !force) conflicts.push(dest);
}
if (conflicts.length) {
  console.error('refusing to overwrite entries this tool did not install:');
  for (const p of conflicts) console.error('  ' + p);
  console.error('\nThey may have come from `npx skills add`. Re-run with --force to replace them,');
  console.error('or move them aside first.');
  process.exit(1);
}

if (!dryRun) mkdirSync(target, { recursive: true });

let installed = 0;

for (const e of stale) {
  console.log(`${dryRun ? 'would remove stale' : 'remove stale'}  ${e.dest}`);
  if (dryRun) continue;
  rmSync(e.dest, { recursive: true, force: true });
  if (e.kind === 'skill') delete manifest.skills[e.name];
  else delete manifest.aliases[e.name];
}

manifest.skills = manifest.skills || {};
manifest.aliases = manifest.aliases || {};

for (const n of skillNames) {
  const from = join(skillsSrc, n);
  const dest = join(target, n);
  const files = readdirSync(from).sort();
  const skillMd = join(from, 'SKILL.md');
  const desc = /^description: "(.*)"$/m.exec(readFileSync(skillMd, 'utf8'))?.[1];
  const bytes = files.reduce((acc, f) => acc + (statSync(join(from, f)).size || 0), 0);
  console.log(`${dryRun ? 'would install' : 'install'}  ${n.padEnd(20)} ${String(files.length).padStart(2)} file(s) ${humanSize(bytes).padStart(7)}`);
  if (dryRun) continue;
  rmSync(dest, { recursive: true, force: true });
  cpSync(from, dest, { recursive: true });
  const fileHashes = Object.fromEntries(filesUnder(dest).map((rel) => [rel, sha(join(dest, rel))]));
  manifest.skills[n] = {
    descriptionChars: desc ? [...desc].length : null,
    sha256: fileHashes['SKILL.md'] ?? null, // kept for older readers
    fileHashes,
    files,
    installedAt: new Date().toISOString(),
  };
  installed++;
}

for (const n of aliasNames) {
  const from = join(aliasesSrc, `${n}.md`);
  const dest = join(target, `${n}.md`);
  const body = readFileSync(from, 'utf8');
  const pointsTo = aliasTargetFrom(body);
  console.log(`${dryRun ? 'would install' : 'install'}  ${(n + '.md').padEnd(20)} alias -> ${pointsTo ?? '?'} (0 catalog tokens, user-only in the / menu)`);
  if (dryRun) continue;
  rmSync(dest, { force: true });
  cpSync(from, dest);
  manifest.aliases[n] = { pointsTo, sha256: sha(dest), installedAt: new Date().toISOString() };
  installed++;
}

if (dryRun) {
  console.log(`\ndry run: ${skillNames.length} skill(s) + ${aliasNames.length} alias(es) would land in ${target}` +
    (stale.length ? `; ${stale.length} stale entrie(s) would be removed` : ''));
  process.exit(0);
}

// ---------------------------------------------------------------- gate 5: what actually landed
let mismatch = 0;
for (const n of skillNames) {
  const src = join(skillsSrc, n);
  const dst = join(target, n);
  for (const f of readdirSync(src)) {
    const a = join(src, f); const b = join(dst, f);
    if (!existsSync(b) || statSync(a).isFile() && sha(a) !== sha(b)) { console.error(`  MISMATCH ${n}/${f}`); mismatch++; }
  }
}
for (const n of aliasNames) {
  if (!existsSync(join(target, `${n}.md`)) || sha(join(aliasesSrc, `${n}.md`)) !== sha(join(target, `${n}.md`))) {
    console.error(`  MISMATCH ${n}.md`); mismatch++;
  }
}
if (mismatch) {
  console.error(`\nPOST-INSTALL VERIFY FAILED: ${mismatch} file(s) differ from the source tree.`);
  process.exit(1);
}

try {
  execFileSync(node, [join(here, 'tools', 'validate.mjs'), target, '--prefix', 'ds-'], { stdio: 'pipe' });
  console.log('post-install check: installed root is contract-clean');
} catch (e) {
  console.error('\nPOST-INSTALL VALIDATION FAILED on the installed root — this is the tree DSH reads:');
  console.error(String(e.stdout || e.message));
  process.exit(1);
}

// ---------------------------------------------------------------- manifest
const upstreamCommit = (() => {
  const pinned = join(here, 'upstream', 'deepseek-stack', 'COMMIT');
  if (existsSync(pinned)) return readFileSync(pinned, 'utf8').trim();
  return null;
})();

writeFileSync(manifestPath, JSON.stringify({
  version: 3, // v3: per-file hashes; v2 recorded only SKILL.md
  source: 'aicodeking/deepseek-stack',
  upstreamCommit,
  optimizedFor: 'DeepSeek Harness (dsh-skill-filesystem contract)',
  target,
  installedAt: new Date().toISOString(),
  skills: manifest.skills,
  aliases: manifest.aliases,
}, null, 2) + '\n');

console.log(`\ninstalled ${installed} entrie(s) into ${target}`);
console.log(`manifest: ${manifestPath}`);
console.log('\nA running DSH session picks these up on its next step (the provider watches this root).');
