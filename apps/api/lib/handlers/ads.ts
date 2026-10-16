import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

const PLACEMENTS = ['banner', 'popup', 'section'];
const MEDIA_TYPES = ['image', 'video', 'link', 'none'];
const AUDIENCES = ['all', 'customer', 'owner', 'storeOwner', 'driver', 'platformAdmin'];

function inWindow(ad: any, now: number): boolean {
  if (ad.startsAt && new Date(ad.startsAt).getTime() > now) return false;
  if (ad.endsAt && new Date(ad.endsAt).getTime() < now) return false;
  return true;
}

function forRole(ad: any, role: string): boolean {
  return !ad.audience || ad.audience === 'all' || ad.audience === role;
}

function placementMatch(ad: any, placement?: string): boolean {
  if (!placement) return true;
  const list = Array.isArray(ad.placements) ? ad.placements : [];
  return list.includes(placement);
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(h)) return false;
    if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.')) {
      const parts = h.split('.');
      const p = parseInt(parts[1] || '0', 10);
      if (p >= 16 && p <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}


function pick(b: any): any {
  const patch: any = {};
  if (b.title !== undefined) patch.title = b.title;
  if (b.body !== undefined) patch.body = b.body;
  if (b.mediaType !== undefined) patch.media_type = MEDIA_TYPES.includes(b.mediaType) ? b.mediaType : 'image';
  if (b.mediaUrl !== undefined) {
    const v = String(b.mediaUrl || '').trim();
    if (v && !isSafeUrl(v)) return null as any;
    patch.media_url = v || null;
  }
  if (b.linkUrl !== undefined) {
    const v = String(b.linkUrl || '').trim();
    if (v && !isSafeUrl(v)) return null as any;
    patch.link_url = v || null;
  }
  if (b.ctaLabel !== undefined) patch.cta_label = b.ctaLabel || null;
  if (b.placements !== undefined) {
    const list: string[] = Array.isArray(b.placements) ? b.placements : [b.placements];
    const valid = list.filter((p) => PLACEMENTS.includes(p));
    patch.placements = valid.length ? valid : ['banner'];
  }
  if (b.audience !== undefined) patch.audience = AUDIENCES.includes(b.audience) ? b.audience : 'all';
  if (b.priority !== undefined) patch.priority = Number(b.priority) || 0;
  if (b.isActive !== undefined) patch.is_active = !!b.isActive;
  if (b.dismissible !== undefined) patch.dismissible = !!b.dismissible;
  if (b.startsAt !== undefined) patch.starts_at = b.startsAt || null;
  if (b.endsAt !== undefined) patch.ends_at = b.endsAt || null;
  return patch;
}

// GET /ads?placement=&all=       -> active ads for the caller
// POST /ads                       -> create (platform admin)
// PUT/DELETE /ads/:id             -> update/remove (platform admin)
export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const id = slug[0];
  const placement = req.query.placement ? String(req.query.placement) : '';

  if (!id && req.method === 'GET') {
    const { data, error } = await sb.from('ads').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false });
    if (error) return fail(res, error.message);
    let ads = rowsOut(data);
    if (!ctx.isPlatform || req.query.all !== 'true') {
      const now = Date.now();
      ads = ads.filter((a: any) => a.isActive !== false && inWindow(a, now) && forRole(a, ctx.role) && placementMatch(a, placement));
    } else if (placement) {
      ads = ads.filter((a: any) => placementMatch(a, placement));
    }
    return ok(res, { data: ads });
  }

  if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);

  if (!id && req.method === 'POST') {
    const patch = pick(req.body || {});
    if (!patch) return fail(res, 'Invalid URL provided');
    if (!patch.title) return fail(res, 'Title is required');
    const { data, error } = await sb
      .from('ads')
      .insert({ ...patch, created_by: ctx.userId })
      .select('*')
      .single();
    if (error || !data) return fail(res, error?.message || 'Could not create ad');
    await recordAudit(req, { action: 'ad.create', entityType: 'ad', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  if (id && req.method === 'PUT') {
    const { data: before } = await sb.from('ads').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const patch = pick(req.body || {});
    if (!patch) return fail(res, 'Invalid URL provided');
    const { data, error } = await sb.from('ads').update(patch).eq('id', id).select('*').single();
    if (error || !data) return fail(res, error?.message || 'Could not update ad');
    await recordAudit(req, { action: 'ad.update', entityType: 'ad', entityId: id, before: rowOut(before), after: rowOut(data) });
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'DELETE') {
    const { data: before } = await sb.from('ads').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    await sb.from('ads').delete().eq('id', id);
    await recordAudit(req, { action: 'ad.delete', entityType: 'ad', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
