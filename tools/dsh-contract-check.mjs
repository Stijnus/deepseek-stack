#!/usr/bin/env node
// dsh-contract-check.mjs — assert the shipped DeepSeek Harness still matches what this pack assumes.
//
// The pack's whole design rests on four facts read out of the installed app (documented in
// docs/DSH-MAPPING.md). Today they are pinned by comments and by `selftest` gates that only test this
// repo — none of them would notice a DSH upgrade that changed, say, the gesture filter. Then the six
// aliases would stop answering and every repo check would stay green.
//
// This reads the shipped app.asar (read-only) and asserts each assumption by its source text:
//   1. the model catalog is filtered by isModelInvocable          -> hidden aliases cost no tokens
//   2. the /name gesture is filtered by isUserInvocable           -> hidden aliases stay reachable
//   3. the filesystem provider parses disable-model-invocation    -> the key is honoured
//   4. the UI marks non-model-invocable skills as user-only       -> alias text is user-facing copy
//
// Exit codes: 0 all hold (or the app is not installed and --require was not given)
//             1 an assertion failed — the pack's assumptions are stale
//             2 the app is missing and --require was given
//
// Usage: node tools/dsh-contract-check.mjs [--asar <path>] [--require]

import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const requireApp = args.includes('--require');
const selfTest = args.includes('--self-test');

const DEFAULT_ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
// An explicit path is honoured as given (so a missing one is a skip, not a silent fallback to the
// installed app). Otherwise use the platform default when it exists.
const explicit = flag('--asar') ?? process.env.DSH_ASAR ?? null;
const asarPath = explicit ?? (existsSync(DEFAULT_ASAR) ? DEFAULT_ASAR : null);

if (!asarPath || !existsSync(asarPath)) {
  console.log(`skipped: no DeepSeek Harness app.asar${explicit ? ` at ${explicit}` : ''} (pass --asar <path> or set DSH_ASAR)`);
  process.exit(requireApp ? 2 : 0);
}

/** Minimal asar reader: parse the header, then read only the requested entries. The descriptor is
 *  closed before returning, so every needed file is read up front — a `read()` closure over a closed
 *  fd silently returns zeroed buffers. */
function readAsar(path, suffixes) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(16);
    readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(4);
    const jsonSize = head.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(jsonSize);
    readSync(fd, jsonBuf, 0, jsonSize, 16);
    const tree = JSON.parse(jsonBuf.toString('utf8'));
    const base = 8 + headerSize;

    const files = new Map();
    (function walk(node, prefix) {
      for (const [name, meta] of Object.entries(node.files || {})) {
        const p = `${prefix}/${name}`;
        if (meta.files) walk(meta, p);
        else if (typeof meta.offset === 'string' || typeof meta.offset === 'number') {
          files.set(p, { offset: Number(meta.offset), size: meta.size });
        }
      }
    })(tree, '');

    const out = new Map();
    for (const suffix of suffixes) {
      const p = [...files.keys()].find((k) => k.endsWith(suffix));
      if (!p) continue;
      const e = files.get(p);
      const buf = Buffer.alloc(e.size);
      readSync(fd, buf, 0, e.size, base + e.offset);
      out.set(suffix, { path: p, content: buf.toString('utf8') });
    }
    return out;
  } finally {
    closeSync(fd);
  }
}


const checks = [
  {
    what: 'model catalog filtered by isModelInvocable (hidden aliases cost no catalog tokens)',
    file: 'node_modules/@deepseek-ai/dsh-tool-skill/lib/index.js',
    pattern: /filter\(isModelInvocable\)/,
  },
  {
    what: '/name gesture filtered by isUserInvocable (hidden aliases stay reachable by gesture)',
    file: 'node_modules/@deepseek-ai/dsh-tool-skill/lib/index.js',
    pattern: /!isUserInvocable\(skill\)/,
  },
  {
    what: 'kebab-case skill name grammar',
    file: 'node_modules/@deepseek-ai/dsh-skill/lib/index.js',
    pattern: /SKILL_NAME\s*=\s*\/\^\[a-z0-9\]/,
  },
  {
    what: 'filesystem provider parses disable-model-invocation',
    file: 'node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js',
    pattern: /disable-model-invocation/,
  },
  {
    what: 'filesystem provider defaults userInvocable to true',
    file: 'node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js',
    pattern: /userInvocable:\s*userInvocable !== false/,
  },
  {
    what: 'UI renders non-model-invocable skills with a user-only marker',
    file: 'node_modules/@deepseek-ai/dsh-client-ui-skill/lib/client.js',
    pattern: /modelInvocable \? skill\.description/,
  },
];

/** Build a minimal asar with the same header shape the real one uses, for the self-test. */
function buildAsar(contents, outPath) {
  const tree = { files: {} };
  const chunks = [];
  let offset = 0;
  for (const [rel, text] of Object.entries(contents)) {
    const buf = Buffer.from(text, 'utf8');
    const parts = rel.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node.files[parts[i]] = node.files[parts[i]] || { files: {} };
      node = node.files[parts[i]];
    }
    node.files[parts.at(-1)] = { size: buf.length, offset: String(offset) };
    chunks.push(buf);
    offset += buf.length;
  }
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const header = Buffer.alloc(16);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(8 + json.length, 4);
  header.writeUInt32LE(json.length, 8);
  header.writeUInt32LE(json.length, 12);
  writeFileSync(outPath, Buffer.concat([header, json, ...chunks]));
}

function fixture({ mutate = false } = {}) {
  const tool = mutate
    ? 'const skills = snapshot.skills.filter(isModelInvocablX);'
    : 'const skills = snapshot.skills.filter(isModelInvocable); if (!isUserInvocable(skill)) continue;';
  return {
    'node_modules/@deepseek-ai/dsh-tool-skill/lib/index.js': tool,
    'node_modules/@deepseek-ai/dsh-skill/lib/index.js': 'const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;',
    'node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js': '// disable-model-invocation\nuserInvocable: userInvocable !== false',
    'node_modules/@deepseek-ai/dsh-client-ui-skill/lib/client.js': 'description: skill.modelInvocable ? skill.description : t("menu.userOnly")',
  };
}

if (selfTest) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-contract-'));
  const good = join(dir, 'good.asar');
  const bad = join(dir, 'bad.asar');
  buildAsar(fixture(), good);
  buildAsar(fixture({ mutate: true }), bad);
  const run = (p) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--asar', p], { encoding: 'utf8' });
  const okRun = run(good);
  const badRun = run(bad);
  rmSync(dir, { recursive: true, force: true });
  let fail = 0;
  console.log(`self-test: intact fixture -> exit ${okRun.status} (expect 0)`);
  if (okRun.status !== 0) { fail++; console.log(okRun.stdout); }
  console.log(`self-test: altered filter -> exit ${badRun.status} (expect 1)`);
  if (badRun.status !== 1) fail++;
  if (!/FAIL\s+model catalog filtered by isModelInvocable/.test(badRun.stdout)) { fail++; console.log('  expected a named FAIL for the catalog filter'); console.log(badRun.stdout); }
  console.log(fail ? 'self-test FAILED' : 'self-test passed: the checker detects a changed contract');
  process.exit(fail ? 1 : 0);
}

const asar = readAsar(asarPath, checks.map((c) => c.file));

let failed = 0;
console.log(`app: ${asarPath}`);
console.log(`size: ${(statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB\n`);

for (const c of checks) {
  const entry = asar.get(c.file);
  const p = entry?.path;
  if (!p) {
    console.log(`FAIL  ${c.what}`);
    console.log(`      expected package not present: ${c.file}`);
    failed++;
    continue;
  }
  const src = entry.content;
  if (c.pattern.test(src)) {
    console.log(`ok    ${c.what}`);
  } else {
    console.log(`FAIL  ${c.what}`);
    console.log(`      ${p} no longer matches ${c.pattern}`);
    failed++;
  }
}

console.log('');
if (failed) {
  console.log(`${failed} assumption(s) no longer hold — the pack's DSH guidance may be stale.`);
  console.log('Re-read docs/DSH-MAPPING.md against the installed app before trusting the aliases.');
  process.exit(1);
}
console.log('the pack\'s DSH assumptions still hold');
