import { esc } from './render';
import { icon, iconify } from './icons';
import { sparkline } from './charts';
import { uploadFieldHtml, wireUploaders, type UploadField } from './upload';
import { wireAddressFields } from './address';

export type ToastType = 'info' | 'success' | 'error';

/* ------------------------------- toasts -------------------------------- */
const TOAST_ICON: Record<ToastType, string> = {
  info: 'info',
  success: 'check-circle-2',
  error: 'alert-triangle'
};

let toastStack: HTMLElement | null = null;
export function toast(message: string, type: ToastType = 'info', timeout = 3500) {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    document.body.appendChild(toastStack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'info' ? '' : type}`;
  el.innerHTML = `<span class="toast-icon">${icon(TOAST_ICON[type])}</span><span class="toast-msg">${esc(message)}</span>`;
  toastStack.appendChild(el);
  iconify(el);
  setTimeout(() => el.classList.add('leaving'), Math.max(0, timeout - 260));
  setTimeout(() => el.remove(), timeout);
}

/* ------------------------------ formatting ----------------------------- */
export function money(value: unknown, symbol = 'R'): string {
  const n = Number(value || 0);
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function titleCase(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------------- confirm dialog -------------------------- */
export function confirmDialog(message: string, opts: { title?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3>${esc(opts.title || 'Please confirm')}</h3></div>
        <div class="modal-body confirm-body">
          <span class="confirm-icon ${opts.danger ? 'danger' : 'info'}">${icon(opts.danger ? 'alert-triangle' : 'info')}</span>
          <p>${esc(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
          <button class="btn btn-sm ${opts.danger ? 'btn-danger' : ''}" data-confirm>${esc(opts.confirmLabel || 'Confirm')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    iconify(overlay);
    const close = (val: boolean) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

/* -------------------------------- forms -------------------------------- */
export interface Field {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'number'
    | 'email'
    | 'password'
    | 'tel'
    | 'date'
    | 'time'
    | 'select'
    | 'textarea'
    | 'checkbox'
    | 'checkboxes'
    | 'image'
    | 'video'
    | 'file'
    | 'document'
    | 'gallery'
    | 'documents'
    | 'section'
    | 'switch'
    | 'color'
    | 'url';
  required?: boolean;
  value?: any;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  rows?: number;
  full?: boolean;
  folder?: string;
  accept?: string;
  kind?: UploadField['kind'];
  multiple?: boolean;
  /** Show a live character counter (and the limit) under the input. */
  counter?: number;
  /** Static unit shown inside the control (%, days, ZAR, km…). */
  suffix?: string;
  /** Enhance with Photon address autocomplete + "use my location". */
  address?: boolean;
}

const UPLOAD_TYPES = ['image', 'video', 'file', 'document', 'gallery', 'documents'];

function counterHtml(f: Field): string {
  if (!f.counter) return '';
  return `<span class="field-counter" data-counter-for="${esc(f.name)}" data-max="${f.counter}"></span>`;
}

function fieldHtml(f: Field): string {
  if (f.type === 'section') {
    return `<div class="form-section">${esc(f.label)}</div>`;
  }
  if (f.type && UPLOAD_TYPES.includes(f.type)) {
    return uploadFieldHtml({
      name: f.name,
      label: f.label,
      kind: (f.kind || f.type) as UploadField['kind'],
      folder: f.folder,
      accept: f.accept,
      value: f.value,
      required: f.required,
      help: f.help,
      multiple: f.multiple,
      full: f.full
    });
  }
  const value = f.value ?? '';
  const common = `name="${esc(f.name)}" id="f_${esc(f.name)}" ${f.required ? 'required' : ''}`;
  if (f.type === 'checkbox') {
    return `<div class="form-group" style="display:flex;align-items:center;gap:10px">
      <input type="checkbox" ${common} ${value ? 'checked' : ''} style="width:auto" />
      <label for="f_${esc(f.name)}" style="margin:0">${esc(f.label)}</label>
      ${f.help ? `<span class="empty" style="font-size:12px">${esc(f.help)}</span>` : ''}
    </div>`;
  }
  if (f.type === 'switch') {
    return `<div class="form-group">
      <label class="nm-switch">
        <input type="checkbox" ${common} ${value ? 'checked' : ''} />
        <span class="nm-switch-track" aria-hidden="true"></span>
        <span class="nm-switch-text">${esc(f.label)}</span>
      </label>
      ${f.help ? `<p class="empty" style="font-size:12px;margin-top:6px">${esc(f.help)}</p>` : ''}
    </div>`;
  }
  if (f.type === 'checkboxes') {
    const opts = f.options || [];
    const selectedVals = Array.isArray(f.value)
      ? f.value.map(String)
      : String(f.value || '').split(',').map((s) => s.trim()).filter(Boolean);
    const items = opts
      .map(
        (o) => `<label class="pick-item"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}" ${selectedVals.includes(String(o.value)) ? 'checked' : ''}> <span>${esc(o.label)}</span></label>`
      )
      .join('');
    return `<div class="form-group"><label>${esc(f.label)}</label>
      <div class="pick-list">${items || '<p class="empty" style="font-size:12px">No options available.</p>'}</div>
      ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
  }
  if (f.type === 'select') {
    const opts = (f.options || []).slice();
    const isMulti = !!f.multiple;
    const selectedVals = isMulti
      ? (Array.isArray(f.value) ? f.value.map(String) : String(f.value || '').split(',').map((s) => s.trim()).filter(Boolean))
      : [];
    // Keep a stored value that is no longer in the list so saving never
    // silently rewrites it to the first option.
    if (!isMulti && value !== '' && !opts.some((o) => String(o.value) === String(value))) {
      opts.unshift({ value: String(value), label: `${String(value)} (current)` });
    }
    const markup = opts
      .map((o) => {
        const sel = isMulti ? selectedVals.includes(String(o.value)) : String(o.value) === String(value);
        return `<option value="${esc(o.value)}" ${sel ? 'selected' : ''}>${esc(o.label)}</option>`;
      })
      .join('');
    const multiAttrs = isMulti ? `multiple size="${Math.min(12, Math.max(5, opts.length || 5))}"` : '';
    return `<div class="form-group"><label for="f_${esc(f.name)}">${esc(f.label)}</label>
      <select ${common} ${multiAttrs}>${markup}</select>${isMulti ? '<p class="empty" style="font-size:12px">Hold Ctrl/Cmd (⌘) to select multiple.</p>' : ''}${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="form-group${f.address ? ' addr-group' : ''}"${f.address ? ' data-address' : ''}><label for="f_${esc(f.name)}">${esc(f.label)}</label>
      <textarea ${common} rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text-primary);font-family:inherit">${esc(value)}</textarea>
      ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}${counterHtml(f)}</div>`;
  }
  if (f.type === 'color') {
    return `<div class="form-group"><label for="f_${esc(f.name)}">${esc(f.label)}</label>
      <span class="color-field">
        <input type="color" class="color-swatch" data-color-swatch="${esc(f.name)}" value="${esc(normalizeHex(value))}" aria-label="Colour picker" tabindex="-1" />
        <input type="text" ${common} value="${esc(value)}" placeholder="#e50914" spellcheck="false" />
      </span>
      ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
  }
  const type = f.type || 'text';
  const input = `<input type="${type}" ${common} value="${esc(value)}"
      ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}
      ${f.step ? `step="${esc(f.step)}"` : ''} ${f.min !== undefined ? `min="${esc(f.min)}"` : ''} ${f.max !== undefined ? `max="${esc(f.max)}"` : ''} />`;
  const wrapped = f.suffix ? `<span class="input-group">${input}<span class="input-suffix">${esc(f.suffix)}</span></span>` : input;
  return `<div class="form-group${f.address ? ' addr-group' : ''}"${f.address ? ' data-address' : ''}><label for="f_${esc(f.name)}">${esc(f.label)}</label>
    ${wrapped}
    ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}${counterHtml(f)}</div>`;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(value: any): string {
  const m = HEX_RE.exec(String(value || '').trim());
  if (!m) return '#000000';
  const hex = m[1];
  if (hex.length === 3) {
    return (
      '#' +
      hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
    );
  }
  return '#' + hex.toLowerCase();
}

/** Keep each colour field's swatch and hex text box in sync. */
function wireColorFields(scope: HTMLElement, fields: Field[]): void {
  for (const f of fields) {
    if (f.type !== 'color') continue;
    const text = scope.querySelector(`[name="${f.name}"]`) as HTMLInputElement | null;
    const swatch = scope.querySelector(`[data-color-swatch="${f.name}"]`) as HTMLInputElement | null;
    if (!text || !swatch) continue;
    swatch.addEventListener('input', () => {
      text.value = swatch.value;
    });
    text.addEventListener('input', () => {
      if (HEX_RE.test(text.value.trim())) swatch.value = normalizeHex(text.value);
    });
  }
}

/** Render a list of fields as plain HTML (used outside `openModal` too). */
export function fieldsHtml(fields: Field[]): string {
  return fields.map(fieldHtml).join('');
}

/** Attach every interactive behaviour a rendered field list needs. */
export function wireFields(host: HTMLElement, fields: Field[] = []): void {
  wireUploaders(host);
  wireCounters(host, fields);
  wireColorFields(host, fields);
  wireAddressFields(host);
}

/** Read the current values of a rendered field list back into an object. */
export function readFields(host: HTMLElement, fields: Field[]): Record<string, any> {
  const values: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    const el = host.querySelector(`[name="${f.name}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el) continue;
    if (f.type === 'checkbox' || f.type === 'switch') values[f.name] = (el as HTMLInputElement).checked;
    else if (f.type === 'checkboxes') {
      const checked = Array.from(host.querySelectorAll<HTMLInputElement>(`input[name="${f.name}"]:checked`)).map((c) => c.value);
      values[f.name] = checked;
    }
    else if (f.type === 'number') values[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'select' && f.multiple) {
      const sel = el as HTMLSelectElement;
      values[f.name] = Array.from(sel.selectedOptions).map((o) => o.value);
    }
    else if (f.type === 'gallery' || f.type === 'documents') {
      try {
        const parsed = JSON.parse(el.value || '[]');
        values[f.name] = Array.isArray(parsed) ? parsed : [];
      } catch {
        values[f.name] = [];
      }
    } else values[f.name] = el.value;
  }
  return values;
}

/** Keep any `counter` fields in sync with their input length. */
function wireCounters(scope: HTMLElement, fields: Field[]): void {
  for (const f of fields) {
    if (!f.counter) continue;
    const input = scope.querySelector(`[name="${f.name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
    const out = scope.querySelector(`[data-counter-for="${f.name}"]`) as HTMLElement | null;
    if (!input || !out) continue;
    const update = () => {
      const len = input.value.length;
      out.textContent = `${len} / ${f.counter}`;
      out.classList.toggle('over', len > (f.counter as number));
    };
    input.addEventListener('input', update);
    update();
  }
}

export interface ModalOptions {
  title: string;
  fields?: Field[];
  html?: string;
  submitLabel?: string;
  wide?: boolean;
  /** Called right after the modal is mounted - use for async hydration. */
  onMount?: (body: HTMLElement, overlay: HTMLElement) => Promise<void> | void;
  onSubmit: (values: Record<string, any>) => Promise<any> | any;
}

export function openModal(opts: ModalOptions): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const fields = opts.fields || [];
    overlay.innerHTML = `
      <div class="modal ${opts.wide ? 'wide' : ''}">
        <div class="modal-header">
          <h3>${esc(opts.title)}</h3>
          <button class="modal-close" data-cancel>&times;</button>
        </div>
        <form data-form>
          <div class="modal-body">
            <div class="error-modal" style="display:none"></div>
            ${opts.html || ''}
            ${fields.map(fieldHtml).join('')}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
            <button type="submit" class="btn btn-sm" data-submit>${esc(opts.submitLabel || 'Save')}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    iconify(overlay);
    wireUploaders(overlay);
    wireCounters(overlay, fields);
    wireColorFields(overlay, fields);
    wireAddressFields(overlay);
    if (opts.onMount) {
      const body = overlay.querySelector('.modal-body') as HTMLElement | null;
      if (body) {
        try {
          Promise.resolve(opts.onMount(body, overlay)).catch(() => {
            /* hydration failures must not break the modal */
          });
        } catch {
          /* ignore */
        }
      }
    }

    const close = () => {
      overlay.remove();
      resolve();
    };
    overlay.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const form = overlay.querySelector('form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values: Record<string, any> = {};
      for (const f of fields) {
        const el = form.querySelector(`[name="${f.name}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (!el) continue;
        if (f.type === 'checkbox' || f.type === 'switch') values[f.name] = (el as HTMLInputElement).checked;
        else if (f.type === 'checkboxes') {
          values[f.name] = Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${f.name}"]:checked`)).map((c) => c.value);
        }
        else if (f.type === 'number') values[f.name] = el.value === '' ? null : Number(el.value);
        else if (f.type === 'gallery' || f.type === 'documents') {
          try {
            values[f.name] = JSON.parse(el.value || '[]');
          } catch {
            values[f.name] = [];
          }
        } else values[f.name] = el.value;
      }
      const submitBtn = overlay.querySelector('[data-submit]') as HTMLButtonElement | null;
      // The error box is part of the template, but guard against a missing or
      // detached node so a submit never throws on a null element.
      let errBox = overlay.querySelector('.error-modal') as HTMLElement | null;
      if (!errBox) {
        errBox = document.createElement('div');
        errBox.className = 'error-modal';
        errBox.style.display = 'none';
        const host = overlay.querySelector('.modal-body') || overlay.querySelector('form') || overlay;
        host.prepend(errBox);
      }
      const showErr = (message: string) => {
        errBox!.className = 'error';
        errBox!.textContent = message;
        errBox!.style.display = 'block';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = opts.submitLabel || 'Save';
        }
      };
      errBox.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
      }
      try {
        const result = await opts.onSubmit(values);
        if (result === false) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = opts.submitLabel || 'Save';
          }
          return;
        }
        close();
      } catch (err: any) {
        showErr(err?.message || 'Something went wrong');
      }
    });
  });
}

/* ------------------------------- tables -------------------------------- */
export interface Column {
  key: string;
  label: string;
  render?: (row: any) => string;
}

export function dataTable(
  columns: Column[],
  rows: any[],
  opts: { actions?: (row: any) => string; empty?: string } = {}
): string {
  if (!rows || !rows.length) return emptyState(opts.empty || 'No records found.', 'inbox');
  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('') + (opts.actions ? '<th></th>' : '');
  const body = rows
    .map((row) => {
      const cells = columns.map((c) => `<td>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join('');
      const actionCell = opts.actions ? `<td><div class="row-actions">${opts.actions(row)}</div></td>` : '';
      return `<tr>${cells}${actionCell}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Simple static table (cells are pre-rendered HTML strings). */
export function tableSimple(headers: string[], rows: string[][]): string {
  if (!rows.length) return emptyState('No records.', 'inbox');
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* --------------------------- row actions ------------------------------- */
const ACT_ICON: Record<string, string> = {
  edit: 'pencil',
  toggle: 'power',
  remove: 'trash-2',
  delete: 'trash-2',
  status: 'refresh-cw',
  set: 'settings',
  pay: 'credit-card',
  paid: 'credit-card',
  process: 'check-circle-2',
  complete: 'check-circle-2',
  confirm: 'check',
  ready: 'package-check',
  cancel: 'ban',
  renew: 'refresh-cw',
  unlink: 'unlink',
  revoke: 'unlink',
  share: 'share-2',
  accept: 'check',
  approve: 'check',
  verify: 'badge-check',
  reject: 'x',
  assign: 'truck',
  view: 'eye',
  stock: 'boxes',
  refund: 'rotate-ccw',
  payout: 'wallet',
  copy: 'external-link',
  activate: 'power',
  suspend: 'ban',
  reset: 'refresh-cw'
};

/** Render a row-action button wired through `wire()`. */
export function act(action: string, id: string, label: string, cls = ''): string {
  return `<button data-act="${action}" data-id="${esc(id)}" class="${cls}">${icon(ACT_ICON[action] || 'circle-dot')}<span>${esc(
    label
  )}</span></button>`;
}

/** Attach click handlers to every `[data-act]` button inside `root`. */
export function wire(root: HTMLElement, handlers: Record<string, (id: string) => void>): void {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    const el = btn as HTMLElement;
    el.onclick = () => handlers[el.dataset.act || '']?.(el.dataset.id || '');
  });
}

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatItem {
  label: string;
  value: string | number | null;
  sub?: string;
  accent?: boolean;
  icon?: string;
  tone?: StatTone;
  spark?: number[];
  trend?: number;
  /** How to render a numeric `value` (also enables count-up). */
  format?: 'number' | 'money' | 'compact' | 'text';
  symbol?: string;
}

function statValueHtml(i: StatItem): string {
  const numeric = typeof i.value === 'number' && Number.isFinite(i.value);
  const format = i.format || (numeric ? 'number' : 'text');
  if (numeric && format !== 'text') {
    const symbol = i.symbol || 'R';
    const initial = format === 'money' ? `${symbol}0.00` : '0';
    return `<div class="stat-value" data-count-to="${i.value}" data-count-kind="${format}" data-count-symbol="${esc(
      symbol
    )}">${initial}</div>`;
  }
  return `<div class="stat-value">${esc(i.value as any)}</div>`;
}

export function statCards(items: StatItem[]): string {
  return `<div class="stats">${items
    .map((i) => {
      const tone = i.tone || (i.accent ? 'brand' : 'neutral');
      const trend = typeof i.trend === 'number' ? i.trend : null;
      const trendTone = trend === null ? '' : trend >= 0 ? 'up' : 'down';
      return `<div class="stat reveal ${i.accent ? 'accent' : ''}">
        <div class="stat-top">
          ${i.icon ? `<span class="stat-icon tone-${tone}">${icon(i.icon)}</span>` : ''}
          <span class="stat-label">${esc(i.label)}</span>
          ${
            trend !== null
              ? `<span class="stat-trend ${trendTone}">${icon(trend >= 0 ? 'trending-up' : 'trending-down')}${Math.abs(
                  trend
                ).toFixed(0)}%</span>`
              : ''
          }
        </div>
        ${statValueHtml(i)}
        ${
          (i.spark && i.spark.length) || i.sub
            ? `<div class="stat-foot">
          ${i.spark && i.spark.length ? `<span class="stat-spark">${sparkline(i.spark, { width: 96, height: 30 })}</span>` : ''}
          ${i.sub ? `<span class="stat-sub">${esc(i.sub)}</span>` : ''}
        </div>`
            : ''
        }
      </div>`;
    })
    .join('')}</div>`;
}

/** A friendly empty-state block with an icon. */
export function emptyState(message: string, iconName = 'inbox', action = ''): string {
  return `<div class="empty-state"><span class="empty-state-icon">${icon(iconName)}</span><p>${esc(message)}</p>${action}</div>`;
}

/* ---------------------------- event delegation ------------------------- */
export function on(
  root: Element | Document,
  event: string,
  selector: string,
  handler: (el: HTMLElement, ev: Event) => void
) {
  root.addEventListener(event, (e) => {
    const target = (e.target as HTMLElement)?.closest(selector);
    if (target) handler(target as HTMLElement, e);
  });
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300): T {
  let t: any;
  return ((...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

/* ------------------------------ pagination ----------------------------- */
export interface ListMeta {
  count: number;
  page: number;
  pageSize: number;
}

export function paginationHtml(meta: ListMeta): string {
  const pages = Math.max(1, Math.ceil(meta.count / meta.pageSize));
  return `<div class="pagination">
    <span>${meta.count} total</span>
    <button data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>Prev</button>
    <span>Page ${meta.page} of ${pages}</span>
    <button data-page="${meta.page + 1}" ${meta.page >= pages ? 'disabled' : ''}>Next</button>
  </div>`;
}

export function escapeAttr(value: unknown): string {
  return String(value).replace(/"/g, '&quot;');
}
