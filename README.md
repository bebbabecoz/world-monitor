# 🌐 World Intelligence Dashboard

> แดชบอร์ดข่าวสากล เศรษฐกิจ และตลาดการเงินโลก พร้อม AI วิเคราะห์ภาษาไทย

**Personal Project — MIT License**

## ภาพรวม

World Intelligence Dashboard รวบรวมข้อมูลจากหลายแหล่งแบบ Real-time พร้อมสรุปและวิเคราะห์ด้วย AI เป็นภาษาไทย ประกอบด้วย:

| คอลัมน์ | เนื้อหา |
|---------|---------|
| สรุปข่าว | ข่าวสำคัญจาก GDELT + AI Summary |
| เศรษฐกิจโลก | GDP, เงินเฟ้อ, การว่างงาน จาก World Bank |
| ตลาดหุ้น | ดัชนี, สินค้าโภคภัณฑ์, คริปโต, Forex |

พร้อม **Chatbot** ที่รู้บริบทข้อมูลปัจจุบันบน Dashboard

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS (Dark Mode)
- **Icons**: Lucide React
- **AI**: Google Gemini 1.5 Flash (`@google/generative-ai`)
- **Data Sources**:
  - [GDELT Project](https://www.gdeltproject.org/) — ข่าวสากล
  - [World Bank API](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589) — ข้อมูลเศรษฐกิจ
  - [Yahoo Finance](https://finance.yahoo.com/) via `yahoo-finance2` — ราคาตลาด

## การติดตั้ง

```bash
# 1. Clone หรือดาวน์โหลด project
cd world-monitor

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment variables
cp .env.local.example .env.local
# แก้ไข .env.local และใส่ GEMINI_API_KEY

# 4. รัน development server
npm run dev
```

เปิดเบราว์เซอร์ที่ [http://localhost:3000](http://localhost:3000)

## Environment Variables

| ตัวแปร | ค่า | หมายเหตุ |
|--------|-----|----------|
| `GEMINI_API_KEY` | API Key จาก Google AI Studio | ใช้สำหรับสรุปข่าวและ Chatbot |

รับ API Key ฟรีได้ที่: <https://aistudio.google.com/app/apikey>

## สถาปัตยกรรม

```
app/
├── api/
│   ├── dashboard/route.ts   # Aggregated API + In-memory cache (10 นาที)
│   └── chat/route.ts        # Chatbot endpoint + context injection
└── page.tsx                 # 3-Column Dark Dashboard

components/
├── NewsCard.tsx             # การ์ดข่าว
├── MarketTicker.tsx         # ตัวเลขตลาด
└── ChatInterface.tsx        # หน้าต่าง Chat ลอยตัว

lib/
├── cache.ts                 # Server-side in-memory cache
└── types.ts                 # TypeScript types
```

## การ Cache ข้อมูล

API responses ถูก cache ไว้ใน Server memory เป็นเวลา **10 นาที** เพื่อ:
- ลดการเรียก GDELT, World Bank, Yahoo Finance
- ประหยัด Gemini API quota
- เพิ่มความเร็วในการโหลด

## License

MIT License — ใช้ได้อย่างอิสระสำหรับโปรเจกต์ส่วนตัวและเชิงพาณิชย์

---

> ⚠️ **หมายเหตุ**: โปรเจกต์นี้เป็น Personal Project เพื่อการศึกษา ข้อมูลที่แสดงมาจาก API สาธารณะและไม่ควรนำไปใช้เพื่อการตัดสินใจทางการเงิน
