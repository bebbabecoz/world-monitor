import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getCached, getStaleCached, setCached } from '@/lib/cache';
import type {
  AiAnalysis,
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

// ─── News sources: GDELT → BBC → Al Jazeera → DW ────────────────────────────

async function fetchFromGdelt(): Promise<NewsArticle[]> {
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

function parseRssFeed(xml: string, domain: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, 15)) {
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]
      ?? block.match(/<guid[^>]*>(https?[^<]+)<\/guid>/)?.[1] ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    if (!title || !link) continue;
    items.push({
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
      url: link.trim(),
      domain,
      seendate: pubDate ? new Date(pubDate).toISOString() : '',
      language: 'English',
    });
  }
  return items;
}

async function fetchFromRss(url: string, domain: string): Promise<NewsArticle[]> {
  const res = await timedFetch(url, 15_000);
  if (!res.ok) throw new Error(`${domain} RSS ${res.status}`);
  const xml = await res.text();
  const items = parseRssFeed(xml, domain);
  if (items.length === 0) throw new Error(`${domain} RSS returned 0 items`);
  return items;
}

const RSS_FALLBACKS: Array<{ url: string; domain: string; label: string }> = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',  domain: 'bbc.co.uk',       label: 'BBC'         },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',     domain: 'aljazeera.com',   label: 'Al Jazeera'  },
  { url: 'https://rss.dw.com/xml/rss-en-world',           domain: 'dw.com',          label: 'DW'          },
];

async function fetchNews(): Promise<NewsArticle[]> {
  try {
    const articles = await fetchFromGdelt();
    if (articles.length > 0) return articles;
    throw new Error('GDELT returned 0 articles');
  } catch (gdeltErr) {
    console.warn('[dashboard] GDELT failed, trying RSS fallbacks:', String(gdeltErr));
  }

  for (const { url, domain, label } of RSS_FALLBACKS) {
    try {
      const articles = await fetchFromRss(url, domain);
      console.log(`[dashboard] News loaded from ${label} (${articles.length} articles)`);
      return articles;
    } catch (e) {
      console.warn(`[dashboard] ${label} RSS failed:`, String(e));
    }
  }

  throw new Error('All news sources failed (GDELT + BBC + Al Jazeera + DW)');
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

// ─── Yahoo Finance v8 direct (no crumb required) ─────────────────────────────

type V8Meta = {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  currency?: string;
};

async function fetchYahooV8(symbol: string): Promise<StockQuote & { symbol: string }> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
  const res = await timedFetch(url, 10_000);
  if (!res.ok) throw new Error(`YF v8 ${res.status} for ${symbol}`);

  const data = (await res.json()) as { chart?: { result?: Array<{ meta?: V8Meta }> } };
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`YF v8 no price for ${symbol}`);

  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose ?? price;
  const change = price - prev;
  const changePercent = prev ? (change / prev) * 100 : 0;

  return { symbol, price, change, changePercent, currency: meta.currency ?? 'USD' };
}

function resetYFInstance() { _yfInstance = null; }

async function fetchStocks(): Promise<StockQuote[]> {
  const results: StockQuote[] = [];
  let failCount = 0;

  for (const { symbol, name, nameThai, category } of SYMBOLS) {
    try {
      const q = await fetchYahooV8(symbol);
      results.push({ symbol, name, nameThai, category, price: q.price, change: q.change, changePercent: q.changePercent, currency: q.currency });
    } catch (e) {
      failCount++;
      console.warn(`[dashboard] YF v8 failed for ${symbol}:`, String(e).slice(0, 80));
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (failCount > 0) console.warn(`[dashboard] ${failCount}/${SYMBOLS.length} YF quotes failed`);
  if (results.length === 0) throw new Error(`All ${SYMBOLS.length} Yahoo Finance v8 quotes failed`);
  return results;
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

async function generateAnalysis(
  news: NewsArticle[],
  economics: EconomicIndicator[],
  stocks: StockQuote[],
): Promise<AiAnalysis> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const newsList = news.slice(0, 12)
    .map((a, i) => `${i + 1}. ${a.title} [${a.domain}]`)
    .join('\n');

  const econList = economics
    .map((e) => `${e.countryName} ${e.nameThai}: ${e.value?.toFixed(2)}% (${e.year})`)
    .join(' | ');

  const stockList = stocks
    .map((s) => {
      const sign = s.changePercent >= 0 ? '+' : '';
      return `${s.nameThai}: ${s.price.toLocaleString()} (${sign}${s.changePercent.toFixed(2)}%)`;
    })
    .join(' | ');

  const prompt = `คุณคือนักวิเคราะห์ระดับอาวุโสที่เชี่ยวชาญด้านภูมิรัฐศาสตร์ เศรษฐกิจโลก และตลาดการเงิน

ข้อมูลล่าสุด ณ วันนี้:

[ข่าวรอบโลก 24 ชั่วโมง]
${newsList}

[ข้อมูลเศรษฐกิจมหภาค - World Bank]
${econList || 'ไม่มีข้อมูล'}

[ราคาตลาดการเงินล่าสุด]
${stockList || 'ไม่มีข้อมูล'}

วิเคราะห์ข้อมูลทั้งหมดด้านบนเป็นภาษาไทย และตอบในรูปแบบ JSON เท่านั้น ห้ามมีข้อความนอก JSON:

{
  "worldNews": "สรุปข่าวรอบโลกที่สำคัญวันนี้ ระบุประเด็นหลัก 3-4 เรื่องที่กำลังเกิดขึ้น เขียนเป็นย่อหน้า 80-100 คำ",
  "macroEconomy": "วิเคราะห์เศรษฐกิจมหภาคโลก อ้างอิงตัวเลข GDP เงินเฟ้อ การว่างงาน ของแต่ละประเทศ บอกแนวโน้มและนัยสำคัญ เขียนเป็นย่อหน้า 80-100 คำ",
  "markets": "วิเคราะห์ตลาดหุ้น สินค้าโภคภัณฑ์ คริปโต และค่าเงิน อ้างอิงตัวเลขและเปอร์เซ็นต์การเปลี่ยนแปลง บอกว่าตลาดโดยรวมเป็นอย่างไร เขียนเป็นย่อหน้า 80-100 คำ",
  "outlook": "วิเคราะห์ทิศทางและแนวโน้มระยะสั้น (1-4 สัปดาห์) ของประเด็นสำคัญ เช่น สงคราม ความตึงเครียดทางการค้า ทิศทางเศรษฐกิจ ความเสี่ยงที่ต้องติดตาม เขียนเป็นย่อหน้า 80-100 คำ"
}`;

  const groq = new Groq({ apiKey: key });
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'ตอบด้วย JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ markdown code block' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });

  const text = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(text) as Partial<AiAnalysis>;

  return {
    worldNews:    parsed.worldNews    ?? 'ไม่สามารถวิเคราะห์ได้',
    macroEconomy: parsed.macroEconomy ?? 'ไม่สามารถวิเคราะห์ได้',
    markets:      parsed.markets      ?? 'ไม่สามารถวิเคราะห์ได้',
    outlook:      parsed.outlook      ?? 'ไม่สามารถวิเคราะห์ได้',
  };
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

  let aiAnalysis: AiAnalysis | null = null;
  if (news.length > 0 || economics.length > 0 || stocks.length > 0) {
    try {
      aiAnalysis = await generateAnalysis(news, economics, stocks);
    } catch (e) {
      console.error('[dashboard] AI analysis failed:', e);
      errors.summary = 'AI วิเคราะห์ไม่สำเร็จในขณะนี้';
    }
  }

  const hasAnyData = news.length > 0 || economics.length > 0 || stocks.length > 0;

  if (!hasAnyData) {
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
    return NextResponse.json({
      news: [],
      aiAnalysis: null,
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
    aiAnalysis,
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
