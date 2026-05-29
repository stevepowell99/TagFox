(function (global) {
  // Shared string/HTML preview helpers used across the renderer.
  function escapeHtmlForPreview(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Cap rich preview HTML so large docs do not create a huge DOM.
  function truncateRichPreviewHtml(html, maxChars) {
    const s = String(html || '');
    if (s.length <= maxChars) return s;
    const head = s.slice(0, maxChars);
    const p = head.lastIndexOf('</p>');
    const body = p >= Math.floor(maxChars * 0.3) ? head.slice(0, p + 4) : head;
    return (
      body +
      '<p class="text-muted small mb-0 mt-2">Preview truncated - use <strong>Open</strong> for the full document.</p>'
    );
  }

  // Pretty-print JSON text previews when possible; otherwise leave the body alone.
  function formatTextPreviewBody(ext, raw) {
    const t = String(raw ?? '');
    if (ext === 'json') {
      try {
        return JSON.stringify(JSON.parse(t), null, 2);
      } catch (_) {
        return t;
      }
    }
    return t;
  }

  // CSV parser for viewer previews; supports quoted fields and embedded newlines.
  function parseCsvRows(raw) {
    const text = String(raw ?? '').replace(/^\uFEFF/, '');
    if (!text.length) return [];
    const rows = [];
    let row = [];
    let field = '';
    let i = 0;
    let inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQ = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQ = true;
        i++;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (c === '\r') {
        i++;
        if (text[i] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      field += c;
      i++;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  // Bootstrap table HTML for CSV-style previews.
  function csvPreviewTableHtml(rows, maxRows) {
    if (!rows.length) return '<p class="text-muted mb-0">(empty)</p>';
    const cap = maxRows > 0 ? maxRows : rows.length;
    const capped = rows.length > cap ? rows.slice(0, cap) : rows;
    const total = rows.length;
    const nCols = Math.max.apply(
      null,
      capped.map((r) => r.length)
    );
    function pad(r) {
      const out = r.slice();
      while (out.length < nCols) out.push('');
      return out;
    }
    let html =
      '<div class="table-responsive"><table class="table table-sm table-bordered table-striped mb-0 align-middle">';
    if (capped.length === 1) {
      html += '<tbody><tr>';
      for (const cell of pad(capped[0])) html += '<td>' + escapeHtmlForPreview(cell) + '</td>';
      html += '</tr></tbody>';
    } else {
      html += '<thead class="table-light"><tr>';
      for (const cell of pad(capped[0])) html += '<th scope="col">' + escapeHtmlForPreview(cell) + '</th>';
      html += '</tr></thead><tbody>';
      for (let r = 1; r < capped.length; r++) {
        html += '<tr>';
        for (const cell of pad(capped[r])) html += '<td>' + escapeHtmlForPreview(cell) + '</td>';
        html += '</tr>';
      }
      html += '</tbody>';
    }
    html += '</table></div>';
    if (maxRows > 0 && total > maxRows) {
      html +=
        '<p class="text-muted small mb-0 mt-2">Preview: first ' +
        maxRows +
        ' rows only (' +
        total +
        ' rows).</p>';
    }
    return html;
  }

  global.TagFoxPreviewTextHelpers = {
    escapeHtmlForPreview,
    truncateRichPreviewHtml,
    formatTextPreviewBody,
    parseCsvRows,
    csvPreviewTableHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
