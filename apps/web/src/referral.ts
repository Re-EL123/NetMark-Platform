import { apiRequest } from './api';
import { icon } from './icons';
import { toast } from './ui';

export { captureReferral, getReferralCode, clearReferralCode } from './referralStore';

/**
 * Referral + sharing helpers.
 *
 * A share link carries `?ref=<code>`. Any page captures that code into
 * localStorage so it survives until the visitor registers, and the register
 * form reads it back as the distributor code — which is what attributes the
 * new account (and everything they later buy) to the sharer.
 */

function base() {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

/** Build an absolute share URL for a path within the app, tagged with a ref code. */
export function shareUrl(path: string, refCode?: string | null): string {
  const clean = String(path || '').replace(/^\/+/, '');
  const url = `${location.origin}${base()}/${clean}`;
  if (!refCode) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(refCode)}`;
}

let cachedCode: string | null | undefined;

/** The signed-in user's personal referral code (created on first request). */
export async function getMyReferralCode(force = false): Promise<string | null> {
  if (!force && cachedCode !== undefined) return cachedCode;
  const res = await apiRequest('/codes/mine').catch(() => null);
  cachedCode = res?.success ? res.data?.code || null : null;
  return cachedCode ?? null;
}

/** Native share sheet when available, clipboard copy otherwise. */
export async function shareLink(url: string, title: string, text?: string): Promise<void> {
  try {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share({ title, text, url });
      return;
    }
  } catch {
    return; // user dismissed the share sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard', 'success');
  } catch {
    toast(url, 'info');
  }
}

/** A ready-made share button carrying a key the caller resolves to a URL. */
export function shareButton(key: string, label = 'Share'): string {
  return `<button class="btn btn-sm" data-share="${key.replace(/"/g, '&quot;')}">${icon('share-2')}<span>${label}</span></button>`;
}

/**
 * Wire every `[data-share]` button under `root`. `resolver` maps the button's
 * key to the URL + title to share.
 */
export function wireShare(
  root: HTMLElement,
  resolver: (key: string) => { url: string; title: string; text?: string } | null
): void {
  root.querySelectorAll('[data-share]').forEach((el) => {
    const node = el as HTMLElement;
    node.onclick = () => {
      const target = resolver(node.dataset.share || '');
      if (!target || !target.url) return;
      void shareLink(target.url, target.title, target.text);
    };
  });
}
