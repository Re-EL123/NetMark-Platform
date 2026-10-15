import { VercelRequest } from '@vercel/node';
import { getSupabase } from './db';

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string | null;
  companyId?: string | null;
  before?: any;
  after?: any;
  metadata?: Record<string, any>;
}

/**
 * Append an entry to the audit log. Never throws - a logging failure must not
 * break the request that triggered it.
 */
export async function recordAudit(req: VercelRequest, input: AuditInput): Promise<void> {
  try {
    const user = (req as any).user || {};
    const headers = (req.headers || {}) as Record<string, any>;
    const forwarded = headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
    const sb = getSupabase();
    await sb.from('audit_logs').insert({
      actor_id: user.id || null,
      actor_email: user.email || null,
      actor_role: user.role || null,
      action: input.action,
      entity_type: input.entityType || null,
      entity_id: input.entityId ? String(input.entityId) : null,
      company_id: input.companyId || user.company_id || null,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata || {},
      ip: ip || null,
      user_agent: (headers['user-agent'] as string) || null
    });
  } catch (err) {
    console.error('recordAudit failed', err);
  }
}
