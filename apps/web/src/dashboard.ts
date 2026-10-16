import { statCards, titleCase } from './ui';
import { chartCard, lineChart, barChart, donutChart, barList, ChartPoint } from './charts';

export interface ReportsOverview {
  totals: { orders: number; paidOrders: number; revenue: number; refunds?: number; averageOrderValue?: number };
  byStatus?: Record<string, number>;
  byDay?: { date: string; orders: number; revenue: number }[];
  topStores?: { id: string; name: string; orders: number; revenue: number }[];
  topProducts?: { id: string; name: string; qty: number; revenue: number }[];
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function overviewStats(d: ReportsOverview, symbol = 'R'): string {
  const byDay = d.byDay || [];
  return statCards([
    {
      label: 'Revenue',
      value: d.totals.revenue || 0,
      format: 'money',
      symbol,
      accent: true,
      icon: 'dollar-sign',
      tone: 'brand',
      spark: byDay.map((x) => x.revenue)
    },
    {
      label: 'Orders',
      value: d.totals.orders || 0,
      format: 'number',
      icon: 'receipt',
      tone: 'info',
      spark: byDay.map((x) => x.orders)
    },
    { label: 'Paid orders', value: d.totals.paidOrders || 0, format: 'number', icon: 'check-circle-2', tone: 'success' },
    {
      label: 'Avg. order',
      value: d.totals.averageOrderValue || 0,
      format: 'money',
      symbol,
      icon: 'trending-up',
      tone: 'neutral'
    }
  ]);
}

export function renderOverviewCharts(d: ReportsOverview, symbol = 'R'): string {
  const byDay = d.byDay || [];
  const revenueSeries: ChartPoint[] = byDay.map((x) => ({ label: shortDate(x.date), value: x.revenue }));
  const orderSeries: ChartPoint[] = byDay.slice(-14).map((x) => ({ label: shortDate(x.date), value: x.orders }));
  const statusItems: ChartPoint[] = Object.entries(d.byStatus || {}).map(([k, v]) => ({ label: titleCase(k), value: v }));
  const topProducts: ChartPoint[] = (d.topProducts || []).slice(0, 6).map((p) => ({ label: p.name, value: p.revenue }));
  const topStores: ChartPoint[] = (d.topStores || []).slice(0, 6).map((s) => ({ label: s.name, value: s.revenue }));

  return `<div class="chart-grid">
    ${chartCard('Revenue trend', lineChart(revenueSeries, { caption: 'paid revenue over the selected range' }), {
      icon: 'line-chart',
      sub: 'Last 30 days'
    })}
    ${chartCard('Orders per day', barChart(orderSeries), { icon: 'bar-chart-3', sub: 'Last 14 days' })}
    ${chartCard('Orders by status', donutChart(statusItems, { caption: 'orders' }), { icon: 'pie-chart' })}
    ${chartCard('Top products', barList(topProducts, { prefix: symbol }), { icon: 'package' })}
    ${
      topStores.length
        ? chartCard('Top stores', barList(topStores, { prefix: symbol }), { icon: 'store' })
        : ''
    }
  </div>`;
}
