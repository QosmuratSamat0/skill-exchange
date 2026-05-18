"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/useChat";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { useChatStore } from "@/store/chatStore";
import { Send, User, ChevronLeft, Flag } from "lucide-react";
import { VoiceCallUI } from "@/components/VoiceCallUI";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { Message } from "@/types/index";

export default function ChatPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Chat hook and store data ─────────────────────────────────────────────────
  const {
    status,
    messages,
    isPartnerTyping,
    partnerUserId,
    roomId,
    endReason,
    setAutoSearchOnReturn,
    loadActiveRoom,
    sendMessage,
    sendTyping,
    next,
  } = useChat();

  // ── Partner profile data from store ──────────────────────────────────────────
  const partnerProfile = useChatStore((state) => state.partnerProfile);
  const partnerOnline = useChatStore((state) => state.partnerOnline);

  // ── Fetch and manage partner profile ─────────────────────────────────────────
  usePartnerProfile();

  const { callState, isMuted, toggleMute, endCall, remoteAudioRef } =
    useVoiceCall();
  useEffect(() => {
    if (status === "idle") {
      void loadActiveRoom({ force: true }).then((room) => {
        if (!room) router.push("/");
      });
      return;
    }
    if (status === "ended") {
      if (endReason === "disconnect") setAutoSearchOnReturn(true);
      router.push("/search");
    }
  }, [status, endReason, loadActiveRoom, setAutoSearchOnReturn, router]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      const sent = sendMessage(input.trim());
      if (!sent) return;
      setInput("");
      sendTyping(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    sendTyping(e.target.value.length > 0);
  };

  const handleLeave = () => {
    setAutoSearchOnReturn(false);
    next();
    router.push("/search");
  };

  const handleEndCall = () => {
    endCall();
    setAutoSearchOnReturn(false);
    next();
    router.push("/search");
  };

  const handleReport = async () => {
    if (!roomId) return;
    const reason = window.prompt("Причина жалобы:", "abuse")?.trim() || "abuse";
    if (!partnerUserId) {
      alert("Не удалось отправить жалобу: ID партнёра недоступен.");
      return;
    }
    try {
      await api.reportUser(roomId, partnerUserId, reason);
      alert("Жалоба отправлена.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка отправки жалобы";
      alert(message);
    }
  };

  return (
    <main className="flex flex-col h-screen text-white bg-[#050505] overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#050505]/90 backdrop-blur-md z-20 relative">
        <div className="flex items-center gap-4">
          <button
            onClick={handleLeave}
            className="p-2.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="relative">
            <div className="w-11 h-11 bg-blue-600/10 border border-blue-600/20 rounded-xl flex items-center justify-center">
              <User className="text-blue-500 w-6 h-6" />
            </div>
            {/* ── Online status indicator ── */}
            <div
              className={clsx(
                "absolute -bottom-1 -right-1 w-3 h-3 border-2 border-[#050505] rounded-full transition-colors",
                partnerOnline ? "bg-emerald-500" : "bg-amber-600"
              )}
              title={partnerOnline ? "Online" : "Offline"}
            />
          </div>

          <div className="min-w-0">
            <h2 className="font-semibold text-base leading-tight truncate">
              {partnerProfile?.name || "Партнер по обмену"}
            </h2>
            {/* ── Status indicator text ── */}
            <p
              className={clsx(
                "text-[11px] font-bold uppercase tracking-widest truncate",
                partnerOnline ? "text-emerald-500" : "text-amber-600"
              )}
            >
              {partnerOnline
                ? isPartnerTyping
                  ? "печатает..."
                  : "В сети"
                : "Оффлайн"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleLeave}
            className="sleek-button px-5 py-2 text-sm font-semibold"
          >
            Завершить
          </button>
          <button
            onClick={handleReport}
            className="p-2.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Flag className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Voice call overlay — kept for compatibility */}
        {callState !== "idle" && (
          <div className="absolute inset-0 z-10 bg-[#050505] flex flex-col">
            <VoiceCallUI
              callState={callState}
              isMuted={isMuted}
              toggleMute={toggleMute}
              endCall={handleEndCall}
              remoteAudioRef={remoteAudioRef}
              partnerGender=""
            />
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-5 scroll-smooth"
        >
          {messages.length === 0 && status === "chatting" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-16 h-16 bg-blue-600/10 border border-blue-600/20 rounded-2xl flex items-center justify-center">
                <User className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-zinc-500 text-sm">
                Соединение установлено. Начни общение!
              </p>
            </div>
          )}

          {(messages as Message[]).map((msg, i) => (
            <div
              key={i}
              className={clsx(
                "flex w-full",
                msg.sender === "me" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={clsx(
                  "chat-bubble",
                  msg.sender === "me"
                    ? "chat-bubble-me"
                    : "chat-bubble-partner",
                )}
              >
                <p>{msg.content}</p>
                <span
                  className={clsx(
                    "text-[10px] font-medium uppercase tracking-widest mt-1.5 block opacity-40",
                    msg.sender === "me" ? "text-right" : "text-left",
                  )}
                >
                  {new Date(
                    typeof msg.timestamp === "number" && msg.timestamp < 1e12
                      ? msg.timestamp * 1000
                      : msg.timestamp,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}

          {isPartnerTyping && (
            <div className="flex justify-start">
              <div className="chat-bubble chat-bubble-partner">
                <div className="flex gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="p-5 border-t border-white/5 bg-[#050505]"
        >
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Напишите сообщение..."
              className="sleek-input flex-1"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="sleek-button p-3.5 rounded-xl"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
