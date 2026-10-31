#!/usr/bin/env node
// stamp.mjs — bind an install to a successful build.
//
// The install root must never receive a tree that is not the reviewed output of tools/build.sh.
// Two failure modes this closes:
//   1. build.sh used to `rm -rf skills/` and then apply the patch; a conflicting patch aborted
//      and left a pristine upstream tree, which validates clean (nothing differs from upstream)
//      and would ship silently. A stamp cannot exist for a build that did not finish.
//   2. hand-editing skills/ without capturing the edit in optimize.patch would drift the shipped
//      bytes away from the reviewable diff. The skills digest catches that.
//
// Usage:
//   node tools/stamp.mjs write    after a successful build + validation
//   node tools/stamp.mjs verify   before installing; exit 1 on any mismatch

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(here, 'skills');
const aliasesDir = join(here, 'aliases');
const patchPath = join(here, 'tools', 'optimize.patch');
const stampPath = join(here, 'tools', '.build-stamp.json');

const sha = (b) => createHash('sha256').update(b).digest('hex');

function walkFiles(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkFiles(p, `${prefix}${name}/`));
    else if (st.isFile()) out.push([`${prefix}${name}`, sha(readFileSync(p))]);
  }
  return out;
}

export function digestSkills() {
  const lines = walkFiles(skillsDir).map(([p, h]) => `${p}\0${h}`).sort();
  return sha(lines.join('\n'));
}

export function digestAliases() {
  if (!existsSync(aliasesDir)) return sha('');
  const lines = readdirSync(aliasesDir).sort()
    .filter((n) => n.endsWith('.md') && statSync(join(aliasesDir, n)).isFile())
    .map((n) => `${basename(n, '.md')}\0${sha(readFileSync(join(aliasesDir, n)))}`);
  return sha(lines.join('\n'));
}

export function digestPatch() {
  return existsSync(patchPath) ? sha(readFileSync(patchPath)) : null;
}

function current() {
  return { patch: digestPatch(), skills: digestSkills(), aliases: digestAliases() };
}

const cmd = process.argv[2];

if (cmd === 'write') {
  const stamp = {
    version: 1,
    builtAt: new Date().toISOString(),
    note: 'written by tools/build.sh after validation; do not edit by hand',
    ...current(),
    upstreamCommit: (() => {
      const pinned = join(here, 'upstream', 'deepseek-stack', 'COMMIT');
      return existsSync(pinned) ? readFileSync(pinned, 'utf8').trim() : null;
    })(),
  };
  writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + '\n');
  console.log(`build stamp written (skills ${stamp.skills.slice(0, 12)}…, aliases ${stamp.aliases.slice(0, 12)}…, patch ${String(stamp.patch).slice(0, 12)}…)`);
  process.exit(0);
}

// A published checkout is its own provenance: what git ships is exactly what a consumer should
// install. If there is no local build stamp, accept a CLEAN checkout of skills/ + aliases/ —
// git already proves those bytes are what was reviewed and committed. A dirty tree still fails,
// because then the tree is not the published artifact any more.
function cleanCheckout() {
  try {
    const tracked = execFileSync('git', ['-C', here, 'ls-files', '--', 'skills', 'aliases'], { encoding: 'utf8' }).trim();
    if (!tracked) return { ok: false, why: 'skills/ and aliases/ are not tracked by git here' };
    const dirty = execFileSync('git', ['-C', here, 'status', '--porcelain', '--', 'skills', 'aliases'], { encoding: 'utf8' }).trim();
    if (dirty) return { ok: false, why: 'skills/ or aliases/ have uncommitted changes' };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: 'not a git checkout' };
  }
}

if (cmd === 'verify') {
  if (!existsSync(stampPath)) {
    const c = cleanCheckout();
    if (c.ok) {
      console.log('no build stamp; skills/ and aliases/ match the committed tree (published checkout)');
      process.exit(0);
    }
    console.error(`refusing to install: no build stamp and the tree is not a clean checkout (${c.why}).`);
    console.error('Run ./tools/fetch-upstream.sh && ./tools/build.sh, then install.');
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
  const now = current();
  const problems = [];
  if (stamp.patch !== now.patch) problems.push('tools/optimize.patch changed since the build');
  if (stamp.skills !== now.skills) problems.push('skills/ changed since the build (hand edit not captured in the patch?)');
  if (stamp.aliases !== now.aliases) problems.push('aliases/ changed since the build');
  if (problems.length) {
    console.error('refusing to install: this tree is not the output of a successful build.');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nRun ./tools/build.sh (and ./tools/build.sh --regen-patch after a hand edit), then install.');
    process.exit(1);
  }
  console.log('build stamp verified: skills/, aliases/ and the patch all match the last successful build');
  process.exit(0);
}

console.error('usage: node tools/stamp.mjs <write|verify>');
process.exit(2);
