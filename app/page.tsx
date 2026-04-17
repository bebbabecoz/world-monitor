'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Globe,
  RefreshCw,
  TrendingUp,
  Newspaper,
  BarChart3,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import NewsCard from '@/components/NewsCard';
import MarketTicker from '@/components/MarketTicker';
import ChatInterface from '@/components/ChatInterface';
import type { DashboardData, EconomicIndicator, StockQuote } from '@/lib/types';

// ─── Skeleton loaders ──────────────────────────────────────────────────────────

function SkeletonLine({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded-full bg-surface-elevated animate-pulse`} />;
}

function NewsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <SkeletonLine w="w-3/4" />
          <SkeletonLine w="w-1/2" h="h-2" />
        </div>
      ))}
    </div>
  );
}

function EconSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg bg-surface-elevated">
          <SkeletonLine w="w-1/3" h="h-3" />
          <SkeletonLine w="w-1/4" h="h-3" />
        </div>
      ))}
    </div>
  );
}

function StockSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg bg-surface-elevated">
          <SkeletonLine w="w-2/5" h="h-3" />
          <SkeletonLine w="w-1/4" h="h-3" />
        </div>
      ))}
    </div>
  );
}

// ─── Economics table ───────────────────────────────────────────────────────────

const INDICATOR_ORDER = ['การเติบโต GDP', 'อัตราเงินเฟ้อ', 'อัตราว่างงาน'];
const COUNTRY_ORDER = ['โลก', 'สหรัฐอเมริกา', 'จีน', 'สหภาพยุโรป', 'ญี่ปุ่น', 'ไทย'];

function EconomicsTable({ data, error }: { data: EconomicIndicator[]; error?: string }) {
  if (error) return <ErrorBox message={error} />;
  if (!data.length) return <EmptyBox message="ยังไม่มีข้อมูลเศรษฐกิจ" />;

  const grouped = INDICATOR_ORDER.map((ind) => ({
    label: ind,
    rows: COUNTRY_ORDER.map((country) => {
      const entry = data.find((d) => d.nameThai === ind && d.countryName === country);
      return { country, entry };
    }).filter((r) => r.entry != null),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map(({ label, rows }) => (
        <div key={label}>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {label}
          </h4>
          <div className="space-y-1">
            {rows.map(({ country, entry }) => {
              const val = entry!.value!;
              const isPos = val > 0;
              const isNeg = val < 0;
              const maxBar = label === 'อัตราว่างงาน' ? 15 : label === 'อัตราเงินเฟ้อ' ? 20 : 10;
              const barWidth = Math.min(Math.abs(val) / maxBar, 1) * 100;

              return (
                <div
                  key={country}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-surface-elevated/50 transition-colors"
                >
                  <span className="text-xs text-slate-300 w-28 flex-shrink-0">{country}</span>
                  <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isPos ? 'bg-emerald-500' : isNeg ? 'bg-red-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold w-14 text-right flex-shrink-0 ${
                      isPos ? 'text-emerald-400' : isNeg ? 'text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {isPos && '+'}
                    {val.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-600 w-8 flex-shrink-0">
                    {entry!.year}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stocks panel ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<StockQuote['category'], string> = {
  index: 'ดัชนีตลาด',
  commodity: 'สินค้าโภคภัณฑ์',
  crypto: 'สกุลเงินดิจิทัล',
  forex: 'อัตราแลกเปลี่ยน',
};

function StocksPanel({ stocks, error }: { stocks: StockQuote[]; error?: string }) {
  if (error) return <ErrorBox message={error} />;
  if (!stocks.length) return <EmptyBox message="ยังไม่มีข้อมูลตลาด" />;

  const grouped = (['index', 'commodity', 'crypto', 'forex'] as const).map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    items: stocks.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map(({ cat, label, items }) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {label}
          </h4>
          <div className="space-y-1">
            {items.map((q) => (
              <MarketTicker key={q.symbol} quote={q} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      {message}
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
      {message}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center">
          <Icon size={16} className="text-brand-light" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {badge && (
        <span className="badge bg-surface-elevated text-slate-400 text-[10px]">{badge}</span>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setFetchError(null);

    try {
      const url = isRefresh ? '/api/dashboard?refresh=1' : '/api/dashboard';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setLastUpdated(new Date());
    } catch {
      setFetchError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อและ API keys');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 10 minutes to match cache TTL
    const interval = setInterval(() => load(true), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-surface-border">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/30">
              <Globe size={16} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-100 leading-none">
                World Intelligence Dashboard
              </h1>
              <p className="text-[10px] text-slate-500 mt-0.5">แดชบอร์ดข่าวสากลและตลาดการเงิน</p>
            </div>
            <span className="sm:hidden text-sm font-bold text-slate-100">WI Dashboard</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
              <Clock size={12} />
              {dateStr}
            </div>

            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {data?.fromCache ? (
                  <Wifi size={12} className="text-emerald-500" />
                ) : (
                  <WifiOff size={12} className="text-slate-600" />
                )}
                <span className="hidden sm:inline">
                  อัปเดต{' '}
                  {lastUpdated.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {data?.fromCache && ' (cache)'}
                </span>
              </div>
            )}

            <button
              onClick={() => load(true)}
              disabled={loading || refreshing}
              className="btn-icon disabled:opacity-40"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Global error / stale banner ── */}
      {(fetchError || data?.stale || data?.errors?.stale) && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4 space-y-2">
          {fetchError && <ErrorBox message={fetchError} />}
          {data?.stale && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {data.errors?.stale ?? `แสดงข้อมูลเก่า (${data.staleAgeMinutes ?? '?'} นาทีที่แล้ว) — API ภายนอกขัดข้องชั่วคราว`}
            </div>
          )}
        </div>
      )}

      {/* ── 3-column layout ── */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          {/* ── Column 1: News ── */}
          <div className="flex flex-col gap-4">
            <SectionHeader
              icon={Newspaper}
              title="สรุปข่าว"
              subtitle="GDELT · วิเคราะห์โดย Gemini AI"
              badge={data ? `${data.news.length} ข่าว` : undefined}
            />

            {/* AI Summary box */}
            <div className="card border-brand/30 bg-brand/5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-brand-light" />
                <span className="text-xs font-semibold text-brand-light">
                  AI วิเคราะห์สถานการณ์โลก
                </span>
              </div>
              {loading ? (
                <div className="space-y-2">
                  <SkeletonLine />
                  <SkeletonLine w="w-5/6" />
                  <SkeletonLine w="w-4/5" />
                  <SkeletonLine w="w-3/4" />
                </div>
              ) : data?.errors?.summary ? (
                <ErrorBox message={data.errors.summary} />
              ) : (
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {data?.newsSummary ?? 'ไม่มีข้อมูลสรุปข่าว'}
                </p>
              )}
            </div>

            {/* News cards */}
            {loading ? (
              <NewsSkeleton />
            ) : data?.errors?.news ? (
              <ErrorBox message={data.errors.news} />
            ) : (
              <div className="space-y-2">
                {data?.news.map((article, i) => (
                  <NewsCard key={article.url || i} article={article} index={i} />
                ))}
                {(!data?.news || data.news.length === 0) && (
                  <EmptyBox message="ไม่พบข่าวในขณะนี้" />
                )}
              </div>
            )}
          </div>

          {/* ── Column 2: Economics ── */}
          <div className="flex flex-col gap-4">
            <SectionHeader
              icon={TrendingUp}
              title="เศรษฐกิจโลก"
              subtitle="World Bank · ข้อมูลล่าสุด"
            />

            {loading ? (
              <EconSkeleton />
            ) : (
              <EconomicsTable
                data={data?.economics ?? []}
                error={data?.errors?.economics}
              />
            )}

            {/* Data note */}
            <p className="text-[10px] text-slate-600 text-center mt-auto pt-2">
              * ข้อมูลจาก World Bank Open Data · อาจล่าช้า 1–2 ปี
            </p>
          </div>

          {/* ── Column 3: Markets ── */}
          <div className="flex flex-col gap-4 md:col-span-2 xl:col-span-1">
            <SectionHeader
              icon={BarChart3}
              title="ตลาดหุ้น"
              subtitle="Yahoo Finance · Real-time"
            />

            {loading ? (
              <StockSkeleton />
            ) : (
              <StocksPanel
                stocks={data?.stocks ?? []}
                error={data?.errors?.stocks}
              />
            )}

            <p className="text-[10px] text-slate-600 text-center mt-auto pt-2">
              * ข้อมูลตลาดอาจล่าช้า 15–20 นาที ไม่ใช่คำแนะนำการลงทุน
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-surface-border mt-6 py-4 text-center text-xs text-slate-600">
        World Intelligence Dashboard · MIT License · Personal Project ·{' '}
        <span className="text-slate-500">
          ข้อมูลจาก GDELT, World Bank, Yahoo Finance · AI by Google Gemini
        </span>
      </footer>

      {/* ── Floating Chat ── */}
      <ChatInterface />
    </div>
  );
}
