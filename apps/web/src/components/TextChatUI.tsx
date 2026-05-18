'use client';

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { clsx } from 'clsx';
import { Message } from '@/types/chat';

interface TextChatUIProps {
  messages: Message[];
  isPartnerTyping: boolean;
  onSendMessage: (content: string) => void;
  onTyping: (isTyping: boolean) => void;
}

export function TextChatUI({ 
  messages, 
  isPartnerTyping, 
  onSendMessage,
  onTyping 
}: TextChatUIProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
    onTyping(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    onTyping(e.target.value.length > 0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Say hello!</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx(
              'flex w-full',
              msg.sender === 'me' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={clsx(
                'max-w-[80%] px-4 py-2.5 shadow-sm',
                msg.sender === 'me'
                  ? 'bg-blue-500 text-white rounded-2xl rounded-tr-none'
                  : 'bg-white dark:bg-[#1c1c1c] text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-800'
              )}
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
              <span className="text-[10px] opacity-70 block mt-1 text-right">
                {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {isPartnerTyping && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-[#1c1c1c] px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="p-4 bg-white dark:bg-[#1c1c1c] border-t border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-gray-100 dark:bg-[#2c2c2c] border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}