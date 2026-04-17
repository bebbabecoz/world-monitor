import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCached } from '@/lib/cache';
import type { ChatMessage, DashboardData } from '@/lib/types';

function buildContext(data: DashboardData | null): string {
  if (!data) return 'ไม่มีข้อมูล Dashboard ณ ขณะนี้';

  const updated = new Date(data.fetchedAt).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
  });

  const newsList = data.news
    .slice(0, 8)
    .map((n) => `• ${n.title} (${n.domain})`)
    .join('\n');

  const econList = data.economics
    .map((e) => `• ${e.countryName} — ${e.nameThai}: ${e.value?.toFixed(2)}% (${e.year})`)
    .join('\n');

  const stockList = data.stocks
    .map((s) => {
      const sign = s.changePercent >= 0 ? '+' : '';
      return `• ${s.nameThai} (${s.symbol}): ${s.price.toLocaleString()} ${s.currency} (${sign}${s.changePercent.toFixed(2)}%)`;
    })
    .join('\n');

  return `=== ข้อมูล Dashboard อัปเดต: ${updated} ===

[ข่าวสำคัญ]
${newsList}

[สรุปข่าว AI]
${data.newsSummary}

[ข้อมูลเศรษฐกิจโลก]
${econList}

[ราคาตลาดการเงิน]
${stockList}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ไม่พบ GEMINI_API_KEY กรุณาตั้งค่าใน .env.local' },
      { status: 500 },
    );
  }

  const body = (await req.json()) as { message: string; history?: ChatMessage[] };
  const { message, history = [] } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'ข้อความว่างเปล่า' }, { status: 400 });
  }

  const dashboardData = getCached<DashboardData>('dashboard_v1');
  const context = buildContext(dashboardData);

  const systemInstruction = `คุณคือผู้ช่วย AI ชื่อ "วิเคราะห์โลก" สำหรับ World Intelligence Dashboard
คุณเชี่ยวชาญด้านข่าวสากล เศรษฐกิจโลก และตลาดการเงิน

${context}

กฎการตอบ:
1. ตอบเป็นภาษาไทยเสมอ
2. อ้างอิงข้อมูล Dashboard เมื่อเกี่ยวข้อง
3. ใช้ภาษาที่เป็นทางการ วิเคราะห์เชิงลึก กระชับ
4. หากถามเรื่องราคาหรือตัวเลข ให้ระบุว่าเป็นข้อมูล ณ เวลาที่บึง และแนะนำให้ตรวจสอบกับแหล่งข้อมูลหลัก
5. ไม่แนะนำให้ซื้อขายหลักทรัพย์โดยตรง`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    { model: 'gemini-2.0-flash', systemInstruction },
    { apiVersion: 'v1' },
  );

  const geminiHistory = history.map((h) => ({
    role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: h.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(message);
  const response = result.response.text();

  return NextResponse.json({ response });
}
