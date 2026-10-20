import { icon, iconify } from './icons';

/**
 * Address autocomplete powered by Photon (photon.komoot.io) — a free, OSM-based
 * geocoder that returns house-number level results and needs no API key.
 *
 * The browser calls Photon directly. If it is unreachable (offline, blocked)
 * every control silently stays a normal free-text address box, so an address
 * can always be typed by hand.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';
const TIMEOUT_MS = 6000;

/** Bias results to South Africa (all three stores are ZA today). */
const BIAS = { lat: -29.0, lon: 24.0 };

export interface Place {
  label: string;
  houseNumber: string;
  street: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lon: number | null;
  /** True when Photon resolved an actual house/street number. */
  isAddress: boolean;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, any>;
}

const cache = new Map<string, Place[]>();

function clean(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toPlace(feature: PhotonFeature): Place {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  const countryCode = clean(p.countrycode).toUpperCase();
  const isAddress = clean(p.type) === 'house' || !!clean(p.housenumber);
  // Photon puts the street name in `name` for house/street hits and in `street`
  // for some POIs; fall back through both so we never lose the road.
  const street = clean(p.street) || clean(p.name);
  return {
    label: street || clean(p.name),
    houseNumber: clean(p.housenumber),
    street,
    suburb: clean(p.district) || clean(p.suburb),
    city: clean(p.city) || clean(p.town) || clean(p.village),
    state: clean(p.state) || clean(p.county),
    postcode: clean(p.postcode),
    country: clean(p.country),
    countryCode,
    lat: typeof coords?.[1] === 'number' ? coords[1] : null,
    lon: typeof coords?.[0] === 'number' ? coords[0] : null,
    isAddress
  };
}

/** Human-readable one-line address (skips duplicate / empty parts). */
export function placeLine(place: Place): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const head = [place.houseNumber, place.street].filter(Boolean).join(' ').trim() || place.street;
  for (const part of [head, place.suburb, place.city, place.state, place.postcode, place.country]) {
    const value = clean(part);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    parts.push(value);
  }
  return parts.join(', ');
}

/** Multi-line address used in form textareas. */
export function placeLines(place: Place): string {
  const head = [place.houseNumber, place.street].filter(Boolean).join(' ').trim() || place.street;
  const tail = [place.suburb, place.city, place.state, place.postcode].map(clean).filter(Boolean).join(', ');
  return [head, tail, place.country].map(clean).filter(Boolean).join('\n');
}

async function fetchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const hit = cache.get(query);
  if (hit) return hit;
  const params = new URLSearchParams({ q: query, limit: '7', lat: String(BIAS.lat), lon: String(BIAS.lon) });
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const places = (body.features || [])
    .map(toPlace)
    .filter((p) => p.street || p.city || p.suburb)
    // Prefer real house/street hits over broad administrative areas.
    .sort((a, b) => Number(b.isAddress) - Number(a.isAddress));
  cache.set(query, places);
  return places;
}

/* ------------------------------ suggestions ---------------------------- */

function closeAll(): void {
  document.querySelectorAll('.addr-suggest').forEach((el) => el.remove());
}

function renderSuggestions(anchor: HTMLElement, places: Place[], onPick: (place: Place) => void, query: string): void {
  closeAll();
  if (!places.length) return;
  const rect = anchor.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'addr-suggest';
  const width = Math.max(rect.width, 260);
  box.style.width = `${width}px`;
  box.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
  box.style.top = `${rect.bottom + window.scrollY + 4}px`;
  box.innerHTML = places
    .map((place, i) => {
      const line = placeLine(place) || place.label;
      const tag = place.isAddress ? 'Address' : place.city ? 'Area' : '';
      return `<button type="button" class="addr-suggest-item" data-addr-pick="${i}">
        ${icon(place.isAddress ? 'map-pin' : 'compass')}
        <span class="addr-suggest-text">
          <span class="addr-suggest-main">${escapeHtml(line)}</span>
          <span class="addr-suggest-sub">${escapeHtml([tag, place.country].filter(Boolean).join(' · '))}</span>
        </span>
      </button>`;
    })
    .join('');
  document.body.appendChild(box);
  iconify(box);
  void query;
  box.querySelectorAll<HTMLElement>('[data-addr-pick]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPick(places[Number(btn.dataset.addrPick)]);
      closeAll();
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* -------------------------------- wiring ------------------------------- */

interface AttachOptions {
  /** How the chosen address is written back. Defaults to `textarea`. */
  mode?: 'text' | 'textarea';
  /** Placeholder shown on the primary field. */
  placeholder?: string;
}

/**
 * Upgrade an address field group (`<div class="form-group">` containing a
 * `textarea` or `input[name="address"]`) with Photon autocomplete and a
 * "use my location" button.
 */
export function attachAddressAutocomplete(group: HTMLElement, opts: AttachOptions = {}): void {
  if (group.dataset.addrWired) return;
  const field = group.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input:not([type="hidden"])');
  if (!field) return;
  group.dataset.addrWired = 'true';

  const mode = opts.mode || (field.tagName === 'TEXTAREA' ? 'textarea' : 'text');
  if (opts.placeholder) field.placeholder = opts.placeholder;

  const controls = document.createElement('div');
  controls.className = 'addr-controls';
  controls.innerHTML = `<button type="button" class="btn btn-ghost btn-sm addr-locate">${icon('crosshair')}<span>Use my location</span></button>
    <span class="addr-status"></span>`;
  field.insertAdjacentElement('afterend', controls);
  iconify(controls);

  const statusEl = controls.querySelector('.addr-status') as HTMLElement;
  let statusTimer: number | undefined;
  const setStatus = (text: string, tone: '' | 'error' = '') => {
    statusEl.textContent = text;
    statusEl.className = `addr-status${tone ? ' ' + tone : ''}`;
    window.clearTimeout(statusTimer);
    if (text) statusTimer = window.setTimeout(() => (statusEl.textContent = ''), 4000);
  };

  let timer: number | undefined;
  let controller: AbortController | undefined;
  let seq = 0;

  const apply = (place: Place) => {
    const value = mode === 'textarea' ? placeLines(place) : placeLine(place);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    group.classList.add('addr-confirmed');
  };

  field.addEventListener('input', () => {
    const query = field.value.trim();
    group.classList.remove('addr-confirmed');
    if (query.length < 3) {
      closeAll();
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      const mySeq = ++seq;
      const timeout = window.setTimeout(() => controller?.abort(), TIMEOUT_MS);
      try {
        const places = await fetchPlaces(query, controller.signal);
        if (mySeq !== seq || !field.isConnected || document.activeElement !== field) return;
        renderSuggestions(field, places, apply, query);
      } catch {
        /* geocoder unreachable — free text still works */
      } finally {
        window.clearTimeout(timeout);
      }
    }, 350);
  });

  field.addEventListener('blur', () => window.setTimeout(closeAll, 150));
  field.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closeAll();
  });

  (controls.querySelector('.addr-locate') as HTMLElement).addEventListener('click', async () => {
    const btn = controls.querySelector('.addr-locate') as HTMLButtonElement;
    if (!navigator.geolocation) {
      setStatus('Location is not available in this browser.', 'error');
      return;
    }
    btn.disabled = true;
    btn.classList.add('busy');
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (place) {
            apply(place);
            setStatus('Address filled from your location.');
          } else {
            setStatus('Could not find an address near you — type it in.', 'error');
          }
        } finally {
          btn.disabled = false;
          btn.classList.remove('busy');
        }
      },
      () => {
        btn.disabled = false;
        btn.classList.remove('busy');
        setStatus('Location permission denied — type the address instead.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/** Photon reverse lookup — fills a house-number level address from lat/lon. */
async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: '1' });
  try {
    const res = await fetch(`${PHOTON_REVERSE_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const first = body.features?.[0];
    return first ? toPlace(first) : null;
  } catch {
    return null;
  }
}

/** Wire every address field inside `scope` (uploaders already wired). */
export function wireAddressFields(scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>('[data-address]').forEach((group) => attachAddressAutocomplete(group));
}
