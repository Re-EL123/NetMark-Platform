import { supabase } from './supabase';
import { apiRequest } from './api';
import { esc } from './render';
import { toast, openModal } from './ui';
import { icon, iconify, autoIconify } from './icons';
import { initTooltips } from './tooltip';
import { initMotion, animateIn } from './motion';
import { startTour, hasSeenTour } from './tour';
import { renderAdBanner, renderAdSections, renderAdPopup } from './ads';

export interface NavItem {
  id: string;
  label: string;
  capability?: string;
  group?: string;
  icon?: string;
}

export interface PanelContext {
  user: any;
  capabilities: string[];
  isPlatform: boolean;
  can: (capability: string) => boolean;
  container: HTMLElement;
  titleEl: HTMLElement;
  navigate: (id: string) => void;
  refresh: () => void;
}

export interface PanelOptions {
  title: string;
  nav: NavItem[];
  /** Optional extra copy for the first-time guided tour. */
  tourIntro?: string;
  render: (id: string, ctx: PanelContext) => Promise<void> | void;
}

let user: any = null;
let capabilities: string[] = [];

export function currentUser() {
  return user;
}

export function can(capability: string): boolean {
  return capabilities.includes('*') || capabilities.includes(capability);
}

export function panelUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`.replace(/\/+/g, '/');
}

async function loadMe(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = import.meta.env.BASE_URL;
    return false;
  }
  const res = await apiRequest('/auth/me');
  if (!res.success || !res.data?.user) {
    await supabase.auth.signOut();
    window.location.href = import.meta.env.BASE_URL;
    return false;
  }
  user = res.data.user;
  capabilities = res.data.capabilities || [];
  localStorage.setItem('netmark_user', JSON.stringify(user));
  return true;
}

async function openNotifications() {
  const res = await apiRequest('/notifications?pageSize=50');
  const items = res.success ? res.data : [];
  await openModal({
    title: 'Notifications',
    html: items.length
      ? `<div>${items
          .map(
            (n: any) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:600">${esc(n.title)} ${n.read ? '' : '<span class="badge badge-info">new</span>'}</div>
        <div class="empty" style="font-size:13px">${esc(n.body || '')}</div>
        <div class="empty" style="font-size:12px">${esc(new Date(n.createdAt).toLocaleString())}</div>
      </div>`
          )
          .join('')}</div>`
      : '<p class="empty">No notifications.</p>',
    onSubmit: async () => {
      await apiRequest('/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      updateBadge(0);
    }
  });
  updateBadge(0);
}

function updateBadge(count: number) {
  const badge = document.getElementById('notifCount');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = String(count > 99 ? '99+' : count);
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

async function refreshBadge() {
  const res = await apiRequest('/notifications?unread=true&pageSize=1');
  updateBadge(res.success ? res.data?.length || res.meta?.unread || 0 : 0);
}

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('netmark_theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    iconify(btn);
  }
}

export async function initPanel(opts: PanelOptions) {
  if (!(await loadMe())) return;

  document.title = `NetMark - ${opts.title}`;
  document.body.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><img src="${import.meta.env.BASE_URL}netmark-logo.png" alt="NetMark" /></div>
        <nav id="nav"></nav>
        <div class="sidebar-foot">
          <button id="themeToggle" class="icon-btn" data-tip="Toggle light / dark theme" data-tip-pos="right" title="Toggle theme" style="color:#fff">${icon('moon')}</button>
        </div>
      </aside>
      <div class="main">
        <header>
          <h1 id="pageTitle">${esc(opts.title)}</h1>
          <div class="user-meta">
            <button id="helpBtn" class="icon-btn" data-tip="Take the tour" title="Take the tour">${icon('compass')}<span class="icon-glow"></span></button>
            <button id="notifBtn" class="icon-btn" data-tip="Notifications" title="Notifications">${icon('bell')}<span id="notifCount" class="notif-count"></span></button>
            <span id="userName" class="name">${esc(user.name || user.email)}</span>
            <button class="logout-btn" id="logoutBtn">${icon('log-out')}<span>Logout</span></button>
          </div>
        </header>
        <div id="adBanner" class="ad-banner-slot"></div>
        <div class="content" id="content"></div>
      </div>
    </div>`;

  initTooltips();
  initMotion();
  autoIconify();
  iconify(document);

  const navEl = document.getElementById('nav') as HTMLElement;
  const content = document.getElementById('content') as HTMLElement;
  const titleEl = document.getElementById('pageTitle') as HTMLElement;

  const visible = opts.nav.filter((n) => !n.capability || can(n.capability));
  navEl.innerHTML = visible
    .map(
      (n) =>
        `<a href="#${n.id}" data-nav="${n.id}">${icon(n.icon || 'circle-dot')}<span>${esc(n.label)}</span></a>`
    )
    .join('');
  iconify(navEl);

  function currentRoute(): string {
    const hash = window.location.hash.replace('#', '');
    return visible.some((n) => n.id === hash) ? hash : visible[0]?.id;
  }

  const ctx: PanelContext = {
    user,
    capabilities,
    isPlatform: capabilities.includes('*'),
    can,
    container: content,
    titleEl,
    navigate: (id: string) => {
      window.location.hash = id;
    },
    refresh: () => run(currentRoute())
  };

  async function run(id: string) {
    navEl.querySelectorAll('a').forEach((a) => a.classList.toggle('active', (a as HTMLElement).dataset.nav === id));
    content.innerHTML = '<p class="empty">Loading…</p>';
    try {
      await opts.render(id, ctx);
    } catch (err: any) {
      content.innerHTML = `<div class="card"><p class="empty">Failed to load: ${esc(err?.message || 'error')}</p></div>`;
    }
    iconify(content);
    animateIn(content);
    const sectionHost = document.createElement('div');
    sectionHost.className = 'ad-section-host';
    content.appendChild(sectionHost);
    renderAdSections(sectionHost);
    // Keep the active nav item in view on small screens.
    try {
      (navEl.querySelector('a.active') as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    } catch {
      /* ignore */
    }
  }

  const tourKey = `panel:${opts.title}`;
  const launchTour = () => {
    document.getElementById('helpBtn')?.classList.remove('pulse');
    startTour({
      key: tourKey,
      title: opts.title,
      intro: opts.tourIntro,
      items: visible.map((n) => ({ id: n.id, label: n.label }))
    });
  };

  window.addEventListener('hashchange', () => run(currentRoute()));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('netmark_user');
    window.location.href = import.meta.env.BASE_URL;
  });
  document.getElementById('notifBtn')?.addEventListener('click', openNotifications);
  document.getElementById('helpBtn')?.addEventListener('click', launchTour);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
  });

  const savedTheme = localStorage.getItem('netmark_theme');
  if (savedTheme) applyTheme(savedTheme);

  renderAdBanner(document.getElementById('adBanner') as HTMLElement);

  await refreshBadge();
  await run(currentRoute());

  // Show a dismissable popup ad shortly after the panel is ready.
  if (!sessionStorage.getItem('netmark_ad_popup_shown')) {
    sessionStorage.setItem('netmark_ad_popup_shown', '1');
    setTimeout(() => renderAdPopup(), 1200);
  }

  // First-time guided tour for this panel.
  if (!hasSeenTour(tourKey)) {
    document.getElementById('helpBtn')?.classList.add('pulse');
    setTimeout(launchTour, 700);
  }
}

export { toast };
