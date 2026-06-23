/**
 * One-off migration: rename old `[(tag1,tag2)]` filenames to the new prefixed form.
 * Family and case are decided by tags.js (buildTaggedComponent): status -> xk, person -> xp,
 * label -> xx, bodies uppercased. Old quirks handled here: a leading `@` on a tag is dropped
 * (`@gcc` -> `GCC`), and a retired `active` tag is dropped (falling back to `TODO` if it was alone).
 *
 * Usage (dry run by default, prints the planned renames and changes nothing):
 *   node scripts/migrate-bracket-tags.js "C:\path\to\folder" ["C:\another"] ...
 * Apply the renames:
 *   node scripts/migrate-bracket-tags.js --apply "C:\path\to\folder"
 *
 * Walks each root recursively (files and folders), renames deepest paths first so a
 * renamed parent never invalidates a child path. Skips node_modules, .git, recycle
 * bins and Google Drive shortcut targets. Skips a rename if the target already exists.
 */
const fs = require('fs');
const path = require('path');

// New-syntax builder (writes `name xkA xkB.ext`).
require(path.join(__dirname, '..', 'tags.js'));
const T = globalThis.TagBrowserTags;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.shortcut-targets-by-id',
]);

/** Parse the old `[(t1,t2)]` last-bracket form. Returns { pretty, tags } or null if not tagged. */
function oldParse(component) {
  const lb = component.lastIndexOf('[');
  if (lb < 0) return null;
  const rb = component.indexOf(']', lb);
  if (rb < 0) return null;
  const inner = component.slice(lb + 1, rb);
  if (!(inner.startsWith('(') && inner.endsWith(')'))) return null;
  const raw = inner
    .slice(1, -1)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!raw.length) return null;
  // Drop leading @ on owner tags and the retired `active`; fall back to TODO if nothing survives.
  let tags = raw.map((t) => t.replace(/^@/, '')).filter((t) => t.toUpperCase() !== 'ACTIVE');
  if (!tags.length) tags = ['TODO'];
  return { pretty: component.slice(0, lb) + component.slice(rb + 1), tags };
}

const ops = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error('skip (cannot read):', dir, e.message);
    return;
  }
  for (const ent of entries) {
    const name = ent.name;
    const full = path.join(dir, name);
    if (ent.isDirectory() && SKIP_DIRS.has(name)) continue;
    const old = oldParse(name);
    if (old) {
      const next = T.buildTaggedComponent(old.pretty, old.tags);
      if (next && next !== name) ops.push({ dir, from: name, to: next, full });
    }
    if (ent.isDirectory()) walk(full);
  }
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const roots = args.filter((a) => a !== '--apply');
  if (!roots.length) {
    console.error('Usage: node scripts/migrate-bracket-tags.js [--apply] <folder> [<folder> ...]');
    process.exit(1);
  }
  for (const r of roots) walk(path.resolve(r));

  // Deepest paths first so renaming a parent never breaks a child path.
  ops.sort((a, b) => b.full.split(path.sep).length - a.full.split(path.sep).length);

  console.log((apply ? 'APPLYING ' : 'DRY RUN ') + ops.length + ' rename(s):\n');
  let done = 0;
  let skipped = 0;
  for (const op of ops) {
    const toFull = path.join(op.dir, op.to);
    console.log(op.from + '  ->  ' + op.to + '   [' + op.dir + ']');
    if (!apply) continue;
    if (fs.existsSync(toFull)) {
      console.error('  SKIP: target exists');
      skipped++;
      continue;
    }
    try {
      fs.renameSync(op.full, toFull);
      done++;
    } catch (e) {
      console.error('  FAIL:', e.message);
      skipped++;
    }
  }
  console.log('\n' + (apply ? done + ' renamed, ' + skipped + ' skipped.' : 'Dry run only. Re-run with --apply to perform.'));
}

main();
