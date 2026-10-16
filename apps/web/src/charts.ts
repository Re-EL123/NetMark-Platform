import { esc } from './render';
import { icon } from './icons';

export interface ChartPoint {
  label: string;
  value: number;
}

let uid = 0;
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

function niceMax(values: number[]): number {
  const max = Math.max(1, ...values.filter((v) => Number.isFinite(v)));
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------ sparkline ------------------------------ */
export function sparkline(values: number[], opts: { width?: number; height?: number; color?: string } = {}): string {
  const w = opts.width || 120;
  const h = opts.height || 34;
  const pad = 3;
  const vals = values.length ? values : [0, 0];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const step = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${(w - pad).toFixed(1)},${h - pad}`;
  const color = opts.color || 'var(--brand)';
  const gid = nextId('spark');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon class="spark-area" points="${area}" fill="url(#${gid})"/>
    <polyline class="spark-line" points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ------------------------------ line chart ----------------------------- */
export function lineChart(points: ChartPoint[], opts: { height?: number; caption?: string } = {}): string {
  const W = 640;
  const H = opts.height || 220;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const data = points.length ? points : [{ label: '', value: 0 }];
  const max = niceMax(data.map((p) => p.value));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const x = (i: number) => padL + (data.length > 1 ? (i * iw) / (data.length - 1) : iw / 2);
  const y = (v: number) => padT + ih - (v / max) * ih;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const gy = padT + ih - f * ih;
      return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="chart-gridline"/>
        <text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" class="chart-axis" text-anchor="end">${fmt(f * max)}</text>`;
    })
    .join('');

  const line = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;

  const every = Math.max(1, Math.ceil(data.length / 6));
  const xLabels = data
    .map((p, i) =>
      i % every === 0 || i === data.length - 1
        ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" class="chart-axis" text-anchor="middle">${esc(p.label)}</text>`
        : ''
    )
    .join('');

  const dots = data
    .map(
      (p, i) =>
        `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" data-tip="${esc(p.label)}: ${fmt(
          p.value
        )}" data-tip-pos="top"/>`
    )
    .join('');

  const gid = nextId('line');
  return `<div class="chart-figure">
    <svg class="chart chart-line-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
      </linearGradient></defs>
      ${gridLines}
      <path class="chart-area" d="${area}" fill="url(#${gid})"/>
      <path class="chart-line" pathLength="1" d="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>
    ${opts.caption ? `<p class="empty chart-caption">${esc(opts.caption)}</p>` : ''}
  </div>`;
}

/* ------------------------------ bar chart ------------------------------ */
export function barChart(points: ChartPoint[], opts: { height?: number } = {}): string {
  const W = 640;
  const H = opts.height || 220;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const data = points.length ? points : [{ label: '', value: 0 }];
  const max = niceMax(data.map((p) => p.value));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const slot = iw / data.length;
  const bw = Math.min(46, slot * 0.6);

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const gy = padT + ih - f * ih;
      return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="chart-gridline"/>
        <text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" class="chart-axis" text-anchor="end">${fmt(f * max)}</text>`;
    })
    .join('');

  const bars = data
    .map((p, i) => {
      const bh = (p.value / max) * ih;
      const bx = padL + slot * i + (slot - bw) / 2;
      const by = padT + ih - bh;
      return `<rect class="chart-bar" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(
        1
      )}" height="${Math.max(0, bh).toFixed(1)}" rx="4" style="--i:${i}" data-tip="${esc(p.label)}: ${fmt(
        p.value
      )}" data-tip-pos="top"/>`;
    })
    .join('');

  const every = Math.max(1, Math.ceil(data.length / 8));
  const xLabels = data
    .map((p, i) =>
      i % every === 0
        ? `<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 10}" class="chart-axis" text-anchor="middle">${esc(
            p.label
          )}</text>`
        : ''
    )
    .join('');

  return `<div class="chart-figure">
    <svg class="chart chart-bar-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">
      ${gridLines}${bars}${xLabels}
    </svg>
  </div>`;
}

/* -------------------------------- donut -------------------------------- */
export function donutChart(items: ChartPoint[], opts: { caption?: string; centerLabel?: string } = {}): string {
  const data = items.filter((i) => i.value > 0);
  const total = data.reduce((s, i) => s + i.value, 0) || 1;
  let cursor = 0;
  const segs = data
    .map((p, i) => {
      const len = (p.value / total) * 100;
      const start = (cursor / total) * 360;
      cursor += p.value;
      return `<circle class="donut-seg donut-c${(i % 6) + 1}" cx="21" cy="21" r="15.9155" fill="none" stroke-width="5"
        transform="rotate(${start.toFixed(2)} 21 21)" pathLength="100"
        stroke-dasharray="${len.toFixed(3)} 100" style="--from:${len.toFixed(3)};--to:0;--i:${i}"
        data-tip="${esc(p.label)}: ${fmt(p.value)} (${Math.round((p.value / total) * 100)}%)" data-tip-pos="top"/>`;
    })
    .join('');

  const legend = data
    .map(
      (p, i) =>
        `<li><span class="donut-dot donut-c${(i % 6) + 1}"></span><span class="donut-legend-label">${esc(
          p.label
        )}</span><span class="donut-legend-value">${fmt(p.value)}</span></li>`
    )
    .join('');

  return `<div class="donut-wrap">
    <div class="donut">
      <svg viewBox="0 0 42 42" width="160" height="160" role="img">
        <circle class="donut-track" cx="21" cy="21" r="15.9155" fill="none" stroke-width="5"/>
        ${segs}
      </svg>
      <div class="donut-center"><strong>${fmt(opts.centerLabel ? Number(opts.centerLabel) : total)}</strong><span>${esc(
    opts.caption || 'total'
  )}</span></div>
    </div>
    ${legend ? `<ul class="donut-legend">${legend}</ul>` : '<p class="empty">No data yet.</p>'}
  </div>`;
}

/* ------------------------------- bar list ------------------------------ */
export function barList(items: ChartPoint[], opts: { prefix?: string; color?: string } = {}): string {
  if (!items.length) return '<p class="empty">No data yet.</p>';
  const max = niceMax(items.map((i) => i.value));
  return `<ul class="bar-list">${items
    .map(
      (p, i) =>
        `<li class="bar-row">
          <span class="bar-label" title="${esc(p.label)}">${esc(p.label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, (p.value / max) * 100).toFixed(1)}%;--i:${i}${
          opts.color ? `;background:${opts.color}` : ''
        }"></span></span>
          <span class="bar-value">${opts.prefix || ''}${fmt(p.value)}</span>
        </li>`
    )
    .join('')}</ul>`;
}

/* ------------------------------ chart card ----------------------------- */
export function chartCard(title: string, body: string, opts: { icon?: string; sub?: string } = {}): string {
  return `<div class="card chart-card">
    <div class="chart-head">
      <h3>${opts.icon ? icon(opts.icon) : ''}${esc(title)}</h3>
      ${opts.sub ? `<span class="empty">${esc(opts.sub)}</span>` : ''}
    </div>
    ${body}
  </div>`;
}
