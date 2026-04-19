# World Intelligence Dashboard — Agent Onboarding

> **สำหรับ AI ทุกตัว** (Claude, GPT, Gemini, Codex ฯลฯ) และทุก IDE (VS Code, Cursor, JetBrains ฯลฯ)  
> อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง

---

## สิ่งที่โปรเจกต์นี้คือ

แดชบอร์ดข่าวและข้อมูลเศรษฐกิจโลก **ภาษาไทย** พัฒนาโดยเจ้าของคนเดียว (personal project, MIT license)  
UI แสดงผลเป็นภาษาไทยทั้งหมด — ชื่อฟิลด์ ข้อความ placeholder และ fallback error ล้วนเป็นภาษาไทย

---

## Tech Stack

| Layer | เทคโนโลยี | เวอร์ชัน |
|-------|-----------|---------|
| Framework | Next.js App Router | ^16.2.4 |
| Language | TypeScript | ^5.7.0 |
| Styling | Tailwind CSS | ^3.4 |
| Icons | Lucide React | ^0.468 |
| AI (News Summary + Chat) | Google Gemini 2.0 Flash | `@google/generative-ai ^0.21` |
| Stock/Market Data | yahoo-finance2 | ^2.13.3 |
| News Data | GDELT API v2 → BBC RSS (fallback) | public, no key |
| Economic Data | World Bank API v2 | public, no key |

---

## โครงสร้างไฟล์

```
app/
  layout.tsx              — root layout, Thai locale, dark theme
  page.tsx                — หน้าหลัก dashboard (client component)
  globals.css             — Tailwind base styles
  api/
    dashboard/route.ts    — GET /api/dashboard — รวบรวมข้อมูลจาก 3 แหล่ง + Gemini summary
    chat/route.ts         — POST /api/chat — chatbot ที่อ่าน dashboard cache เป็น context

components/
  ChatInterface.tsx       — UI กล่องแชทกับ AI
  MarketTicker.tsx        — แถบตัวเลขตลาดหุ้น/crypto/forex แบบ scroll
  NewsCard.tsx            — การ์ดข่าวแต่ละชิ้น

lib/
  types.ts                — TypeScript interfaces ทั้งหมด (shared)
  cache.ts                — in-memory cache (TTL 10 นาที + stale 6 ชั่วโมง)

next.config.ts            — serverExternalPackages: ['yahoo-finance2']
.env.local.example        — template ของ env vars
```

---

## Environment Variables

```bash
# คัดลอก .env.local.example → .env.local แล้วใส่ค่า
GEMINI_API_KEY=your_key_here   # จำเป็น — ใช้กับ summary + chat
```

GDELT, World Bank, Yahoo Finance เป็น public API ไม่ต้องมี key

---

## คำสั่งที่ใช้บ่อย

```bash
npm install          # ติดตั้ง dependencies
npm run dev          # dev server → http://localhost:3000
npm run build        # build production
npm run lint         # ESLint check
```

---

## Architecture Decisions ที่สำคัญ

### 1. yahoo-finance2 เป็น server-only
ต้องอยู่ใน `serverExternalPackages` ใน `next.config.ts` เสมอ  
การ import ใน client component จะทำให้ build พัง

### 2. Promise.allSettled ในทุก API call
`/api/dashboard` ใช้ `Promise.allSettled` ให้ partial failure คืนข้อมูลได้  
ถ้า GDELT ล้มเหลว → ตกไปใช้ BBC RSS  
ถ้าทุกแหล่งล้มเหลว → ส่ง stale cache กลับ (6 ชั่วโมง)

### 3. Cache key
- `'dashboard_v1'` — fresh data (10 นาที)
- `'dashboard_v1_stale'` — fallback data (6 ชั่วโมง)

### 4. Chat API อ่าน dashboard cache เป็น context
`/api/chat` เรียก `getCached('dashboard_v1')` แล้วฉีดเป็น system prompt  
Chatbot จึงตอบได้โดยอ้างอิงข้อมูลปัจจุบันของ dashboard

### 5. Gemini model
ใช้ `gemini-2.0-flash` + `apiVersion: 'v1'` เสมอ  
`gemini-1.5-flash` ถูกลบออกจาก v1beta แล้ว — อย่าเปลี่ยนกลับ

### 6. yahoo-finance2 TypeScript casting
```ts
const YF = mod.default as new () => YFModule;
_yfInstance = typeof YF === 'function' ? new YF() : (YF as unknown as YFModule);
```
ใช้ cast นี้เพื่อหลีกเลี่ยง TS overload error — อย่าเปลี่ยนเป็น import ตรง

---

## TypeScript Types หลัก (`lib/types.ts`)

```ts
NewsArticle       — { title, url, domain, seendate, language? }
EconomicIndicator — { name, nameThai, value, year, unit, countryCode, countryName }
StockQuote        — { symbol, name, nameThai, price, change, changePercent, currency, category }
DashboardData     — { news, newsSummary, economics, stocks, fetchedAt, fromCache, errors, stale? }
ChatMessage       — { role: 'user'|'assistant', content }
```

---

## ข้อมูลที่ dashboard แสดง

**ข่าว** — GDELT DOC API v2 (query: economy, geopolitics, war, climate, trade, technology, 24h)  
**เศรษฐกิจ** — World Bank: GDP Growth, Inflation, Unemployment ของ WLD/USA/CHN/EUU/JPN/THA  
**ตลาด** — S&P500, Dow, NASDAQ, Nikkei, Hang Seng, FTSE, Gold, Oil WTI, BTC, ETH, USD/THB, USD Index

---

## สิ่งที่ยังไม่ได้ทำ / roadmap

- [ ] Authentication / user login
- [ ] Persistent chat history (ปัจจุบันหายเมื่อรีเฟรช)
- [ ] Mobile-responsive layout เต็มรูปแบบ
- [ ] Push notification เมื่อข่าวสำคัญเข้ามา
- [ ] รองรับ AI provider อื่น (OpenAI, Anthropic Claude) แบบ pluggable

---

## สำหรับ AI ที่เข้ามาทำงานต่อ

1. **ภาษา UI = ภาษาไทยเสมอ** — ข้อความ error, placeholder, label ต้องเป็นไทย
2. **อย่าแตะ** `serverExternalPackages` ใน `next.config.ts` โดยไม่จำเป็น
3. **อย่าเปลี่ยน** Gemini model string หรือ apiVersion โดยไม่ตรวจสอบก่อน
4. **ใช้ Promise.allSettled** ต่อไปทุกครั้งที่เรียก external API — ไม่ใช้ Promise.all
5. **Types อยู่ใน `lib/types.ts`** — เพิ่ม interface ใหม่ที่นี่ก่อนใช้ใน route หรือ component
6. หากต้องการสลับ AI provider (เช่น เปลี่ยนจาก Gemini → OpenAI/Claude):
   - สร้าง adapter ใน `lib/ai.ts` ที่ export `generateSummary(articles)` และ `chatWithContext(message, history, context)`
   - Route handlers ทั้งสองเรียกผ่าน adapter — ไม่เรียก SDK โดยตรง
   - เพิ่ม env var ที่เกี่ยวข้องใน `.env.local.example`
