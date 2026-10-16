import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export interface TourItem {
  id: string;
  label: string;
  description?: string;
}

export interface TourOptions {
  key: string;
  title: string;
  intro?: string;
  items: TourItem[];
}

const SEEN_PREFIX = 'netmark_tour_';

export function hasSeenTour(key: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(key: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, '1');
  } catch {
    /* ignore */
  }
}

export function resetTour(key: string) {
  try {
    localStorage.removeItem(SEEN_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Run the guided tour for a panel. All steps are resolved lazily against the
 * live DOM so a panel that hides a section (by capability) never trips up.
 */
export function startTour(opts: TourOptions) {
  const intro =
    opts.intro ||
    `This is your ${opts.title}. Follow these quick steps to learn your way around — you can replay this tour anytime with the compass button.`;

  const steps: any[] = [];
  const push = (element: string, popover: any) => {
    if (element && !document.querySelector(element)) return;
    steps.push({ element: element || undefined, popover });
  };

  push('', { title: `Welcome to ${opts.title}`, description: intro, side: 'over' });

  const navList = opts.items.map((i) => `• ${i.label}`).join('<br>');
  push('.sidebar nav', {
    title: 'Navigation',
    description: `Jump between sections here:<br>${navList}`,
    side: 'right',
    align: 'start'
  });

  push('#content', {
    title: 'Your workspace',
    description: 'This area changes with the section you pick. Tables let you search, filter, edit and manage records.',
    side: 'top',
    align: 'center'
  });

  push('#notifBtn', {
    title: 'Notifications',
    description: 'Order updates and alerts land here, with an unread badge.',
    side: 'bottom',
    align: 'end'
  });

  push('#helpBtn', {
    title: 'Replay this tour',
    description: 'Tap the compass to run this tour again whenever you like.',
    side: 'bottom',
    align: 'end'
  });

  push('#themeToggle', {
    title: 'Light or dark',
    description: 'Switch the theme to suit your eyes. It is remembered next time.',
    side: 'right',
    align: 'center'
  });

  push('', {
    title: "You're all set",
    description: `${opts.title} is ready. Enjoy!`,
    side: 'over'
  });

  const d = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Finish',
    popoverClass: 'netmark-tour',
    overlayColor: 'rgba(9, 9, 11, 0.62)',
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    allowClose: true,
    onDestroyed: () => markTourSeen(opts.key)
  });

  d.drive();
  markTourSeen(opts.key);
}
