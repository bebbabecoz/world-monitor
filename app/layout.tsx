import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Intelligence Dashboard | แดชบอร์ดข่าวสากล',
  description:
    'ติดตามข่าวสำคัญ เศรษฐกิจโลก และตลาดการเงิน พร้อม AI วิเคราะห์ภาษาไทย',
  keywords: ['ข่าวโลก', 'เศรษฐกิจ', 'ตลาดหุ้น', 'AI', 'dashboard'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <body>{children}</body>
    </html>
  );
}
