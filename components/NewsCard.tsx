'use client';

import { ExternalLink, Clock } from 'lucide-react';
import type { NewsArticle } from '@/lib/types';

function parseGdeltDate(seendate: string): string {
  if (!seendate) return '';
  let dt: Date;

  // ISO 8601 from BBC RSS: "2024-04-17T10:30:00.000Z"
  if (seendate.includes('-') || seendate.includes('T')) {
    dt = new Date(seendate);
  } else if (seendate.length >= 15) {
    // GDELT compact: "20240417T103000Z"
    const y = seendate.slice(0, 4);
    const mo = seendate.slice(4, 6);
    const d = seendate.slice(6, 8);
    const h = seendate.slice(9, 11);
    const mi = seendate.slice(11, 13);
    dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
  } else {
    return '';
  }

  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  article: NewsArticle;
  index: number;
}

export default function NewsCard({ article, index }: Props) {
  const dateStr = parseGdeltDate(article.seendate);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block card hover:border-brand/50 hover:bg-surface-elevated transition-all duration-200 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 leading-snug group-hover:text-brand-light transition-colors line-clamp-2">
            {article.title}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 truncate max-w-[120px]">
              <ExternalLink size={10} />
              {article.domain}
            </span>
            {dateStr && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <Clock size={10} />
                {dateStr}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}
