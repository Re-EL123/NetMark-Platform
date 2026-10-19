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
  CheckCircle,
  XCircle,
  Send,
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
  Minus,
  Megaphone,
  RotateCcw,
  Layers,
  Shield,
  FileText,
  KeyRound,
  Webhook,
  Flag,
  Share2,
  Award,
  UserPlus,
  Upload,
  Video,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  Phone,
  Mail,
  MessageCircle,
  Copy,
  QrCode,
  Palette
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
  CheckCircle,
  XCircle,
  Send,
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
  Minus,
  Megaphone,
  RotateCcw,
  Layers,
  Shield,
  FileText,
  KeyRound,
  Webhook,
  Flag,
  Share2,
  Award,
  UserPlus,
  Upload,
  Video,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  Phone,
  Mail,
  MessageCircle,
  Copy,
  QrCode,
  Palette
};
/**
 * Produce a placeholder element. `iconify()` later swaps it for the real SVG.
 * `name` is the kebab-case Lucide name, e.g. `shopping-cart`.
 */
export function icon(name: string, className = ''): string {
  return `<i data-icon="${name}" class="${className}"></i>`;
}

/**
 * Replace every `[data-icon]` placeholder under `root` with its SVG.
 *
 * Lucide copies the placeholder's own `data-icon` attribute onto the generated
 * `<svg>`, so we strip it afterwards. Without this, any later `iconify()` (or
 * the `autoIconify` observer) would keep matching the rendered SVGs and loop
 * forever.
 */
export function iconify(root: Document | Element | DocumentFragment = document): void {
  try {
    createIcons({ icons: REGISTRY, nameAttr: 'data-icon', root, attrs: { 'stroke-width': '2' } });
    root.querySelectorAll('svg[data-icon]').forEach((svg) => svg.removeAttribute('data-icon'));
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
let scheduled = false;

function scheduleIconify(): void {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    iconify(document);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

export function autoIconify(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    // Only react when a batch actually introduces new icon placeholders. Rendered
    // Lucide <svg> elements are skipped so replacing placeholders never re-queues
    // work (which previously looped and made large renders expensive).
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        if (el.matches?.('svg.lucide')) continue;
        if (el.matches?.('[data-icon]') || el.querySelector?.('[data-icon]')) {
          scheduleIconify();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
