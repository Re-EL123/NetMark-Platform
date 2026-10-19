export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * Public host that serves server-rendered storefront pages (/s/<slug>). Kept
 * separate from the API host so shared storefront links carry the branded
 * storefront domain rather than the API domain.
 */
export const STOREFRONT_BASE_URL = (
  import.meta.env.VITE_STOREFRONT_BASE_URL || 'https://shop.netmark.re-el.co.za'
).replace(/\/+$/, '');
