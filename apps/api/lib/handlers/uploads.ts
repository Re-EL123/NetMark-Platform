import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase } from '../http';

const BUCKET = 'netmark';

// Folders a caller is allowed to write into, plus who may write there.
const FOLDERS: Record<string, string[]> = {
  products: ['platformAdmin', 'owner', 'storeOwner'],
  companies: ['platformAdmin', 'owner'],
  stores: ['platformAdmin', 'owner', 'storeOwner'],
  users: ['platformAdmin', 'owner', 'storeOwner', 'customer', 'driver'],
  drivers: ['platformAdmin', 'owner', 'driver'],
  ads: ['platformAdmin'],
  announcements: ['platformAdmin'],
  misc: ['platformAdmin', 'owner', 'storeOwner', 'customer', 'driver']
};

const SAFE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|heic|mp4|webm|mov|m4v|ogg|pdf|docx?|xlsx?|pptx?|csv|txt)$/i;

function safeName(name: string): string {
  const base = String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-80);
  const cleaned = base || 'file';
  return cleaned.replace(/[^a-zA-Z0-9._-]/g, '') || 'file';
}

// POST /uploads/sign  { folder, filename }
// -> { path, token, publicUrl, bucket }
export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  if (slug[0] === 'config' && req.method === 'GET') {
    return ok(res, { data: { bucket: BUCKET } });
  }

  if (slug[0] !== 'sign' || req.method !== 'POST') return fail(res, 'Not found', 404);

  const { folder, filename } = req.body || {};
  const dir = String(folder || '').replace(/[^a-z]/gi, '').toLowerCase();
  const allowed = FOLDERS[dir];
  if (!allowed) return fail(res, 'Invalid upload folder', 400);
  if (!ctx.isPlatform && !allowed.includes(ctx.role)) return fail(res, 'Forbidden', 403);

  const name = safeName(filename);
  if (!SAFE_EXT.test(name)) return fail(res, 'Unsupported file type', 400);

  const path = `${dir}/${ctx.userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${name}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(res, error?.message || 'Could not create upload URL', 500);

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  return ok(res, {
    data: { bucket: BUCKET, path, token: data.token, publicUrl: pub?.publicUrl || '' }
  });
});
