// TagFox tags: two-letter-prefixed vocabulary tokens anywhere in the name are tags, e.g.
// `xkTODO name xpGCC.ext` or `name xkTODO xpGCC.ext`. Three families, all two chars wide:
// xk = status (TODO/WAITING/LATER), xp = person/owner (GCC/STEVE/CLAUDE), xx = label. Tags are
// space-separated; the prefix is stripped for display and the tag tokens are removed from the
// pretty name wherever they sit. Recognising any position (not only trailing) matches the hub
// `xkTODO` convention, where the tag may lead the name (`xkTODO chapter5 GNI tables.md`); it is
// safe because only the fixed TAG_VOCAB words (plus `xd-` dates) count, so a real word is never
// mistaken for a tag. The family for a typed tag is chosen by word (see prefixForTag). Plain
// words and `name[foo].ext` are literal text, not tags.
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
    TODO: 'xk', WAITING: 'xk', LATER: 'xk', // status
    GCC: 'xp', STEVE: 'xp', CLAUDE: 'xp', // person
    PUB: 'xx', INFO: 'xx', KEY: 'xx', // label
  };

  /** Deadline date family `xd-`: an ISO date, e.g. `xd-2026-07-15`. Open (pattern, not vocab). */
  const DATE_PREFIX = 'xd-';
  const DATE_BODY_RE = /^\d{4}-\d{2}-\d{2}$/; // 2026-07-15
  const DATE_TOKEN_RE = /^xd-\d{4}-\d{2}-\d{2}$/; // xd-2026-07-15

  /** Is this tag a deadline date (body form `2026-07-15` or token form `xd-2026-07-15`)? Deadlines
   *  are their own dimension with a dedicated range filter, so callers exclude them from the tag bar. */
  function isDateTag(name) {
    const s = String(name || '').trim();
    return DATE_BODY_RE.test(s) || DATE_TOKEN_RE.test(s);
  }

  /** Family prefix for a tag name (no prefix): a date -> `xd-`, a vocab word -> its family, else `xx`. */
  function prefixForTag(name) {
    const s = String(name || '').trim();
    if (DATE_BODY_RE.test(s)) return DATE_PREFIX;
    return TAG_VOCAB[s.toUpperCase()] || 'xx';
  }

  /** Split a component into [stem, ext]; ext is a trailing `.word` (else ''). */
  function splitExt(component) {
    const c = String(component || '');
    const dot = c.lastIndexOf('.');
    if (dot > 0 && /^\.\w+$/.test(c.slice(dot))) return [c.slice(0, dot), c.slice(dot)];
    return [c, ''];
  }

  /** Tag name for a token, or '' if not a tag. A deadline `xd-2026-07-15`->`2026-07-15`; otherwise a
   *  vocabulary word with its own family prefix: `xkTODO`->`TODO`, `xpGCC`->`GCC`. `xxTODO`,
   *  `xkeyboard`, `xpITL` etc. are not tags. */
  function tagNameFromToken(token) {
    if (!token) return '';
    if (DATE_TOKEN_RE.test(token)) return token.slice(DATE_PREFIX.length);
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
    let lastDate = ''; // only one deadline per file; the last xd- given wins, written trailing
    for (const t of tags || []) {
      const trimmed = String(t).trim();
      // A date keeps its hyphens (xd-2026-07-15); any other tag body is letters/digits only, so
      // what we write always reads back as a tag (space is the on-disk delimiter).
      const isDate = DATE_BODY_RE.test(trimmed) || DATE_TOKEN_RE.test(trimmed);
      const s = isDate ? trimmed.replace(/^xd-/, '') : trimmed.replace(/[^A-Za-z0-9]/g, '');
      if (!s) continue;
      if (isDate) { lastDate = s; continue; } // collected, appended once below
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(s);
    }
    if (lastDate) uniq.push(lastDate);
    if (!uniq.length) return base + ext;
    // Date bodies stay as-is; other bodies are uppercased by convention.
    const tagStr = uniq
      .map((t) => (DATE_BODY_RE.test(t) ? DATE_PREFIX + t : prefixForTag(t) + t.toUpperCase()))
      .join(' ');
    return (base ? base + ' ' : '') + tagStr + ext;
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
    prefixForTag,
    isDateTag,
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
