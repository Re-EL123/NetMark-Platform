import { apiRequest } from './api';
import { esc } from './render';
import { icon } from './icons';

export type Placement = 'banner' | 'popup' | 'section';

export interface Ad {
  id: string;
  title: string;
  body?: string;
  mediaType?: 'image' | 'video' | 'link' | 'none';
  mediaUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  placements?: Placement[];
  audience?: string;
  priority?: number;
  isActive?: boolean;
  dismissible?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

const DISMISS_KEY = 'netmark_ads_dismissed';

function dismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

function dismiss(id: string) {
  const ids = dismissedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-100)));
  }
}

export function resetDismissedAds() {
  localStorage.removeItem(DISMISS_KEY);
}

async function fetchAds(placement?: Placement): Promise<Ad[]> {
  const res = await apiRequest(`/ads${placement ? `?placement=${placement}` : ''}`);
  return res?.success ? (res.data as Ad[]) : [];
}

function mediaHtml(ad: Ad): string {
  const url = ad.mediaUrl || '';
  if (!url) return '';
  if (ad.mediaType === 'video') {
    return `<video class="ad-media" src="${esc(url)}" controls muted loop playsinline preload="metadata"></video>`;
  }
  if (ad.mediaType === 'image') {
    return `<img class="ad-media" src="${esc(url)}" alt="${esc(ad.title)}" loading="lazy" />`;
  }
  return '';
}

function ctaHtml(ad: Ad): string {
  if (!ad.linkUrl) return '';
  return `<a class="btn btn-sm ad-cta" href="${esc(ad.linkUrl)}" target="_blank" rel="noopener">${esc(ad.ctaLabel || 'Learn more')} ${icon('arrow-right')}</a>`;
}

/** Renders the top banner ad (if any) into a host element. */
export function renderAdBanner(host: HTMLElement) {
  fetchAds('banner')
    .then((ads) => {
      const ad = ads.find((a) => !dismissedIds().includes(a.id));
      if (!ad) {
        host.innerHTML = '';
        return;
      }
      host.innerHTML = `
        <div class="ad-banner" data-ad="${esc(ad.id)}">
          ${mediaHtml(ad)}
          <div class="ad-banner-body">
            <div class="ad-banner-title">${icon('megaphone')}<span>${esc(ad.title)}</span></div>
            ${ad.body ? `<div class="ad-banner-text">${esc(ad.body)}</div>` : ''}
            ${ctaHtml(ad)}
          </div>
          ${ad.dismissible !== false ? `<button class="ad-close" data-ad-dismiss title="Dismiss">${icon('x')}</button>` : ''}
        </div>`;
      host.querySelector('[data-ad-dismiss]')?.addEventListener('click', () => {
        dismiss(ad.id);
        host.innerHTML = '';
      });
    })
    .catch(() => {
      host.innerHTML = '';
    });
}

/** Renders sponsored section cards into a host element. */
export function renderAdSections(host: HTMLElement) {
  fetchAds('section')
    .then((ads) => {
      if (!ads.length) {
        host.innerHTML = '';
        return;
      }
      host.innerHTML = `
        <div class="ad-section">
          <div class="ad-section-head">${icon('megaphone')}<span>Sponsored</span></div>
          <div class="ad-grid">
            ${ads
              .map(
                (ad) => `<div class="ad-card" data-ad="${esc(ad.id)}">
              ${mediaHtml(ad)}
              <div class="ad-card-body">
                <div class="ad-card-title">${esc(ad.title)}</div>
                ${ad.body ? `<div class="ad-card-text">${esc(ad.body)}</div>` : ''}
                ${ctaHtml(ad)}
              </div>
              ${
                ad.dismissible !== false
                  ? `<button class="ad-close" data-ad-dismiss="${esc(ad.id)}" title="Dismiss">${icon('x')}</button>`
                  : ''
              }
            </div>`
              )
              .join('')}
          </div>
        </div>`;
      host.querySelectorAll('[data-ad-dismiss]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = (b as HTMLElement).dataset.adDismiss!;
          dismiss(id);
          (b as HTMLElement).closest('.ad-card')?.remove();
        })
      );
    })
    .catch(() => {
      host.innerHTML = '';
    });
}

/** Shows a dismissable popup ad for the highest-priority active popup. */
export function renderAdPopup() {
  fetchAds('popup')
    .then((ads) => {
      const ad = ads.find((a) => !dismissedIds().includes(a.id));
      if (!ad) return;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay ad-popup-overlay';
      overlay.innerHTML = `
        <div class="modal ad-popup">
          <div class="modal-header"><h3>${esc(ad.title)}</h3>${
            ad.dismissible !== false ? `<button class="modal-close" data-ad-dismiss>&times;</button>` : ''
          }</div>
          <div class="modal-body">
            ${mediaHtml(ad).replace('class="ad-media"', 'class="ad-media ad-popup-media"')}
            ${ad.body ? `<p>${esc(ad.body)}</p>` : ''}
            ${ctaHtml(ad)}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => {
        dismiss(ad.id);
        overlay.remove();
      };
      overlay.querySelectorAll('[data-ad-dismiss]').forEach((b) => b.addEventListener('click', close));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    })
    .catch(() => {
      /* ignore */
    });
}

/** Platform-admin ad list (full management view). */
export async function platformAdsHtml(): Promise<string> {
  const res = await apiRequest('/ads?all=true');
  const ads: Ad[] = res?.success ? res.data : [];
  const rows = ads
    .map(
      (ad) => `<tr>
      <td>${esc(ad.title)}</td>
      <td>${esc((ad.placements || []).join(', '))}</td>
      <td>${esc(ad.mediaType || '')}</td>
      <td>${esc(ad.audience || 'all')}</td>
      <td>${ad.isActive === false ? '<span class="badge badge-neutral">inactive</span>' : '<span class="badge badge-success">active</span>'}</td>
      <td>${esc(String(ad.priority ?? 0))}</td>
      <td><div class="row-actions">
        <button class="link-btn" data-ad-edit="${esc(ad.id)}">${icon('pencil')}<span>Edit</span></button>
        <button class="link-btn danger" data-ad-del="${esc(ad.id)}">${icon('trash-2')}<span>Delete</span></button>
      </div></td>
    </tr>`
    )
    .join('');
  return ads.length
    ? `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Placements</th><th>Media</th><th>Audience</th><th>Status</th><th>Priority</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="empty">No adverts yet. Create one to promote content across every panel.</p>`;
}
