// Unit tests for the two date families in tags.js: `xd-` deadlines and `xh-` hide-until dates.
// Pure logic, no Electron, so this runs in milliseconds. Run: node test/tags-dates.cjs
//
// The thing worth guarding is the round trip. A filename is the only store of state, so
// parse -> edit -> rebuild has to give back a name that parses the same way, and a deadline must
// never be silently promoted into a hide-until (or the reverse), which would make a task vanish.

const path = require('path');

const global_ = {};
require(path.join(__dirname, '..', 'tags.js'));
const T = (typeof window !== 'undefined' ? window : globalThis).TagBrowserTags;

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
};
const eq = (name, got, want) => ok(`${name} (got ${JSON.stringify(got)})`, got === want);

// --- Recognition ------------------------------------------------------------
eq('bare date is a deadline', T.dateKind('2026-07-15'), 'deadline');
eq('xd- is a deadline', T.dateKind('xd-2026-07-15'), 'deadline');
eq('xh- is a hide-until', T.dateKind('xh-2026-09-01'), 'hide');
eq('a word is not a date', T.dateKind('TODO'), '');
eq('a malformed date is not a date', T.dateKind('xh-2026-9-1'), '');
ok('both families count as dates', T.isDateTag('xd-2026-07-15') && T.isDateTag('xh-2026-09-01'));
eq('body strips either prefix', T.dateBody('xh-2026-09-01'), '2026-09-01');
eq('bare dates normalise to a deadline', T.normalizeDateTag('2026-07-15'), 'xd-2026-07-15');

// --- Parsing a real filename ------------------------------------------------
{
  const name = 'cancel Deutschland-Ticket xkTODO xpSTEVE xd-2026-08-10 xh-2026-07-30.md';
  const { pretty, tags } = T.parseSegmentTags(name);
  eq('pretty name drops every tag', pretty, 'cancel Deutschland-Ticket.md');
  ok('deadline survives parsing with its prefix', tags.includes('xd-2026-08-10'));
  ok('hide-until survives parsing with its prefix', tags.includes('xh-2026-07-30'));
  ok('the two dates stay distinct', T.dateKind('xd-2026-08-10') !== T.dateKind('xh-2026-07-30'));
}

// --- Round trip -------------------------------------------------------------
{
  const name = 'cancel Deutschland-Ticket xkTODO xpSTEVE xd-2026-08-10 xh-2026-07-30.md';
  const rebuilt = T.buildTaggedComponent(name, T.parseSegmentTags(name).tags);
  eq('round trip is stable', rebuilt, name);
  eq('and idempotent', T.buildTaggedComponent(rebuilt, T.parseSegmentTags(rebuilt).tags), name);
}

// --- One of each family, last wins ------------------------------------------
{
  const out = T.buildTaggedComponent('thing.md', ['TODO', 'xd-2026-01-01', 'xd-2026-08-10']);
  eq('a second deadline replaces the first', out, 'thing xkTODO xd-2026-08-10.md');
}
{
  const out = T.buildTaggedComponent('thing.md', ['TODO', 'xh-2026-01-01', 'xh-2026-09-01']);
  eq('a second hide-until replaces the first', out, 'thing xkTODO xh-2026-09-01.md');
}
{
  // The case the whole feature exists for: can't act until the trip ends, must act by the 10th.
  const out = T.buildTaggedComponent('thing.md', ['xh-2026-07-30', 'TODO', 'xd-2026-08-10']);
  eq('a file carries one of each, deadline first', out, 'thing xkTODO xd-2026-08-10 xh-2026-07-30.md');
}
{
  const out = T.buildTaggedComponent('thing xkTODO xd-2026-08-10.md', ['TODO', 'xd-2026-08-10', 'xh-2026-07-30']);
  eq('adding a hide-until keeps the deadline', out, 'thing xkTODO xd-2026-08-10 xh-2026-07-30.md');
}
{
  const out = T.buildTaggedComponent('thing xkTODO xh-2026-07-30.md', ['TODO', 'xh-2026-07-30', 'xd-2026-08-10']);
  eq('adding a deadline keeps the hide-until', out, 'thing xkTODO xd-2026-08-10 xh-2026-07-30.md');
}

// --- Legacy names keep working ----------------------------------------------
{
  const name = 'register presenters xkTODO xpSTEVE xd-2026-07-15.md';
  const rebuilt = T.buildTaggedComponent(name, T.parseSegmentTags(name).tags);
  eq('an existing deadline-only name is untouched', rebuilt, name);
}
{
  // The bare form is what the date <input> hands over; it must land as a deadline, never a hide.
  const out = T.buildTaggedComponent('thing.md', ['TODO', '2026-08-10']);
  eq('a bare date from the date picker writes as xd-', out, 'thing xkTODO xd-2026-08-10.md');
}

// --- Dates never leak into the ordinary tag vocabulary ----------------------
ok('dates are excluded from tag-bar pills', T.isDateTag('xh-2026-09-01') && T.isDateTag('2026-09-01'));
eq('a hide-until keeps its own family prefix', T.prefixForTag('xh-2026-09-01'), 'xh-');
eq('a deadline keeps its own family prefix', T.prefixForTag('xd-2026-09-01'), 'xd-');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
