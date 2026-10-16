import { esc } from './render';

export type ToastType = 'info' | 'success' | 'error';

/* ------------------------------- toasts -------------------------------- */
let toastStack: HTMLElement | null = null;
export function toast(message: string, type: ToastType = 'info', timeout = 3500) {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    document.body.appendChild(toastStack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'info' ? '' : type}`;
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

/* ------------------------------ formatting ----------------------------- */
export function money(value: unknown, symbol = 'R'): string {
  const n = Number(value || 0);
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function titleCase(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
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
        <div class="modal-body"><p>${esc(message)}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
          <button class="btn btn-sm ${opts.danger ? 'btn-danger' : ''}" data-confirm>${esc(opts.confirmLabel || 'Confirm')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
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
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'date' | 'time' | 'select' | 'textarea' | 'checkbox';
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
}

function fieldHtml(f: Field): string {
  const value = f.value ?? '';
  const common = `name="${esc(f.name)}" id="f_${esc(f.name)}" ${f.required ? 'required' : ''}`;
  if (f.type === 'checkbox') {
    return `<div class="form-group" style="display:flex;align-items:center;gap:10px">
      <input type="checkbox" ${common} ${value ? 'checked' : ''} style="width:auto" />
      <label for="f_${esc(f.name)}" style="margin:0">${esc(f.label)}</label>
      ${f.help ? `<span class="empty" style="font-size:12px">${esc(f.help)}</span>` : ''}
    </div>`;
  }
  if (f.type === 'select') {
    const opts = (f.options || [])
      .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('');
    return `<div class="form-group"><label for="f_${esc(f.name)}">${esc(f.label)}</label>
      <select ${common}>${opts}</select>${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="form-group"><label for="f_${esc(f.name)}">${esc(f.label)}</label>
      <textarea ${common} rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text-primary);font-family:inherit">${esc(value)}</textarea>
      ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
  }
  return `<div class="form-group"><label for="f_${esc(f.name)}">${esc(f.label)}</label>
    <input type="${f.type || 'text'}" ${common} value="${esc(value)}"
      ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}
      ${f.step ? `step="${esc(f.step)}"` : ''} ${f.min !== undefined ? `min="${esc(f.min)}"` : ''} ${f.max !== undefined ? `max="${esc(f.max)}"` : ''} />
    ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}</div>`;
}

export interface ModalOptions {
  title: string;
  fields?: Field[];
  html?: string;
  submitLabel?: string;
  wide?: boolean;
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
        if (f.type === 'checkbox') values[f.name] = (el as HTMLInputElement).checked;
        else if (f.type === 'number') values[f.name] = el.value === '' ? null : Number(el.value);
        else values[f.name] = el.value;
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
  if (!rows || !rows.length) return `<p class="empty">${esc(opts.empty || 'No records found.')}</p>`;
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

export function statCards(items: { label: string; value: string | number; sub?: string; accent?: boolean }[]): string {
  return `<div class="stats">${items
    .map(
      (i) => `<div class="stat ${i.accent ? 'accent' : ''}">
        <div class="stat-label">${esc(i.label)}</div>
        <div class="stat-value">${esc(i.value)}</div>
        ${i.sub ? `<div class="stat-sub">${esc(i.sub)}</div>` : ''}
      </div>`
    )
    .join('')}</div>`;
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
