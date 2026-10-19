import qrcode from 'qrcode-generator';

/**
 * Thin wrapper around `qrcode-generator` (MIT, no deps). Kept isolated so the
 * rest of the app never deals with the library's CJS-style export.
 */

/** Render `text` as an inline SVG string (fixed cell size, safe to embed). */
export function qrSvg(text: string, cellSize = 5, margin = 2): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag(cellSize, margin);
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export function downloadQrSvg(text: string, filename: string): void {
  const svg = qrSvg(text, 8, 4);
  triggerDownload(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), filename);
}

export function downloadQrPng(text: string, filename: string, size = 640): void {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;
  const cell = Math.max(1, Math.floor(size / (count + margin * 2)));
  const dim = cell * (count + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
    }
  }
  triggerDownload(canvas.toDataURL('image/png'), filename);
}
