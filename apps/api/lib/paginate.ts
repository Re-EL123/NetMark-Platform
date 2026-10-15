import { VercelRequest } from '@vercel/node';

export interface ListQuery {
  page: number;
  pageSize: number;
  from: number;
  to: number;
  search: string;
  sort: string;
  ascending: boolean;
}

const MAX_PAGE_SIZE = 100;

export function parseListQuery(req: VercelRequest): ListQuery {
  const q = (req.query || {}) as Record<string, any>;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(q.pageSize || '25'), 10) || 25)
  );
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
    search: String(q.search || '').trim(),
    sort: String(q.sort || 'created_at'),
    ascending: String(q.order || 'desc').toLowerCase() === 'asc'
  };
}

/**
 * Apply standard list behaviour (search, sort, pagination) to a Supabase query
 * builder and execute it. Returns rows plus the total count for pagination.
 *
 * Callers pass a query that already has its `.select('*', { count: 'exact' })`
 * and any role/company scoping applied.
 */
export async function runList(
  query: any,
  list: ListQuery,
  opts: { searchColumns?: string[]; defaultSort?: string } = {}
): Promise<{ data: any[]; count: number; page: number; pageSize: number }> {
  let q = query;
  if (list.search && opts.searchColumns?.length) {
    q = q.or(opts.searchColumns.map((c) => `${c}.ilike.%${list.search}%`).join(','));
  }
  const sort = list.sort || opts.defaultSort || 'created_at';
  q = q.order(sort, { ascending: list.ascending }).range(list.from, list.to);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    data: data || [],
    count: count ?? (data || []).length,
    page: list.page,
    pageSize: list.pageSize
  };
}
