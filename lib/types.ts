export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  seendate: string;
  language?: string;
}

export interface EconomicIndicator {
  name: string;
  nameThai: string;
  value: number | null;
  year: number;
  unit: string;
  countryCode: string;
  countryName: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  nameThai: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  category: 'index' | 'commodity' | 'crypto' | 'forex';
}

export interface AiAnalysis {
  worldNews: string;
  macroEconomy: string;
  markets: string;
  outlook: string;
}

export interface DashboardData {
  news: NewsArticle[];
  aiAnalysis: AiAnalysis | null;
  economics: EconomicIndicator[];
  stocks: StockQuote[];
  fetchedAt: number;
  fromCache: boolean;
  stale?: boolean;
  staleAgeMinutes?: number;
  errors: Record<string, string>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
