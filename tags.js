// TagFox tags: trailing two-letter-prefixed tokens are tags, e.g. `name xkTODO xpGCC xxdraft.ext`.
// Three families, all two chars wide: xk = status (TODO/WAITING/LATER), xp = person/owner
// (GCC/STEVE/CLAUDE), xx = label (anything else). Tags are space-separated, sit right before
// the extension, and the prefix is stripped for display. The family for a typed tag is chosen
// by word (see prefixForTag). Plain words and `name[foo].ext` are literal text, not tags.
(function (global) {
  /** Two-char family prefixes that mark a trailing filename token as a tag. */
  const TAG_PREFIXES = ['xk', 'xp', 'xx'];
  const PREFIX_LEN = 2;
  /** Back-compat default prefix (status family). */
  const TAG_PREFIX = 'xk';

  /** Closed sets that decide xk/xp; everything else is a label (xx). */
  const STATUS_WORDS = ['TODO', 'WAITING', 'LATER'];
  const PERSON_WORDS = ['GCC', 'STEVE', 'CLAUDE'];

  /** Family prefix for a tag name (word, no prefix): status -> xk, person -> xp, else label xx. */
  function prefixForTag(name) {
    const u = String(name || '').trim().toUpperCase();
    if (STATUS_WORDS.indexOf(u) !== -1) return 'xk';
    if (PERSON_WORDS.indexOf(u) !== -1) return 'xp';
    return 'xx';
  }

  /** Split a component into [stem, ext]; ext is a trailing `.word` (else ''). */
  function splitExt(component) {
    const c = String(component || '');
    const dot = c.lastIndexOf('.');
    if (dot > 0 && /^\.\w+$/.test(c.slice(dot))) return [c.slice(0, dot), c.slice(dot)];
    return [c, ''];
  }

  /** Tag name for a single token, or '' if not a tag. `xkTODO`->`TODO`, `xpGCC`->`GCC`. */
  function tagNameFromToken(token) {
    if (!token || token.length <= PREFIX_LEN) return '';
    if (TAG_PREFIXES.indexOf(token.slice(0, PREFIX_LEN)) === -1) return '';
    return token.slice(PREFIX_LEN);
  }

  /** Peel trailing `xk…` tokens off a stem; returns { base, tags } with tags in file order. */
  function peelTrailingTags(stem) {
    const tokens = String(stem || '').split(' ');
    const tags = [];
    while (tokens.length) {
      const name = tagNameFromToken(tokens[tokens.length - 1]);
      if (!name) break;
      tags.unshift(name);
      tokens.pop();
    }
    return { base: tokens.join(' ').replace(/\s+$/, ''), tags };
  }

  /** "file xkA xkB.pdf" -> pretty "file.pdf", tags [A,B]. "file.pdf" -> pretty unchanged, tags []. */
  function parseSegmentTags(component) {
    if (!component) return { pretty: '', tags: [], raw: '' };
    const raw = component;
    const [stem, ext] = splitExt(component);
    const { base, tags } = peelTrailingTags(stem);
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

  /** Replace any trailing `xk…` tags on the component with the given tags (before .ext). */
  function buildTaggedComponent(component, tags) {
    const [stem, ext] = splitExt(component);
    const { base } = peelTrailingTags(stem);
    const uniq = [];
    const seen = new Set();
    for (const t of tags || []) {
      // No spaces inside a tag: space is the tag delimiter on disk.
      const s = String(t).trim().replace(/\s+/g, '');
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(s);
    }
    if (!uniq.length) return base + ext;
    // Pick the family by word; tag bodies are always uppercase by convention.
    const tagStr = uniq.map((t) => prefixForTag(t) + t.toUpperCase()).join(' ');
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
    prefixForTag,
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
