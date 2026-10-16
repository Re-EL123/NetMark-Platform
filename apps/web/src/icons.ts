import { createIcons } from 'lucide';
import {
  LayoutDashboard,
  LayoutGrid,
  Store,
  Building,
  Building2,
  Package,
  PackageSearch,
  PackageCheck,
  Boxes,
  ShoppingBag,
  ShoppingCart,
  ShoppingBasket,
  Receipt,
  CalendarClock,
  CalendarCheck,
  BarChart3,
  LineChart,
  PieChart,
  Users,
  Truck,
  TicketPercent,
  Wallet,
  Coins,
  HandCoins,
  Settings,
  ShieldCheck,
  ClipboardList,
  ClipboardCheck,
  User,
  Gauge,
  MapPin,
  Banknote,
  Bell,
  Moon,
  Sun,
  LogOut,
  Compass,
  Menu,
  X,
  Plus,
  Pencil,
  Trash2,
  Power,
  RefreshCw,
  Link2,
  Unlink,
  Check,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  CreditCard,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  ExternalLink,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  CircleDot,
  ArrowRight,
  Star,
  Tag,
  Clock,
  Loader2,
  BadgeCheck,
  Eye,
  EyeOff,
  MoreVertical,
  Inbox,
  Minus
} from 'lucide';

/**
 * Every icon we render must be listed here so Lucide's `createIcons` can find
 * it. Keys are PascalCase (Lucide's own convention); the `data-icon` attribute
 * uses the kebab-case name which Lucide pascal-cases automatically.
 */
const REGISTRY: Record<string, any> = {
  LayoutDashboard,
  LayoutGrid,
  Store,
  Building,
  Building2,
  Package,
  PackageSearch,
  PackageCheck,
  Boxes,
  ShoppingBag,
  ShoppingCart,
  ShoppingBasket,
  Receipt,
  CalendarClock,
  CalendarCheck,
  BarChart3,
  LineChart,
  PieChart,
  Users,
  Truck,
  TicketPercent,
  Wallet,
  Coins,
  HandCoins,
  Settings,
  ShieldCheck,
  ClipboardList,
  ClipboardCheck,
  User,
  Gauge,
  MapPin,
  Banknote,
  Bell,
  Moon,
  Sun,
  LogOut,
  Compass,
  Menu,
  X,
  Plus,
  Pencil,
  Trash2,
  Power,
  RefreshCw,
  Link2,
  Unlink,
  Check,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  CreditCard,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  ExternalLink,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  CircleDot,
  ArrowRight,
  Star,
  Tag,
  Clock,
  Loader2,
  BadgeCheck,
  Eye,
  EyeOff,
  MoreVertical,
  Inbox,
  Minus
};

/**
 * Produce a placeholder element. `iconify()` later swaps it for the real SVG.
 * `name` is the kebab-case Lucide name, e.g. `shopping-cart`.
 */
export function icon(name: string, className = ''): string {
  return `<i data-icon="${name}" class="${className}"></i>`;
}

/**
 * Replace every `[data-icon]` placeholder under `root` with its SVG. Safe to
 * call repeatedly: rendered SVGs carry `data-lucide` (not `data-icon`), so they
 * are never processed twice.
 */
export function iconify(root: Document | Element | DocumentFragment = document): void {
  try {
    createIcons({ icons: REGISTRY, nameAttr: 'data-icon', root, attrs: { 'stroke-width': '2' } });
  } catch {
    /* never let an icon failure break the UI */
  }
}

/** Convenience: an icon button's inner markup with a tooltip. */
export function iconButton(name: string, tip: string, className = 'icon-btn'): string {
  return `<button type="button" class="${className}" data-tip="${tip}" aria-label="${tip}">${icon(name)}</button>`;
}

/**
 * Watch the DOM and iconify any freshly-inserted placeholders. This makes icon
 * rendering order-independent: panels that swap `innerHTML` inside event
 * handlers still get their icons without an explicit `iconify()` call.
 */
let observer: MutationObserver | null = null;
export function autoIconify(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.matches?.('[data-icon]')) iconify(el.parentElement || el);
        else if (el.querySelector?.('[data-icon]')) iconify(el);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
