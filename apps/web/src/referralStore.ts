/**
 * Tiny, dependency-free referral-code store. Kept separate from `referral.ts`
 * so the standalone register page can read the inbound `?ref=` code without
 * pulling the Supabase client or the icon set into its bundle.
 */

const REF_KEY = 'nm_ref';

function readParam(): string | null {
  try {
    return new URLSearchParams(location.search).get('ref');
  } catch {
    return null;
  }
}

/** Record an inbound `?ref=` code so it isn't lost navigating between pages. */
export function captureReferral(): void {
  try {
    const ref = readParam();
    if (ref) localStorage.setItem(REF_KEY, ref.toUpperCase());
  } catch {
    /* storage unavailable — sharing still works, attribution just won't stick */
  }
}

/** The referral code from the URL (if present) or from a previous visit. */
export function getReferralCode(): string | null {
  try {
    const ref = readParam();
    if (ref) {
      localStorage.setItem(REF_KEY, ref.toUpperCase());
      return ref.toUpperCase();
    }
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}
