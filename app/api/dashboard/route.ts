import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCached, getStaleCached, setCached } from '@/lib/cache';
import type {
  DashboardData,
  EconomicIndicator,
  NewsArticle,
  StockQuote,
} from '@/lib/types';

const CACHE_KEY = 'dashboard_v1';
const STALE_KEY = 'dashboard_v1_stale';
const CACHE_TTL = 10 * 60 * 1000;       // 10 minutes (fresh)
const STALE_TTL = 6 * 60 * 60 * 1000;  // 6 hours (fallback)

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function timedFetch(url: string, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── GDELT + BBC RSS fallback ─────────────────────────────────────────────────

async function fetchFromGdelt(): Promise<NewsArticle[]> {
  // GDELT DOC API requires OR terms inside parentheses
  const q = encodeURIComponent('(economy OR geopolitics OR war OR climate OR trade OR technology)');
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=15&format=json&timespan=24h`;

  const res = await timedFetch(url);
  if (res.status === 429) throw new Error('GDELT 429');
  if (!res.ok) throw new Error(`GDELT ${res.status}`);

  const text = await res.text();
  let data: { articles?: Record<string, string>[] };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`GDELT non-JSON: ${text.slice(0, 120)}`);
  }
  return (data.articles ?? [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      title: String(a.title),
      url: String(a.url),
      domain: String(a.domain ?? ''),
      seendate: String(a.seendate ?? ''),
      language: String(a.language ?? 'English'),
    }));
}

async function fetchFromBbcRss(): Promise<NewsArticle[]> {
  const res = await timedFetch('https://feeds.bbci.co.uk/news/world/rss.xml', 15_000);
  if (!res.ok) throw new Error(`BBC RSS ${res.status}`);

  const xml = await res.text();
  const items: NewsArticle[] = [];

  // Simple XML extraction without a library
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, 15)) {
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]
      ?? block.match(/<guid[^>]*>(https?[^<]+)<\/guid>/)?.[1] ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

    if (!title || !link) continue;
    items.push({
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      url: link.trim(),
      domain: 'bbc.co.uk',
      // Store raw ISO string; parseGdeltDate in NewsCard handles both formats
      seendate: pubDate ? new Date(pubDate).toISOString() : '',
      language: 'English',
    });
  }
  return items;
}

async function fetchNews(): Promise<NewsArticle[]> {
  // Try GDELT first, fall back to BBC RSS on any failure
  try {
    const articles = await fetchFromGdelt();
    if (articles.length > 0) return articles;
    throw new Error('GDELT returned 0 articles');
  } catch (gdeltErr) {
    console.warn('[dashboard] GDELT failed, trying BBC RSS:', String(gdeltErr));
    return fetchFromBbcRss();
  }
}

// ─── World Bank ───────────────────────────────────────────────────────────────

const WB_INDICATORS = [
  { code: 'NY.GDP.MKTP.KD.ZG', name: 'GDP Growth',   nameThai: 'การเติบโต GDP', unit: '%' },
  { code: 'FP.CPI.TOTL.ZG',   name: 'Inflation',     nameThai: 'อัตราเงินเฟ้อ', unit: '%' },
  { code: 'SL.UEM.TOTL.ZS',   name: 'Unemployment',  nameThai: 'อัตราว่างงาน',  unit: '%' },
] as const;

const WB_COUNTRIES = [
  { code: 'WLD', nameThai: 'โลก' },
  { code: 'USA', nameThai: 'สหรัฐอเมริกา' },
  { code: 'CHN', nameThai: 'จีน' },
  { code: 'EUU', nameThai: 'สหภาพยุโรป' },
  { code: 'JPN', nameThai: 'ญี่ปุ่น' },
  { code: 'THA', nameThai: 'ไทย' },
];

type WBRow = { countryiso3code?: string; date?: string; value?: number | null };

async function fetchEconomics(): Promise<EconomicIndicator[]> {
  const codes = WB_COUNTRIES.map((c) => c.code).join(';');
  // mrv=5 covers 5 years; we keep only the most recent non-null per country+indicator
  const latestMap = new Map<string, EconomicIndicator>();
  let successCount = 0;

  await Promise.allSettled(
    WB_INDICATORS.map(async (ind) => {
      const url =
        `https://api.worldbank.org/v2/country/${codes}/indicator/${ind.code}` +
        `?format=json&mrv=5&per_page=60`;
      try {
        const res = await timedFetch(url, 15_000);
        if (!res.ok) throw new Error(`World Bank ${res.status}`);

        const [, rows] = (await res.json()) as [unknown, WBRow[] | null];
        if (!rows) return;

        successCount++;
        // Rows arrive desc by date — first non-null is the most recent value
        for (const row of rows) {
          if (row.value == null) continue;
          const country = WB_COUNTRIES.find((c) => c.code === row.countryiso3code);
          if (!country) continue;
          const key = `${country.code}-${ind.code}`;
          if (!latestMap.has(key)) {
            latestMap.set(key, {
              name: ind.name,
              nameThai: ind.nameThai,
              value: row.value,
              year: parseInt(row.date ?? '0', 10),
              unit: ind.unit,
              countryCode: country.code,
              countryName: country.nameThai,
            });
          }
        }
      } catch (e) {
        console.warn('[dashboard] World Bank indicator failed:', ind.code, String(e));
      }
    }),
  );

  if (successCount === 0 && latestMap.size === 0) {
    throw new Error('All World Bank requests failed');
  }
  return Array.from(latestMap.values());
}

// ─── Yahoo Finance ────────────────────────────────────────────────────────────

const SYMBOLS: Array<{ symbol: string; name: string; nameThai: string; category: StockQuote['category'] }> = [
  { symbol: '^GSPC',    name: 'S&P 500',     nameThai: 'S&P 500',       category: 'index'     },
  { symbol: '^DJI',     name: 'Dow Jones',   nameThai: 'ดาวโจนส์',     category: 'index'     },
  { symbol: '^IXIC',    name: 'NASDAQ',      nameThai: 'แนสแด็ก',       category: 'index'     },
  { symbol: '^N225',    name: 'Nikkei 225',  nameThai: 'นิกเกอิ 225',   category: 'index'     },
  { symbol: '^HSI',     name: 'Hang Seng',   nameThai: 'ฮั่งเส็ง',      category: 'index'     },
  { symbol: '^FTSE',    name: 'FTSE 100',    nameThai: 'FTSE 100',      category: 'index'     },
  { symbol: 'GC=F',     name: 'Gold',        nameThai: 'ทองคำ',          category: 'commodity' },
  { symbol: 'CL=F',     name: 'Crude Oil',   nameThai: 'น้ำมันดิบ WTI', category: 'commodity' },
  { symbol: 'BTC-USD',  name: 'Bitcoin',     nameThai: 'บิตคอยน์',      category: 'crypto'    },
  { symbol: 'ETH-USD',  name: 'Ethereum',    nameThai: 'อีเทอเรียม',    category: 'crypto'    },
  { symbol: 'USDTHB=X', name: 'USD/THB',     nameThai: 'USD/THB',       category: 'forex'     },
  { symbol: 'DX-Y.NYB', name: 'USD Index',   nameThai: 'ดอลลาร์ Index', category: 'forex'     },
];

type QuoteResult = {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
};

type YFModule = {
  quote(s: string): Promise<QuoteResult>;
  suppressNotices(notices: string[]): void;
};

// Singleton — preserves the Yahoo Finance crumb/cookie across requests
let _yfInstance: YFModule | null = null;
async function getYFInstance(): Promise<YFModule> {
  if (_yfInstance) return _yfInstance;
  const mod = await import('yahoo-finance2');
  const raw = mod.default as unknown as YFModule;
  _yfInstance = raw;
  // Suppress the one-time survey prompt from cluttering logs
  try { _yfInstance.suppressNotices(['yahooSurvey']); } catch { /* ignore */ }
  return _yfInstance;
}

function resetYFInstance() { _yfInstance = null; }

async function fetchStocks(): Promise<StockQuote[]> {
  const yf = await getYFInstance();
  const results: StockQuote[] = [];
  let failCount = 0;
  let crumbFailed = false;

  for (const { symbol, name, nameThai, category } of SYMBOLS) {
    try {
      const q = await yf.quote(symbol);
      results.push({
        symbol, name, nameThai, category,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        currency: q.currency ?? 'USD',
      });
    } catch (e) {
      failCount++;
      const msg = String(e);
      if (!crumbFailed && (msg.includes('crumb') || msg.includes('429'))) {
        crumbFailed = true;
        // Reset singleton so next request gets a fresh crumb after rate limit window
        resetYFInstance();
        console.warn(`[dashboard] YF crumb/rate-limit error for ${symbol}, reset singleton`);
      }
    }
    // Small delay between requests to avoid triggering Yahoo's rate limit
    await new Promise((r) => setTimeout(r, 150));
  }

  if (failCount > 0) {
    console.warn(`[dashboard] ${failCount}/${SYMBOLS.length} YF quotes failed`);
  }
  if (results.length === 0) {
    throw new Error(`All ${SYMBOLS.length} Yahoo Finance quotes failed (429/crumb)`);
  }
  return results;
}

// ─── Gemini summary ───────────────────────────────────────────────────────────

async function generateNewsSummary(articles: NewsArticle[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return 'ไม่สามารถสร้างสรุปข่าวได้ (กรุณาตั้งค่า GEMINI_API_KEY ใน .env.local)';

  const list = articles
    .slice(0, 10)
    .map((a, i) => `${i + 1}. ${a.title} [${a.domain}]`)
    .join('\n');

  const prompt = `คุณคือนักวิเคราะห์ข่าวระดับอาวุโสที่เชี่ยวชาญด้านภูมิรัฐศาสตร์และเศรษฐกิจโลก

ข่าวสำคัญ 24 ชั่วโมงที่ผ่านมา:
${list}

วิเคราะห์และสรุปสถานการณ์โลกเป็นภาษาไทย โดย:
• ระบุประเด็นสำคัญ 3–4 ประเด็นที่กำลังขับเคลื่อนโลกในขณะนี้
• วิเคราะห์แนวโน้มและผลกระทบที่อาจเกิดขึ้นในระยะสั้น
• ใช้ภาษาวิชาการแต่อ่านง่าย ไม่ใช้ Bullet Point — เขียนเป็นย่อหน้า
• ความยาว 150–200 คำ`;

  const genAI = new GoogleGenerativeAI(key);
  // gemini-2.0-flash-lite: higher free-tier quota than gemini-2.0-flash
  const model = genAI.getGenerativeModel(
    { model: 'gemini-2.0-flash-lite' },
    { apiVersion: 'v1' },
  );
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get('refresh') === '1';

  if (!forceRefresh) {
    const cached = getCached<DashboardData>(CACHE_KEY);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  const errors: Record<string, string> = {};

  const [newsRes, econRes, stocksRes] = await Promise.allSettled([
    fetchNews(),
    fetchEconomics(),
    fetchStocks(),
  ]);

  const news = newsRes.status === 'fulfilled' ? newsRes.value : [];
  if (newsRes.status === 'rejected') {
    console.error('[dashboard] News failed (GDELT + BBC RSS):', newsRes.reason);
    errors.news = 'ไม่สามารถโหลดข่าวได้ (GDELT และ BBC RSS ไม่ตอบสนอง)';
  }

  const economics = econRes.status === 'fulfilled' ? econRes.value : [];
  if (econRes.status === 'rejected') {
    console.error('[dashboard] World Bank failed:', econRes.reason);
    errors.economics = 'ข้อมูลเศรษฐกิจ (World Bank) ไม่สามารถโหลดได้ในขณะนี้';
  }

  const stocks = stocksRes.status === 'fulfilled' ? stocksRes.value : [];
  if (stocksRes.status === 'rejected') {
    console.error('[dashboard] Yahoo Finance failed:', stocksRes.reason);
    errors.stocks = 'ข้อมูลตลาดหุ้น (Yahoo Finance) ไม่สามารถโหลดได้ในขณะนี้';
  }

  let newsSummary = 'ไม่มีข้อมูลข่าวสำหรับสรุปในขณะนี้';
  if (news.length > 0) {
    try {
      newsSummary = await generateNewsSummary(news);
    } catch (e) {
      console.error('[dashboard] Gemini failed:', e);
      newsSummary = 'ไม่สามารถสร้างสรุปข่าวด้วย AI ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
      errors.summary = 'Gemini unavailable';
    }
  }

  const hasAnyData = news.length > 0 || economics.length > 0 || stocks.length > 0;

  if (!hasAnyData) {
    // All sources failed — return stale data if available, with a warning
    const stale = getStaleCached<DashboardData>(STALE_KEY);
    if (stale) {
      const ageMin = Math.round(stale.ageMs / 60_000);
      console.warn(`[dashboard] All sources failed, returning stale data (${ageMin}m old)`);
      return NextResponse.json({
        ...stale.data,
        fromCache: true,
        stale: true,
        staleAgeMinutes: ageMin,
        errors: {
          ...errors,
          stale: `⚠️ แสดงข้อมูลเก่า (${ageMin} นาทีที่แล้ว) เนื่องจาก API ทั้งหมดขัดข้องชั่วคราว`,
        },
      });
    }
    // No stale data either — return errors
    return NextResponse.json({
      news: [],
      newsSummary: 'ระบบภายนอกทั้งหมดขัดข้องชั่วคราว กรุณารอสักครู่แล้วรีเฟรชใหม่',
      economics: [],
      stocks: [],
      fetchedAt: Date.now(),
      fromCache: false,
      stale: false,
      errors,
    } satisfies DashboardData & { stale: boolean });
  }

  const data: DashboardData = {
    news,
    newsSummary,
    economics,
    stocks,
    fetchedAt: Date.now(),
    fromCache: false,
    errors,
  };

  setCached(CACHE_KEY, data, CACHE_TTL);
  setCached(STALE_KEY, data, STALE_TTL); // persist for 6h as fallback
  return NextResponse.json(data);
}
