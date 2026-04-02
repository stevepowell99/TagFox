// Bracket tags in path segments: name[tag1,tag2].ext
(function (global) {
  /** One path segment: "file[a,b].pdf" -> pretty file.pdf, tags [a,b] */
  function parseSegmentTags(component) {
    if (!component) return { pretty: '', tags: [], raw: '' };
    const raw = component;
    const lb = component.lastIndexOf('[');
    if (lb < 0) return { pretty: component, tags: [], raw };
    const rb = component.indexOf(']', lb);
    if (rb < 0) return { pretty: component, tags: [], raw };
    const before = component.slice(0, lb);
    const inner = component.slice(lb + 1, rb);
    const after = component.slice(rb + 1);
    const tags = inner
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return { pretty: before + after, tags, raw };
  }

  /** All tags in a full path (each segment scanned). */
  function allTagsFromFullPath(fullPath) {
    const out = [];
    if (!fullPath) return out;
    const norm = fullPath.replace(/[/\\]+$/, '');
    const parts = norm.split(/[/\\]/).filter((p) => p !== '');
    for (const seg of parts) {
      for (const t of parseSegmentTags(seg).tags) {
        out.push(t);
      }
    }
    return out;
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

  /** Build new segment string with tag list (empty list drops bracket block). */
  function buildTaggedComponent(component, tags) {
    const lb = component.lastIndexOf('[');
    const rb = lb >= 0 ? component.indexOf(']', lb) : -1;
    let before;
    let afterBracket;
    if (lb >= 0 && rb > lb) {
      before = component.slice(0, lb);
      afterBracket = component.slice(rb + 1);
    } else {
      const dot = component.lastIndexOf('.');
      if (dot > 0 && /^\.\w+$/.test(component.slice(dot))) {
        before = component.slice(0, dot);
        afterBracket = component.slice(dot);
      } else {
        before = component;
        afterBracket = '';
      }
    }
    const uniq = [];
    const seen = new Set();
    for (const t of tags || []) {
      const s = String(t).trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(s);
    }
    const block = uniq.length ? `[${uniq.join(',')}]` : '';
    return before + block + afterBracket;
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
