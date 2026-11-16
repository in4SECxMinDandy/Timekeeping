import type { Response } from 'express';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sendXls(
  res: Response,
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#e2e8f0;font-weight:700;text-transform:uppercase;font-size:11px}
    h1{font-family:Arial,sans-serif;font-size:16px}
  </style></head><body><h1>${esc(title)}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const encoded = encodeURIComponent(filename);
  res
    .status(200)
    .setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
    .setHeader(
      'Content-Disposition',
      `attachment; filename="export.xls"; filename*=UTF-8''${encoded}`,
    )
    .send('\uFEFF' + html);
}
