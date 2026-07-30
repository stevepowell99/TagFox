// TagFox tags: two-letter-prefixed vocabulary tokens anywhere in the name are tags, e.g.
// `xkTODO name xpGCC.ext` or `name xkTODO xpGCC.ext`. Three families, all two chars wide:
// xk = status (TODO/WAITING/LATER), xp = person/owner (GCC/STEVE/CLAUDE), xx = label. Tags are
// space-separated; the prefix is stripped for display and the tag tokens are removed from the
// pretty name wherever they sit. Recognising any position (not only trailing) matches the hub
// `xkTODO` convention, where the tag may lead the name (`xkTODO chapter5 GNI tables.md`); it is
// safe because only the fixed TAG_VOCAB words (plus `xd-` deadlines and `xh-` hide-until dates)
// count, so a real word is never mistaken for a tag. The family for a typed tag is chosen by word
// (see prefixForTag). Plain words and `name[foo].ext` are literal text, not tags.
(function (global) {
  /** Two-char family prefixes that mark a trailing filename token as a tag. */
  const TAG_PREFIXES = ['xk', 'xp', 'xx'];
  const PREFIX_LEN = 2;
  /** Back-compat default prefix (status family). */
  const TAG_PREFIX = 'xk';

  /**
   * The agreed, fixed tag vocabulary: tag body -> family prefix. This is the single source of
   * truth for what counts as a tag. Only these are recognised, which keeps filename look-alikes
   * (xkeyboard, xpath, ITL, RED1, package names, ...) out of the tag bar. To add a tag, add it
   * here (and mirror it in CLAUDE.md / help.md).
   */
  const TAG_VOCAB = {
    TODO: 'xk', BLOCKING: 'xk', WAITING: 'xk', LATER: 'xk', // status
    GCC: 'xp', STEVE: 'xp', CLAUDE: 'xp', // person
    PUB: 'xx', INFO: 'xx', KEY: 'xx', // label
  };

  /**
   * Two date families, both ISO dates, both open patterns rather than vocabulary:
   *   `xd-2026-07-15` a DEADLINE, the date the thing is due.
   *   `xh-2026-09-01` a HIDE-UNTIL, the date before which the thing should not be shown at all.
   * They are different questions ("by when" vs "from when"), so they are different tokens and a
   * file may carry one of each. A bare `2026-07-15`, which is how older builds and the date inputs
   * name a deadline, still reads as a deadline.
   */
  const DATE_PREFIX = 'xd-';          // back-compat alias: the deadline family
  const HIDE_PREFIX = 'xh-';
  const DATE_PREFIXES = [DATE_PREFIX, HIDE_PREFIX];
  const DATE_BODY_RE = /^\d{4}-\d{2}-\d{2}$/; // 2026-07-15 (bare = deadline)
  const DATE_TOKEN_RE = /^(?:xd|xh)-\d{4}-\d{2}-\d{2}$/; // xd-2026-07-15 | xh-2026-09-01

  /** Is this tag either kind of date? Dates never appear as tag-bar pills: each family has its own
   *  filter, so callers use this to keep them out. */
  function isDateTag(name) {
    const s = String(name || '').trim();
    return DATE_BODY_RE.test(s) || DATE_TOKEN_RE.test(s);
  }

  /** Which date family a tag name belongs to: 'deadline' | 'hide' | '' (not a date). */
  function dateKind(name) {
    const s = String(name || '').trim();
    if (DATE_BODY_RE.test(s)) return 'deadline'; // bare, legacy
    if (!DATE_TOKEN_RE.test(s)) return '';
    return s.slice(0, 3) === HIDE_PREFIX ? 'hide' : 'deadline';
  }

  /** The `YYYY-MM-DD` part of a date tag, or '' if it is not a date. */
  function dateBody(name) {
    const s = String(name || '').trim();
    if (DATE_BODY_RE.test(s)) return s;
    if (DATE_TOKEN_RE.test(s)) return s.slice(3);
    return '';
  }

  /** Canonical prefixed form of a date tag (`2026-07-15` -> `xd-2026-07-15`), else ''. */
  function normalizeDateTag(name) {
    const kind = dateKind(name);
    if (!kind) return '';
    return (kind === 'hide' ? HIDE_PREFIX : DATE_PREFIX) + dateBody(name);
  }

  /** Family prefix for a tag name (no prefix): a date -> its own family, a vocab word -> its family,
   *  else `xx`. Date names normally arrive already prefixed, so this mostly serves the bare legacy form. */
  function prefixForTag(name) {
    const s = String(name || '').trim();
    const kind = dateKind(s);
    if (kind) return kind === 'hide' ? HIDE_PREFIX : DATE_PREFIX;
    return TAG_VOCAB[s.toUpperCase()] || 'xx';
  }

  /** Split a component into [stem, ext]; ext is a trailing `.word` (else ''). */
  function splitExt(component) {
    const c = String(component || '');
    const dot = c.lastIndexOf('.');
    if (dot > 0 && /^\.\w+$/.test(c.slice(dot))) return [c.slice(0, dot), c.slice(dot)];
    return [c, ''];
  }

  /** Tag name for a token, or '' if not a tag. A date KEEPS its prefix (`xd-2026-07-15`,
   *  `xh-2026-09-01`), because that prefix is the only thing telling a deadline from a hide-until
   *  once the token is off the filename. Other tags drop theirs: `xkTODO`->`TODO`, `xpGCC`->`GCC`.
   *  `xxTODO`, `xkeyboard`, `xpITL` etc. are not tags. */
  function tagNameFromToken(token) {
    if (!token) return '';
    if (DATE_TOKEN_RE.test(token)) return token;
    if (token.length <= PREFIX_LEN) return '';
    const body = token.slice(PREFIX_LEN);
    if (TAG_VOCAB[body] !== token.slice(0, PREFIX_LEN)) return '';
    return body;
  }

  /** Peel `xk…` vocab tokens from anywhere in a stem; returns { base, tags } with tags in file
   *  order and the remaining words (the pretty base) in their original order. */
  function peelTags(stem) {
    const tokens = String(stem || '').split(' ');
    const tags = [];
    const rest = [];
    for (const tok of tokens) {
      const name = tagNameFromToken(tok);
      if (name) tags.push(name);
      else rest.push(tok);
    }
    return { base: rest.join(' ').replace(/\s+/g, ' ').trim(), tags };
  }

  /** "file xkA xkB.pdf" -> pretty "file.pdf", tags [A,B]. "file.pdf" -> pretty unchanged, tags []. */
  function parseSegmentTags(component) {
    if (!component) return { pretty: '', tags: [], raw: '' };
    const raw = component;
    const [stem, ext] = splitExt(component);
    const { base, tags } = peelTags(stem);
    if (!tags.length) return { pretty: component, tags: [], raw };
    return { pretty: base + ext, tags, raw };
  }

  /** Tags from the item's own name only (last path segment); parent-folder tags are not inherited. */
  function allTagsFromFullPath(fullPath) {
    if (!fullPath) return [];
    const norm = fullPath.replace(/[/\\]+$/, '');
    const i = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
    const leaf = i < 0 ? norm : norm.slice(i + 1);
    return parseSegmentTags(leaf).tags;
  }

  /** Tag set membership for filter (compare lowercased). */
  function pathHasTag(fullPath, tagLower) {
    const tl = (tagLower || '').toLowerCase();
    if (!tl) return true;
    for (const t of allTagsFromFullPath(fullPath)) {
      if (t.toLowerCase() === tl) return true;
    }
    return false;
  }

  /** Same as pathHasTag but also checks row.name (keeps filter in sync with aggregateTagCountsFromRows). */
  function rowHasTag(row, tagLower, getFullPath) {
    const tl = (tagLower || '').toLowerCase();
    if (!tl) return true;
    if (!row) return false;
    const fp = typeof getFullPath === 'function' ? getFullPath(row) : '';
    if (pathHasTag(fp, tl)) return true;
    const nm = String(row.name || '').trim();
    if (nm) for (const t of parseSegmentTags(nm).tags) if (t.toLowerCase() === tl) return true;
    return false;
  }

  /** Replace any `xk…` tags on the component (wherever they sit) with the given tags, written
   *  trailing before .ext. Editing a file's tags therefore normalises stray leading/mid tags to
   *  the trailing position. */
  function buildTaggedComponent(component, tags) {
    const [stem, ext] = splitExt(component);
    const { base } = peelTags(stem);
    const uniq = [];
    const seen = new Set();
    // One date of each family per file; the last of each given wins. Both are written trailing,
    // deadline before hide-until, so a name built twice from the same tags comes out identical.
    const lastDate = { deadline: '', hide: '' };
    for (const t of tags || []) {
      const trimmed = String(t).trim();
      const kind = dateKind(trimmed);
      if (kind) { lastDate[kind] = normalizeDateTag(trimmed); continue; } // collected, appended below
      // A non-date tag body is letters/digits only, so what we write always reads back as a tag
      // (space is the on-disk delimiter).
      const s = trimmed.replace(/[^A-Za-z0-9]/g, '');
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(prefixForTag(s) + s.toUpperCase());
    }
    if (lastDate.deadline) uniq.push(lastDate.deadline);
    if (lastDate.hide) uniq.push(lastDate.hide);
    if (!uniq.length) return base + ext;
    return (base ? base + ' ' : '') + uniq.join(' ') + ext;
  }

  function parentDir(p) {
    const n = p.replace(/[/\\]+$/, '');
    const i = Math.max(n.lastIndexOf('\\'), n.lastIndexOf('/'));
    return i < 0 ? '' : n.slice(0, i);
  }

  function baseName(p) {
    const n = p.replace(/[/\\]+$/, '');
    const i = Math.max(n.lastIndexOf('\\'), n.lastIndexOf('/'));
    return i < 0 ? n : n.slice(i + 1);
  }

  /** Normalize root for prefix comparison (trim; Windows drive root stays C:\ not C:). */
  function normalizeRootPrefix(rootFolder) {
    let r = (rootFolder || '').trim();
    if (!r) return '';
    r = r.replace(/[/\\]+$/, '');
    if (/^[a-zA-Z]:$/i.test(r)) r += '\\';
    return r;
  }

  /** Aggregate tag counts from paths (for tag bar). */
  function aggregateTagCountsFromPaths(pathsFullPath) {
    const m = new Map();
    for (const fp of pathsFullPath) {
      for (const t of allTagsFromFullPath(fp)) {
        const k = t.toLowerCase();
        const display = m.has(k) ? m.get(k).display : t;
        m.set(k, { display, count: (m.get(k)?.count || 0) + 1 });
      }
    }
    return m;
  }

  /**
   * Tag bar counts: union tags from full path and from row.name (Everything sometimes splits fields oddly).
   * Per row, each tag key counts at most once (no double count if name and path repeat the same tag).
   */
  function aggregateTagCountsFromRows(rows, getFullPath) {
    const m = new Map();
    const rowsArr = Array.isArray(rows) ? rows : [];
    for (const row of rowsArr) {
      if (!row) continue;
      const fp = typeof getFullPath === 'function' ? getFullPath(row) : '';
      const seen = new Set();
      const add = (t) => {
        const s = String(t || '').trim();
        if (!s) return;
        const k = s.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        const display = m.has(k) ? m.get(k).display : s;
        m.set(k, { display, count: (m.get(k)?.count || 0) + 1 });
      };
      for (const t of allTagsFromFullPath(fp)) add(t);
      const nm = String(row.name || '').trim();
      if (nm) for (const t of parseSegmentTags(nm).tags) add(t);
    }
    return m;
  }

  global.TagBrowserTags = {
    TAG_PREFIX,
    TAG_PREFIXES,
    TAG_VOCAB,
    DATE_PREFIX,
    HIDE_PREFIX,
    DATE_PREFIXES,
    prefixForTag,
    isDateTag,
    dateKind,
    dateBody,
    normalizeDateTag,
    splitExt,
    tagNameFromToken,
    parseSegmentTags,
    allTagsFromFullPath,
    pathHasTag,
    rowHasTag,
    buildTaggedComponent,
    parentDir,
    baseName,
    normalizeRootPrefix,
    aggregateTagCountsFromPaths,
    aggregateTagCountsFromRows,
  };
})(typeof window !== 'undefined' ? window : globalThis);
