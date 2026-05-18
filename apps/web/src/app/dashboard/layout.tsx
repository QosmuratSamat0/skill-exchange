"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Search,
  MessageSquare,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";

const navItems = [
  { href: "/dashboard", label: "Главная", icon: Home },
  { href: "/dashboard/find", label: "Найти навыки", icon: Search },
  { href: "/dashboard/chats", label: "Чаты", icon: MessageSquare },
  { href: "/dashboard/notifications", label: "Уведомления", icon: Bell },
  { href: "/dashboard/settings", label: "Настройки", icon: Settings },
];

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-zinc-900">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userName, setUserName] = useState("Пользователь");
  const [userInitials, setUserInitials] = useState("П");
  const setMe = useChatStore((state) => state.setMe);
  const setUserId = useChatStore((state) => state.setUserId);
  const setMyUserProfile = useChatStore((state) => state.setMyUserProfile);
  const setMyMatchProfile = useChatStore((state) => state.setMyMatchProfile);
  const unreadChatCount = useChatStore((state) => state.unreadChatCount);
  const pendingNotificationsCount = useChatStore(
    (state) => state.pendingNotificationsCount,
  );
  const setUnreadChatCount = useChatStore((state) => state.setUnreadChatCount);
  const setPendingNotificationsCount = useChatStore(
    (state) => state.setPendingNotificationsCount,
  );
  const setIncomingRequests = useChatStore((state) => state.setIncomingRequests);

  const refreshPendingNotifications = useCallback(async () => {
    try {
      const requests = await api.getIncomingRequests();
      const incoming = Array.isArray(requests) ? requests : [];
      setIncomingRequests(incoming);
      setPendingNotificationsCount(
        incoming.filter((request) => request.status === "pending").length,
      );
    } catch {
      // Keep the last known badge value when the network is temporarily down.
    }
  }, [setIncomingRequests, setPendingNotificationsCount]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") {
      router.push("/auth");
      return;
    }
    void Promise.all([
      api
        .getMe()
        .then((me) => {
          setMe(me);
          setUserId(me.id);
        })
        .catch(() => null),
      api
        .getMyUserProfile()
        .then((profile) => {
          setMyUserProfile(profile);
          if (profile?.name) {
            setUserName(profile.name);
            setUserInitials(
              profile.name
                .split(" ")
                .map((w: string) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2),
            );
          }
        })
        .catch(() => null),
      api
        .getMatchProfile()
        .then((profile) => {
          setMyMatchProfile(profile);
        })
        .catch(() => null),
      refreshPendingNotifications(),
    ]);
  }, [
    refreshPendingNotifications,
    router,
    setMe,
    setMyMatchProfile,
    setMyUserProfile,
    setUserId,
  ]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/chats")) {
      setUnreadChatCount(0);
    }
  }, [pathname, setUnreadChatCount]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token || token === "undefined" || token === "null") return;

    const es = new EventSource(api.getNotificationsSSEUrl(token));

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (
          payload.type === "request_received" ||
          payload.type === "request_accepted" ||
          payload.type === "request_declined" ||
          payload.type === "request_cancelled"
        ) {
          void refreshPendingNotifications();
        }
      } catch {
        // Ignore malformed keep-alive or transient payloads.
      }
    };

    es.onerror = () => {
      void refreshPendingNotifications();
    };

    return () => {
      es.close();
    };
  }, [refreshPendingNotifications]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/auth");
  }

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          "flex flex-col bg-zinc-900/80 border-r border-white/5 transition-all duration-300 ease-in-out shrink-0",
          isCollapsed ? "w-[72px]" : "w-64",
        )}
      >
        {/* Top: Logo + Toggle */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-white/5">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white fill-white/20" />
              </div>
              <span className="font-semibold text-sm">Pairexx</span>
            </div>
          )}
          {isCollapsed && (
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
              <Sparkles className="w-3.5 h-3.5 text-white fill-white/20" />
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* When collapsed: expand button */}
        {isCollapsed && (
          <div className="flex justify-center py-2 border-b border-white/5">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(item.href));
            const badgeCount =
              item.href === "/dashboard/chats"
                ? unreadChatCount
                : item.href === "/dashboard/notifications"
                  ? pendingNotificationsCount
                  : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isCollapsed && "justify-center",
                  isActive
                    ? "bg-blue-600/15 text-blue-400 border border-blue-600/20"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5",
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="relative shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                  <NavBadge count={badgeCount} />
                </span>
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Avatar tile */}
        <div className="border-t border-white/5 p-3">
          <Link
            href="/dashboard/edit-profile"
            className={clsx(
              "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group",
              isCollapsed && "justify-center",
            )}
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-400 text-xs font-bold shrink-0">
              {userInitials}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {userName}
                </p>
                <p className="text-xs text-zinc-500">Мой профиль</p>
              </div>
            )}
          </Link>
          <button
            onClick={handleLogout}
            className={clsx(
              "flex items-center gap-3 px-2 py-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full mt-1 text-sm",
              isCollapsed && "justify-center",
            )}
            title={isCollapsed ? "Выйти" : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
