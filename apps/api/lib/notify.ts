import { getSupabase } from './db';

export interface NotifyInput {
  userId?: string | null;
  role?: string | null;
  companyId?: string | null;
  type?: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
}

/**
 * Create in-app notifications. If `userId` is omitted but `role` is set, the
 * notification is broadcast to every active user with that role (optionally
 * scoped to a company).
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const sb = getSupabase();
    const base = {
      type: input.type || 'info',
      title: input.title,
      body: input.body || null,
      data: input.data || {},
      company_id: input.companyId || null
    };

    if (input.userId) {
      await sb.from('notifications').insert({ ...base, user_id: input.userId });
      void import('./email').then((m) => m.maybeEmail(input.userId || undefined, input.type, input.title, input.body));
      return;
    }

    if (input.role) {
      let q = sb.from('users').select('id').eq('role', input.role);
      if (input.companyId) q = q.eq('company_id', input.companyId);
      const { data } = await q;
      const rows = (data || []).map((u: any) => ({ ...base, user_id: u.id, role: input.role }));
      if (rows.length) await sb.from('notifications').insert(rows);
    }
  } catch (err) {
    console.error('notify failed', err);
  }
}

/**
 * Broadcast a notification to every active user (used for platform
 * announcements). Never throws.
 */
export async function notifyAll(input: Omit<NotifyInput, 'userId' | 'role'>): Promise<void> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from('users').select('id').eq('status', 'active');
    const rows = (data || []).map((u: any) => ({
      user_id: u.id,
      type: input.type || 'info',
      title: input.title,
      body: input.body || null,
      data: input.data || {},
      company_id: input.companyId || null
    }));
    if (rows.length) await sb.from('notifications').insert(rows);
  } catch (err) {
    console.error('notifyAll failed', err);
  }
}
