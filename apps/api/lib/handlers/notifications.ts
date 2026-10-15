import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';

export default authed(async (req, res, ctx) => {
  const slug = slugOf(req);
  const sb = getSupabase();

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    const unreadOnly = String(req.query.unread || '') === 'true';
    let q = sb.from('notifications').select('*', { count: 'exact' }).eq('user_id', ctx.userId);
    if (unreadOnly) q = q.eq('read', false);
    const result = await runList(q, list, { searchColumns: ['title', 'body'] });
    const { count: unread } = await sb
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('read', false);
    return ok(res, {
      data: rowsOut(result.data),
      meta: { count: result.count, unread: unread || 0, page: result.page, pageSize: result.pageSize }
    });
  }

  if (slug[0] === 'read' && req.method === 'POST') {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    let q = sb.from('notifications').update({ read: true }).eq('user_id', ctx.userId);
    if (ids.length) q = q.in('id', ids);
    await q;
    return ok(res, { message: 'Marked read' });
  }

  if (slug[0] && req.method === 'DELETE') {
    await sb.from('notifications').delete().eq('id', slug[0]).eq('user_id', ctx.userId);
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
