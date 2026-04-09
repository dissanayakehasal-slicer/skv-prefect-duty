export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

// Minimal CSV parser that supports:
// - commas inside quotes
// - escaped quotes ("")
// - CRLF/LF newlines
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // Avoid pushing a trailing empty row (common when file ends with newline)
    if (row.length === 1 && row[0] === '' && rows.length === 0) return;
    rows.push(row);
    row = [];
  };

  const s = text.replace(/\uFEFF/g, ''); // strip BOM if present
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      continue;
    }
    if (ch === '\r') {
      // Handle CRLF
      const next = s[i + 1];
      if (next === '\n') i++;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  pushField();
  if (row.length > 1 || row[0] !== '' || rows.length > 0) pushRow();

  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows: rows.map((r) => r.map((c) => c.trim())) };
}

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

