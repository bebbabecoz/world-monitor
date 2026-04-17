'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, ChevronDown } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'สวัสดีครับ! ผมคือ "วิเคราะห์โลก" ผู้ช่วย AI ของ World Intelligence Dashboard\n\nคุณสามารถถามผมเกี่ยวกับข่าวสำคัญ สถานการณ์เศรษฐกิจโลก หรือราคาตลาดการเงินที่แสดงอยู่ได้เลยครับ 🌐',
};

export default function ChatInterface() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.filter((m) => m.role !== 'assistant' || m !== WELCOME),
        }),
      });

      const data = (await res.json()) as { response?: string; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        setMessages(updatedHistory);
        return;
      }

      setMessages([...updatedHistory, { role: 'assistant', content: data.response! }]);
    } catch {
      setError('ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      setMessages(updatedHistory);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const QUICK_QUESTIONS = [
    'ข่าวสำคัญที่สุดวันนี้คืออะไร?',
    'สถานการณ์เศรษฐกิจโลกตอนนี้เป็นอย่างไร?',
    'ราคาทองคำและน้ำมันเป็นอย่างไรบ้าง?',
  ];

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl
                   bg-brand shadow-lg shadow-brand/30 text-white font-medium text-sm
                   hover:bg-brand-dark active:scale-95 transition-all duration-200"
        aria-label={isOpen ? 'ปิดหน้าต่างแชท' : 'เปิดหน้าต่างแชท'}
      >
        {isOpen ? <ChevronDown size={18} /> : <MessageCircle size={18} />}
        {isOpen ? 'ปิด' : 'ถาม AI'}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-40 w-[360px] max-w-[calc(100vw-1.5rem)]
                     flex flex-col bg-surface-card border border-surface-border
                     rounded-2xl shadow-2xl shadow-black/40 animate-slide-up"
          style={{ height: '520px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center">
                <Bot size={16} className="text-brand-light" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">วิเคราะห์โลก AI</p>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  ออนไลน์ · รู้บริบท Dashboard
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="btn-icon"
              aria-label="ปิด"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5
                    ${msg.role === 'user' ? 'bg-brand/30' : 'bg-slate-700'}`}
                >
                  {msg.role === 'user' ? (
                    <User size={12} className="text-brand-light" />
                  ) : (
                    <Bot size={12} className="text-slate-300" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                    ${
                      msg.role === 'user'
                        ? 'bg-brand text-white rounded-tr-sm'
                        : 'bg-surface-elevated text-slate-200 rounded-tl-sm'
                    }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-slate-300" />
                </div>
                <div className="bg-surface-elevated px-3 py-2 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin text-brand-light" />
                  <span className="text-xs text-slate-400">กำลังวิเคราะห์...</span>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Quick questions (shown only at start) */}
            {messages.length === 1 && !loading && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-slate-500 text-center">คำถามยอดนิยม</p>
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl
                               border border-surface-border bg-surface-elevated
                               text-slate-300 hover:border-brand/50 hover:text-brand-light
                               transition-colors duration-150"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-surface-border">
            <div className="flex items-end gap-2 bg-surface-elevated rounded-xl px-3 py-2 border border-surface-border focus-within:border-brand/50 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ถามเกี่ยวกับข่าว เศรษฐกิจ หรือตลาด..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none resize-none max-h-24 leading-relaxed"
                style={{ minHeight: '24px' }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand hover:bg-brand-dark
                           disabled:opacity-30 disabled:cursor-not-allowed
                           flex items-center justify-center transition-all duration-150
                           active:scale-95"
                aria-label="ส่ง"
              >
                <Send size={13} className="text-white" />
              </button>
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-1.5">
              Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่
            </p>
          </div>
        </div>
      )}
    </>
  );
}
