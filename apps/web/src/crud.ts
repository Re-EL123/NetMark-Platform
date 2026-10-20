import { apiRequest } from './api';
import { esc } from './render';
import { Column, dataTable, paginationHtml, debounce } from './ui';

export interface CrudFilter {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface CrudConfig {
  endpoint: string;
  columns: Column[];
  actions?: (row: any, reload: () => void) => string;
  toolbar?: () => string;
  filters?: () => CrudFilter[];
  searchPlaceholder?: string;
  pageSize?: number;
  empty?: string;
  bind?: (root: HTMLElement, reload: () => void) => void;
  onData?: (rows: any[]) => void;
}

/** Render a searchable, filterable, paginated table backed by `endpoint`. */
export function crudView(container: HTMLElement, cfg: CrudConfig) {
  const state = { page: 1, search: '', filters: {} as Record<string, string> };

  async function draw() {
    container.innerHTML = '<p class="empty">Loading…</p>';
    const [base, existing] = cfg.endpoint.split('?');
    const params = new URLSearchParams(existing || '');
    params.set('page', String(state.page));
    params.set('pageSize', String(cfg.pageSize || 25));
    if (state.search) params.set('search', state.search);
    for (const [k, v] of Object.entries(state.filters)) if (v) params.set(k, v);

    let res: any;
    try {
      res = await apiRequest(`${base}?${params.toString()}`);
    } catch (err: any) {
      container.innerHTML = `<div class="card"><p class="empty">Failed to load: ${esc(err?.message || 'error')}</p></div>`;
      return;
    }
    if (!res.success) {
      container.innerHTML = `<div class="card"><p class="empty">${esc(res.message || 'Unable to load data.')}</p></div>`;
      return;
    }
    const rows = res.data || [];
    const meta = res.meta || { count: rows.length, page: 1, pageSize: cfg.pageSize || 25 };
    cfg.onData?.(rows);

    const filtersHtml = (cfg.filters?.() || [])
      .map(
        (f) => `<select data-filter="${esc(f.name)}">
          <option value="">${esc(f.label)}: All</option>
          ${f.options
            .map(
              (o) =>
                `<option value="${esc(o.value)}" ${state.filters[f.name] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
            )
            .join('')}
        </select>`
      )
      .join('');

    container.innerHTML = `
      <div class="toolbar">
        ${
          cfg.searchPlaceholder
            ? `<input type="search" id="crudSearch" placeholder="${esc(cfg.searchPlaceholder)}" value="${esc(state.search)}" />`
            : ''
        }
        ${filtersHtml}
        <div class="spacer"></div>
        ${cfg.toolbar ? cfg.toolbar() : ''}
      </div>
      ${dataTable(cfg.columns, rows, { actions: cfg.actions ? (r) => cfg.actions!(r, draw) : undefined, empty: cfg.empty })}
      ${paginationHtml(meta)}`;

    const search = container.querySelector('#crudSearch') as HTMLInputElement | null;
    if (search) {
      search.addEventListener(
        'input',
        debounce(() => {
          state.search = search.value;
          state.page = 1;
          draw();
        }, 350)
      );
    }
    container.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('change', () => {
        state.filters[(el as HTMLElement).dataset.filter!] = (el as HTMLSelectElement).value;
        state.page = 1;
        draw();
      });
    });
    container.querySelectorAll('.pagination button[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        state.page = Number((b as HTMLElement).dataset.page);
        draw();
      });
    });
    cfg.bind?.(container, draw);
  }

  draw();
  return { reload: draw };
}
