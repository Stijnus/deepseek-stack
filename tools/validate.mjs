#!/usr/bin/env node
// validate.mjs — check a skill tree against the DeepSeek Harness local-provider contract.
//
// Mirrors @deepseek-ai/dsh-skill-filesystem / @deepseek-ai/dsh-skill as shipped in DSH 0.2.1:
//   * discovery is ONE level deep: <root>/<name>/SKILL.md or <root>/<name>.md
//   * name: required, kebab-case /^[a-z0-9]+(?:-[a-z0-9]+)*$/
//   * description: required; the catalog truncates at catalogDescriptionMaxLength (default 500)
//   * optional: whenToUse, metadata, disable-model-invocation, user-invocable
//   * legacy camelCase invocation keys are rejected (the provider drops that skill)
//   * an unparsable or nameless file is silently skipped, so a typo = an invisible skill
//
// Extra checks are this pack's own budget, not DSH's: description 120-200 chars (it is the only
// routing signal and it costs tokens every turn) and body preservation vs upstream.
//
// Usage: node tools/validate.mjs [skillsDir] [--upstream <dir>]
// Exit 1 on any FAIL.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const BUDGET_MIN = 120;
const BUDGET_MAX = 200;
const DSH_CAP = 500;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED = new Set(['name', 'description', 'whenToUse', 'metadata', 'disable-model-invocation', 'user-invocable']);
const LEGACY = new Set(['disableModelInvocation', 'modelInvocable', 'userInvocable']);

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const VALUES = new Set(['--upstream', '--aliases', '--prefix']);
const root = args.find((a, i) => !a.startsWith('--') && !VALUES.has(args[i - 1])) ?? 'skills';
let upstream = flag('--upstream') ?? null;
const aliasesDir = flag('--aliases') ?? null;
const prefix = flag('--prefix') ?? null;

function fail(msg) {
  console.log(`\n  FATAL: ${msg}`);
  process.exit(1);
}
if (!existsSync(root)) fail(`no such skills dir: ${root}`);

// A caller that names an upstream tree which is not there has a setup gap, not 29 broken skills.
// Say so once and skip the comparison; per-skill "no upstream counterpart" noise hides real WARNs.
if (upstream && !existsSync(upstream)) {
  console.log(`note: upstream tree not found at ${upstream} — body-preservation comparison skipped`);
  upstream = null;
}

/** Parse the subset of YAML frontmatter these skills use. Returns {data, body} or throws. */
function parseFrontmatter(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return null;
  const end = src.indexOf('\n---', 3);
  if (end === -1) throw new Error('unterminated frontmatter');
  const head = src.slice(4, end);
  const body = src.slice(end + 4).replace(/^\n+/, '');
  const data = {};
  const lines = head.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!m) throw new Error(`unparsable frontmatter line ${i + 1}: ${JSON.stringify(line)}`);
    const key = m[1];
    let raw = m[2].trim();
    if (raw === '|' || raw === '>' || raw === '|-' || raw === '>-') {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        block.push(lines[++i].replace(/^\s+/, ''));
      }
      data[key] = raw.startsWith('|') ? block.join('\n') : block.join(' ').trim();
      continue;
    }
    if ((raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) || (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1)) {
      raw = raw.slice(1, -1);
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      data[key] = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }
    data[key] = raw;
  }
  return { data, body };
}

const results = [];
let files = [];
for (const entry of readdirSync(root).sort()) {
  const p = join(root, entry);
  let st;
  try { st = statSync(p); } catch { continue; }
  if (st.isDirectory()) {
    const sk = join(p, 'SKILL.md');
    if (existsSync(sk)) files.push({ dir: entry, path: sk, flat: false });
    else if (entry.startsWith('ds-')) results.push({ name: entry, level: 'FAIL', notes: ['directory bundle with no SKILL.md is never discovered'] });
  } else if (entry.endsWith('.md') && st.isFile()) {
    files.push({ dir: basename(entry, '.md'), path: p, flat: true });
  }
}

if (prefix) files = files.filter((f) => f.dir.startsWith(prefix));

for (const f of files) {
  const notes = [];
  let level = 'OK';
  const add = (l, n) => { notes.push(n); if (l === 'FAIL' || (l === 'WARN' && level === 'OK')) level = l; };
  let text;
  try { text = readFileSync(f.path, 'utf8'); } catch (e) { results.push({ name: f.dir, level: 'FAIL', notes: [`unreadable: ${e.message}`] }); continue; }

  let parsed;
  try { parsed = parseFrontmatter(text); } catch (e) { results.push({ name: f.dir, level: 'FAIL', notes: [`frontmatter: ${e.message}`] }); continue; }
  if (!parsed) { results.push({ name: f.dir, level: 'FAIL', notes: ['no frontmatter — DSH skips the file entirely'] }); continue; }

  const { data, body } = parsed;
  const name = typeof data.name === 'string' ? data.name : undefined;
  const description = typeof data.description === 'string' ? data.description : undefined;

  if (!name) add('FAIL', 'missing name');
  else if (!NAME_RE.test(name)) add('FAIL', `name "${name}" is not kebab-case (${NAME_RE})`);
  else if (name !== f.dir) {
    add('FAIL', f.flat
      ? `name "${name}" != filename "${f.dir}.md" — install keys by filename but DSH reads the frontmatter name, so this installs a second skill under that name and kills /${f.dir}`
      : `name "${name}" != directory "${f.dir}"`);
  }

  // `disable-model-invocation: true` skills are excluded from the MODEL catalog
  // (`tool-skill` builds it from `.filter(isModelInvocable)`), so the 120-200 char budget —
  // which exists to protect catalog tokens — does not apply to them.
  // They are NOT invisible, though: `dsh-client-ui-skill` renders every user-invocable skill
  // in the `/` menu, prefixing a hidden one with a "user-only" marker
  // (`description: skill.modelInvocable ? skill.description : \`${t("menu.userOnly")} · ${description}\``).
  // So the text is still user-visible UI copy; it just is not routing signal and costs no tokens.
  const modelHidden = ['true', 'yes', 'on', '1'].includes(String(data['disable-model-invocation'] ?? '').toLowerCase());

  if (!description) add('FAIL', 'missing description — nothing routes to this skill');
  else {
    const len = [...description].length;
    if (len > DSH_CAP) add('FAIL', `description ${len} chars exceeds DSH truncation cap ${DSH_CAP}`);
    else if (!modelHidden && len > BUDGET_MAX) add('WARN', `description ${len} chars over pack budget ${BUDGET_MAX}`);
    else if (!modelHidden && len < BUDGET_MIN) add('WARN', `description ${len} chars under pack budget ${BUDGET_MIN} (thin routing signal)`);
    if (/\n/.test(description)) add('WARN', 'description is multi-line; catalog renders one line');
  }

  for (const k of Object.keys(data)) {
    if (LEGACY.has(k)) add('FAIL', `legacy invocation key "${k}" — provider drops the whole skill`);
    else if (!ALLOWED.has(k)) add('WARN', `unknown frontmatter key "${k}" (ignored by DSH)`);
  }
  if (data.whenToUse !== undefined) add('WARN', 'whenToUse is parsed but never rendered by DSH — dead weight');

  if (!body.trim()) add('FAIL', 'empty body');
  if (!body.trimStart().startsWith('# ')) add('WARN', 'body should start with an H1 "# <name>"');

  // Body preservation vs upstream: a rewrite that guts the skill is a regression.
  if (upstream) {
    const up = join(upstream, f.dir, 'SKILL.md');
    if (existsSync(up)) {
      const upBody = parseFrontmatter(readFileSync(up, 'utf8'))?.body ?? '';
      const before = upBody.split('\n').filter((l) => l.trim()).length;
      const after = body.split('\n').filter((l) => l.trim()).length;
      const kept = before ? after / before : 1;
      if (kept < 0.65) add('WARN', `body shrank to ${Math.round(kept * 100)}% of upstream (${before}->${after} lines)`);
    } else if (!f.flat) {
      // Upstream ships directory bundles only; a local flat bundle (a gesture alias) has no
      // counterpart by design, so its absence is not a defect worth a warning.
      add('WARN', 'no upstream counterpart to compare');
    }
  }

  results.push({ name: name ?? f.dir, level, notes, descLen: description ? [...description].length : 0, modelHidden });
}

// Alias integrity. A flat bundle is a pointer, so it is only meaningful next to its targets:
// renaming a skill without updating the alias pointing at it would otherwise break silently,
// because DSH injects the pointer body and the model then loads a name that does not exist.
// Checked only in a root that actually holds bundles — the aliases/ source tree on its own has
// no targets by design.
const known = new Set(files.map((f) => f.dir));
const hasBundles = files.some((f) => !f.flat);
if (hasBundles) {
  for (const f of files.filter((x) => x.flat)) {
    const target = /`(ds-[a-z0-9-]+)`/.exec(readFileSync(f.path, 'utf8'))?.[1];
    if (!target) continue;
    const r = results.find((x) => x.name === (parseFrontmatter(readFileSync(f.path, 'utf8'))?.data.name ?? f.dir));
    if (!r) continue;
    if (!known.has(target)) {
      r.level = 'FAIL';
      r.notes.push(`alias points to missing skill "${target}" — rename or drop the alias`);
    }
  }
}

// Cross-root alias check (`--aliases <dir>`): in the source tree the bundles live in skills/
// and the aliases in aliases/, so alias integrity cannot be checked from one scan. Validate each
// alias file's own contract and resolve its target against the bundle names of the root.
if (aliasesDir) {
  const aliasFiles = readdirSync(aliasesDir).filter((n) => n.endsWith('.md')).sort();
  const expect = flag('--expect-aliases');
  // A build with an empty aliases/ used to be green: no target to dangle, so every check passed.
  if (!aliasFiles.length) {
    results.push({ name: '(aliases)', level: 'FAIL', notes: [`no alias files in ${aliasesDir} — an empty alias set must not validate`], descLen: 0, modelHidden: true });
  }
  if (expect !== undefined && aliasFiles.length !== Number(expect)) {
    results.push({ name: '(aliases)', level: 'FAIL', notes: [`expected ${expect} alias file(s), found ${aliasFiles.length}`], descLen: 0, modelHidden: true });
  }
  // Namespace disjointness: a flat alias must never share a name with a bundle.
  for (const n of aliasFiles) {
    const base = basename(n, '.md');
    if (known.has(base)) {
      results.push({ name: base, level: 'FAIL', notes: [`collides with the bundle of the same name — one of the two shadows the other`], descLen: 0, modelHidden: true });
    }
  }
  for (const name of aliasFiles) {
    if (!name.endsWith('.md')) continue;
    const p = join(aliasesDir, name);
    const notes = [];
    let level = 'OK';
    const add2 = (l, n) => { notes.push(n); if (l === 'FAIL' || (l === 'WARN' && level === 'OK')) level = l; };
    let parsed;
    try { parsed = parseFrontmatter(readFileSync(p, 'utf8')); } catch (e) { results.push({ name: basename(name, '.md'), level: 'FAIL', notes: [`frontmatter: ${e.message}`], descLen: 0 }); continue; }
    if (!parsed) { results.push({ name: basename(name, '.md'), level: 'FAIL', notes: ['no frontmatter'], descLen: 0 }); continue; }
    const { data, body } = parsed;
    const base = basename(name, '.md');
    if (data.name !== base) add2('FAIL', `name "${data.name}" != filename "${name}" — DSH reads the name, install keys by filename`);
    if (!data.description) add2('FAIL', 'missing description');
    const inv = String(data['disable-model-invocation'] ?? '').toLowerCase();
    if (!['true', 'yes', 'on', '1'].includes(inv)) {
      add2('FAIL', 'alias must set disable-model-invocation: true or it lands in the model catalog and costs tokens');
    }
    if (!String(body).trimStart().startsWith('# ')) add2('WARN', 'body should start with an H1');
    const target = /`(ds-[a-z0-9-]+)`/.exec(body)?.[1];
    if (!target) add2('FAIL', 'alias body names no target skill in backticks');
    else if (!known.has(target)) add2('FAIL', `alias points to missing skill "${target}" — rename or drop the alias`);
    results.push({ name: base, level, notes, descLen: data.description ? [...String(data.description)].length : 0, modelHidden: true });
  }
}

const order = { FAIL: 0, WARN: 1, OK: 2 };
results.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));

const width = Math.max(...results.map((r) => r.name.length), 10);
for (const r of results) {
  const d = r.descLen ? String(r.descLen).padStart(3) : '  -';
  console.log(`${r.level.padEnd(4)} ${r.name.padEnd(width)} ${d}  ${r.notes.join('; ')}`);
}

// Only model-invocable skills are rendered into the catalog, so only they cost catalog tokens.
const visible = results.filter((r) => !r.modelHidden);
const hidden = results.length - visible.length;
const catalogChars = visible.reduce((n, r) => n + r.name.length + (r.descLen || 0) + 6, 0);
const fails = results.filter((r) => r.level === 'FAIL').length;
const warns = results.filter((r) => r.level === 'WARN').length;
const hiddenNote = hidden ? ` | ${hidden} gesture-only (0 catalog cost)` : '';
console.log(`\n${results.length} skills | ${fails} FAIL | ${warns} WARN | catalog ${catalogChars} chars (~${Math.round(catalogChars / 3.6)} tokens per session)${hiddenNote}`);
process.exit(fails ? 1 : 0);
