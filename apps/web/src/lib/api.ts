import type {
  AuthTokens,
  User,
  UserProfile,
  UserSession,
  Review,
  MatchProfile,
  ExchangeRequest,
  Room,
  Message,
  UserStatus,
  MatchStats,
  InAppNotification,
} from "@/types/index";

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function normalizeApiBase(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

const API_BASE = normalizeApiBase(
  (process.env as Record<string, string>).NEXT_PUBLIC_API_URL,
);

if (!API_BASE) {
  // Only warn at module load time; don't throw so SSR can still import the module.
  console.error("[api] NEXT_PUBLIC_API_URL is not defined in environment!");
}

// ─── Browser / localStorage guards ───────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getRuntimeApiBase(): string {
  if (!isBrowser() || !API_BASE.startsWith("http")) return API_BASE;

  try {
    const apiUrl = new URL(API_BASE);
    const isLocalApi =
      apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1";
    const isLocalPage =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isLocalApi && isLocalPage && apiUrl.origin !== window.location.origin) {
      return "/api/v1";
    }
  } catch {
    return API_BASE;
  }

  return API_BASE;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  try {
    const t = localStorage.getItem("access_token");
    if (!t || t === "undefined" || t === "null") return null;
    return t;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  try {
    const t = localStorage.getItem("refresh_token");
    if (!t || t === "undefined" || t === "null") return null;
    return t;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: AuthTokens): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);
  } catch {
    // ignore
  }
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  } catch {
    // ignore
  }
}

// ─── Header builder ───────────────────────────────────────────────────────────

/** Paths that must NOT carry an Authorization header */
const PUBLIC_PATHS = new Set([
  "/users/anonymous",
  "/users/register",
  "/users/login",
  "/users/refresh",
]);

function buildHeaders(options: RequestInit, path: string): Headers {
  const headers = new Headers(options.headers);

  const token = getAccessToken();
  if (token && !PUBLIC_PATHS.has(path)) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const body = options.body as unknown;
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  const isArrayBuffer =
    typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer;

  if (
    !headers.has("Content-Type") &&
    body != null &&
    !isFormData &&
    !isBlob &&
    !isArrayBuffer
  ) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

// ─── Response parser ──────────────────────────────────────────────────────────

async function parseResponse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

// ─── Core fetch (no retry logic — used internally for refresh) ────────────────

async function _rawFetch(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  if (!API_BASE)
    throw new Error(
      "[api] API base URL is not configured (NEXT_PUBLIC_API_URL).",
    );

  const headers = buildHeaders(options, path);
  const res = await fetch(`${getRuntimeApiBase()}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const preview = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    throw new Error(
      `API ${res.status} ${res.statusText}${preview ? ` — ${preview}` : ""}`,
    );
  }

  return parseResponse(res);
}

// ─── fetchWithAuth — with automatic token-refresh on 401 ─────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<{
  resolve: () => void;
  reject: (e: unknown) => void;
}> = [];

/** Resolves/rejects all callers that were waiting for a token refresh */
function _drainRefreshQueue(error?: unknown): void {
  for (const waiter of _refreshQueue) {
    if (error) waiter.reject(error);
    else waiter.resolve();
  }
  _refreshQueue = [];
}

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  if (!API_BASE)
    throw new Error(
      "[api] API base URL is not configured (NEXT_PUBLIC_API_URL).",
    );

  const headers = buildHeaders(options, path);
  const res = await fetch(`${getRuntimeApiBase()}${path}`, {
    ...options,
    headers,
  });

  // Happy path
  if (res.ok) return parseResponse(res);

  // Only attempt refresh on 401 from authenticated endpoints
  if (res.status === 401 && !PUBLIC_PATHS.has(path)) {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearTokens();
      throw new Error(`API 401 — session expired`);
    }

    // If another request is already refreshing, queue behind it
    if (_isRefreshing) {
      await new Promise<void>((resolve, reject) => {
        _refreshQueue.push({ resolve, reject });
      });
      // Retry with new token
      return _rawFetch(path, options);
    }

    _isRefreshing = true;
    try {
      const tokens = (await _rawFetch("/users/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      })) as AuthTokens;

      storeTokens(tokens);
      _isRefreshing = false;
      _drainRefreshQueue();

      // Retry original request with new token
      return _rawFetch(path, options);
    } catch (refreshError) {
      _isRefreshing = false;
      clearTokens();
      _drainRefreshQueue(refreshError);
      throw refreshError;
    }
  }

  // Other error statuses
  const body = await res.text().catch(() => "");
  const preview = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  throw new Error(
    `API ${res.status} ${res.statusText}${preview ? ` — ${preview}` : ""}`,
  );
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  // ── Auth ───────────────────────────────────────────────────────────────────

  createAnonymous: (deviceId: string): Promise<AuthTokens> =>
    _rawFetch("/users/anonymous", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId }),
    }) as Promise<AuthTokens>,

  register: (email: string, password: string): Promise<{ message: string }> =>
    _rawFetch("/users/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }) as Promise<{ message: string }>,

  login: (email: string, password: string): Promise<AuthTokens> =>
    _rawFetch("/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }) as Promise<AuthTokens>,

  refresh: (refreshToken: string): Promise<AuthTokens> =>
    _rawFetch("/users/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }) as Promise<AuthTokens>,

  logout: (refreshToken: string): Promise<void> =>
    fetchWithAuth("/users/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }) as Promise<void>,

  logoutAll: (): Promise<void> =>
    fetchWithAuth("/users/logout-all", { method: "POST" }) as Promise<void>,

  // ── User ───────────────────────────────────────────────────────────────────

  getMe: (): Promise<User> => fetchWithAuth("/users/me") as Promise<User>,

  updateMe: (gender: string, interests: string[]): Promise<void> =>
    fetchWithAuth("/users/me", {
      method: "PUT",
      body: JSON.stringify({ gender, interests }),
    }) as Promise<void>,

  // ── User Profile (user-service) ────────────────────────────────────────────

  updateUserProfile: (profile: Partial<UserProfile>): Promise<void> =>
    fetchWithAuth("/users/me/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }) as Promise<void>,

  getMyUserProfile: (): Promise<UserProfile> =>
    fetchWithAuth("/users/me/profile") as Promise<UserProfile>,

  updateEmailPreferences: (
    enabled: boolean,
  ): Promise<{ email_notifications_enabled: boolean }> =>
    fetchWithAuth("/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify({ email_notifications_enabled: enabled }),
    }) as Promise<{ email_notifications_enabled: boolean }>,

  getPublicProfile: (userId: string): Promise<UserProfile> =>
    fetchWithAuth(
      `/users/${encodeURIComponent(userId)}/profile`,
    ) as Promise<UserProfile>,

  changePassword: (oldPassword: string, newPassword: string): Promise<void> =>
    fetchWithAuth("/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    }) as Promise<void>,

  deleteAccount: (password: string, reason?: string): Promise<void> =>
    fetchWithAuth("/users/me", {
      method: "DELETE",
      body: JSON.stringify({ password, reason: reason ?? "" }),
    }) as Promise<void>,

  getSessions: (): Promise<UserSession[]> =>
    fetchWithAuth("/users/me/sessions") as Promise<UserSession[]>,

  // ── Reviews ────────────────────────────────────────────────────────────────

  addReview: (
    toUserId: string,
    rating: number,
    comment: string,
  ): Promise<void> =>
    fetchWithAuth(`/users/${encodeURIComponent(toUserId)}/review`, {
      method: "POST",
      body: JSON.stringify({ rating, comment }),
    }) as Promise<void>,

  getReviews: (userId: string): Promise<Review[]> =>
    fetchWithAuth(`/users/${encodeURIComponent(userId)}/reviews`) as Promise<
      Review[]
    >,

  // ── Match profile ──────────────────────────────────────────────────────────

  updateMatchProfile: (profile: Partial<MatchProfile>): Promise<void> =>
    fetchWithAuth("/match/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }) as Promise<void>,

  getMatchProfile: (): Promise<MatchProfile | null> =>
    fetchWithAuth("/match/profile")
      .then((r) => r as MatchProfile)
      .catch((err: Error) => {
        if (err.message.includes("404")) return null;
        throw err;
      }),

  getMatchProfileById: (userId: string): Promise<MatchProfile> =>
    fetchWithAuth(
      `/match/profile/${encodeURIComponent(userId)}`,
    ) as Promise<MatchProfile>,

  deleteMatchProfile: (): Promise<void> =>
    fetchWithAuth("/match/profile", { method: "DELETE" }) as Promise<void>,

  // ── Candidates ─────────────────────────────────────────────────────────────

  getCandidates: (): Promise<MatchProfile[]> =>
    fetchWithAuth("/match/candidates")
      .then((r) => (r as MatchProfile[]) ?? [])
      .catch((err: Error) => {
        if (err.message.includes("404")) return [];
        throw err;
      }),

  getCandidatesBySkill: (skill: string): Promise<MatchProfile[]> =>
    fetchWithAuth(
      `/match/candidates/skill/${encodeURIComponent(skill)}`,
    ) as Promise<MatchProfile[]>,

  // ── Exchange requests ──────────────────────────────────────────────────────

  sendExchangeRequest: (toUserId: string): Promise<void> =>
    fetchWithAuth("/match/request", {
      method: "POST",
      body: JSON.stringify({ to_user_id: toUserId }),
    }) as Promise<void>,

  getIncomingRequests: (): Promise<ExchangeRequest[]> =>
    fetchWithAuth("/match/requests/incoming") as Promise<ExchangeRequest[]>,

  getSentRequests: (): Promise<ExchangeRequest[]> =>
    fetchWithAuth("/match/requests/sent") as Promise<ExchangeRequest[]>,

  acceptRequest: (reqId: string): Promise<void> =>
    fetchWithAuth(`/match/request/${encodeURIComponent(reqId)}/accept`, {
      method: "POST",
    }) as Promise<void>,

  declineRequest: (reqId: string): Promise<void> =>
    fetchWithAuth(`/match/request/${encodeURIComponent(reqId)}/decline`, {
      method: "POST",
    }) as Promise<void>,

  cancelRequest: (reqId: string): Promise<void> =>
    fetchWithAuth(`/match/request/${encodeURIComponent(reqId)}`, {
      method: "DELETE",
    }) as Promise<void>,

  // ── Rooms ──────────────────────────────────────────────────────────────────

  completeRequest: (reqId: string): Promise<ExchangeRequest> =>
    fetchWithAuth(`/match/requests/${encodeURIComponent(reqId)}/complete`, {
      method: "POST",
    }) as Promise<ExchangeRequest>,

  getMyRoom: (): Promise<Room | null> =>
    fetchWithAuth("/match/room").then((r) => (r as Room) ?? null),

  getAllRooms: (): Promise<Room[]> =>
    fetchWithAuth("/match/rooms") as Promise<Room[]>,

  getRoomMessages: (roomId: string): Promise<Message[]> =>
    fetchWithAuth(
      `/chat/rooms/${encodeURIComponent(roomId)}/messages`,
    ) as Promise<Message[]>,

  // ── Status & Stats ─────────────────────────────────────────────────────────

  setOnlineStatus: (online: boolean): Promise<void> =>
    fetchWithAuth("/match/status", {
      method: "PUT",
      body: JSON.stringify({ online }),
    }) as Promise<void>,

  getUserStatus: (userId: string): Promise<UserStatus> =>
    fetchWithAuth(
      `/match/status/${encodeURIComponent(userId)}`,
    ) as Promise<UserStatus>,

  getMyStats: (): Promise<MatchStats> =>
    fetchWithAuth("/match/stats") as Promise<MatchStats>,

  // ── SSE ────────────────────────────────────────────────────────────────────

  /**
   * Returns the full SSE URL for the notifications stream.
   * EventSource doesn't support custom headers, so we pass the token as a
   * query parameter and the gateway/service reads it from there.
   */
  getNotificationsSSEUrl: (token: string): string =>
    `${getRuntimeApiBase()}/match/notifications?token=${encodeURIComponent(token)}`,

  getInAppNotifications: (): Promise<InAppNotification[]> =>
    fetchWithAuth("/notifications") as Promise<InAppNotification[]>,

  // ── Reporting ──────────────────────────────────────────────────────────────

  reportUser: (
    roomId: string,
    reportedUserId: string,
    reason: string,
  ): Promise<void> =>
    fetchWithAuth("/report/report", {
      method: "POST",
      body: JSON.stringify({
        room_id: roomId,
        reported_user_id: reportedUserId,
        reason,
      }),
    }) as Promise<void>,
};
