'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { StockQuote } from '@/lib/types';

const CATEGORY_LABELS: Record<StockQuote['category'], string> = {
  index: 'ดัชนี',
  commodity: 'สินค้าโภคภัณฑ์',
  crypto: 'คริปโต',
  forex: 'อัตราแลกเปลี่ยน',
};

const CATEGORY_COLORS: Record<StockQuote['category'], string> = {
  index: 'bg-indigo-500/20 text-indigo-300',
  commodity: 'bg-yellow-500/20 text-yellow-300',
  crypto: 'bg-orange-500/20 text-orange-300',
  forex: 'bg-cyan-500/20 text-cyan-300',
};

interface Props {
  quote: StockQuote;
}

export default function MarketTicker({ quote }: Props) {
  const isUp = quote.changePercent > 0;
  const isDown = quote.changePercent < 0;
  const sign = isUp ? '+' : '';

  const priceFormatted =
    quote.category === 'crypto'
      ? quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-elevated hover:bg-surface-border/40 transition-colors duration-150 group">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-shrink-0">
          {isUp ? (
            <TrendingUp size={14} className="text-emerald-400" />
          ) : isDown ? (
            <TrendingDown size={14} className="text-red-400" />
          ) : (
            <Minus size={14} className="text-slate-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200 leading-none truncate">
            {quote.nameThai}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{quote.symbol}</p>
        </div>
        <span className={`badge hidden sm:inline-flex flex-shrink-0 ${CATEGORY_COLORS[quote.category]}`}>
          {CATEGORY_LABELS[quote.category]}
        </span>
      </div>

      <div className="text-right flex-shrink-0 ml-2">
        <p className="text-sm font-mono font-semibold text-slate-100">
          {priceFormatted}
          <span className="text-[10px] font-normal text-slate-500 ml-1">{quote.currency}</span>
        </p>
        <p
          className={`text-xs font-mono font-medium ${
            isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-slate-500'
          }`}
        >
          {sign}{quote.changePercent.toFixed(2)}%
        </p>
      </div>
    </div>
  );
}
