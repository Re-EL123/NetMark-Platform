import { icon, iconify } from './icons';

/**
 * Address autocomplete backed by two free, OSM-based geocoders:
 *
 *   - Photon (photon.komoot.io) — fast, great at landmarks/POIs, no key.
 *   - Nominatim (nominatim.openstreetmap.org) — far more precise for real
 *     street/house addresses.
 *
 * Both are queried in parallel and the hits are merged (addresses first, then
 * places), de-duplicated. If one is unreachable the other still answers, and if
 * both fail the control silently stays a normal free-text address box.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 6000;

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
  /** Which geocoder produced this hit. */
  source: 'photon' | 'nominatim';
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
    isAddress,
    source: 'photon'
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

async function fetchPhoton(query: string, signal: AbortSignal): Promise<Place[]> {
  // Photon's natural relevance order (no lat/lon bias, no re-sorting) so
  // landmarks and POIs surface the same way they do elsewhere. `lang=en` keeps
  // place names in English.
  const params = new URLSearchParams({ q: query, limit: '7', lang: 'en' });
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features || []).map(toPlace).filter((p) => p.street || p.city || p.suburb);
}

interface NominatimHit {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

function nominatimToPlace(hit: NominatimHit): Place {
  const a = hit.address || {};
  const street = clean(a.road) || clean(a.pedestrian) || clean(a.footway) || clean(a.path);
  const houseNumber = clean(a.house_number);
  const name = clean(hit.name);
  const type = clean(a.house_number) ? 'house' : street ? 'street' : '';
  return {
    label: name || street || clean(hit.display_name),
    houseNumber,
    street: street || name,
    suburb: clean(a.suburb) || clean(a.neighbourhood) || clean(a.city_district),
    city: clean(a.city) || clean(a.town) || clean(a.village) || clean(a.municipality),
    state: clean(a.state) || clean(a.county),
    postcode: clean(a.postcode),
    country: clean(a.country),
    countryCode: clean(a.country_code).toUpperCase(),
    lat: hit.lat ? Number(hit.lat) : null,
    lon: hit.lon ? Number(hit.lon) : null,
    isAddress: type === 'house' || !!houseNumber,
    source: 'nominatim'
  };
}

async function fetchNominatim(query: string, signal: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '6',
    addressdetails: '1'
  });
  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const body = (await res.json()) as NominatimHit[];
  return (body || [])
    .map(nominatimToPlace)
    .filter((p) => p.street || p.city || p.suburb);
}

function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of places) {
    const key = `${p.lat?.toFixed(4) ?? ''}|${p.lon?.toFixed(4) ?? ''}|${placeLine(p).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function fetchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const hit = cache.get(query);
  if (hit) return hit;

  // Photon is fast and POI/landmark friendly; Nominatim is far more precise for
  // real street addresses. Query both at once, then merge: addresses first, then
  // interesting places — de-duplicated. If either service is down we still show
  // the other's results.
  const [photon, nominatim] = await Promise.all([
    fetchPhoton(query, signal).catch(() => [] as Place[]),
    fetchNominatim(query, signal).catch(() => [] as Place[])
  ]);

  const addresses = [...nominatim, ...photon].filter((p) => p.isAddress);
  const places = [...nominatim, ...photon].filter((p) => !p.isAddress);

  // Nominatim has no data for very partial queries; when it comes back empty and
  // Photon had something, that's the better answer.
  const merged = dedupe([...addresses, ...places]).slice(0, 8);
  cache.set(query, merged);
  return merged;
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
      const locality = [place.suburb, place.city, place.state, place.country]
        .map(clean)
        .filter((v, idx, arr) => v && arr.indexOf(v) === idx)
        .join(', ');
      const tag = place.isAddress ? 'Address' : place.city ? 'Area' : 'Place';
      return `<button type="button" class="addr-suggest-item" data-addr-pick="${i}">
        ${icon(place.isAddress ? 'map-pin' : 'compass')}
        <span class="addr-suggest-text">
          <span class="addr-suggest-main">${escapeHtml(line)}</span>
          <span class="addr-suggest-sub">${escapeHtml(locality || [tag, place.country].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="addr-source">${place.source}</span>
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

function renderEmpty(anchor: HTMLElement): void {
  closeAll();
  const rect = anchor.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'addr-suggest';
  const width = Math.max(rect.width, 260);
  box.style.width = `${width}px`;
  box.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
  box.style.top = `${rect.bottom + window.scrollY + 4}px`;
  box.innerHTML = '<div class="addr-suggest-empty">No matching address — you can keep typing.</div>';
  document.body.appendChild(box);
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
        if (places.length) renderSuggestions(field, places, apply, query);
        else renderEmpty(field);
      } catch {
        /* geocoder unreachable — free text still works */
      } finally {
        window.clearTimeout(timeout);
      }
    }, 450);
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
