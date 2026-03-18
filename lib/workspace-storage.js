import { recalculateChallengeEntries } from "./challenge-utils";

export const LEGACY_CHALLENGE_STORAGE_KEY = "daily-profit-challenge:v1";
export const LOCAL_WORKSPACE_STORAGE_KEY = "daily-profit-workspace:v2";

export function createEmptyWorkspaceState() {
  return {
    challenge: {
      config: null,
      currency: "EUR",
      entries: []
    },
    journalEntries: [],
    watchlist: [],
    alertRecords: [],
    preferences: {}
  };
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeChallenge(rawChallenge) {
  const config = rawChallenge?.config ?? null;
  const currency = rawChallenge?.currency === "USD" || rawChallenge?.currency === "BTC" ? rawChallenge.currency : "EUR";
  const entries = Array.isArray(rawChallenge?.entries)
    ? recalculateChallengeEntries(rawChallenge.entries, rawChallenge?.config?.startCapital ?? 0)
    : [];

  return {
    config,
    currency,
    entries
  };
}

function normalizeJournalEntries(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => ({
      id: entry?.id ?? crypto.randomUUID(),
      date: entry?.date ?? "",
      symbol: (entry?.symbol ?? "").toUpperCase(),
      assetClass: entry?.assetClass ?? "Crypto",
      side: entry?.side ?? "Long",
      timeframe: entry?.timeframe ?? "1h",
      setup: entry?.setup ?? "",
      confidence: Number.isFinite(Number(entry?.confidence)) ? Number(entry.confidence) : 3,
      resultAmount: Number.isFinite(Number(entry?.resultAmount)) ? Number(entry.resultAmount) : 0,
      errorCategory: entry?.errorCategory ?? "",
      notes: entry?.notes ?? "",
      chartLink: entry?.chartLink ?? "",
      createdAt: entry?.createdAt ?? new Date().toISOString(),
      updatedAt: entry?.updatedAt ?? new Date().toISOString()
    }))
    .filter((entry) => entry.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function normalizeWatchlist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: item?.id ?? `${item?.symbol ?? "watch"}-${index}`,
      symbol: (item?.symbol ?? "").toUpperCase(),
      tags: Array.isArray(item?.tags) ? item.tags : [],
      pinned: item?.pinned !== false,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
      createdAt: item?.createdAt ?? new Date().toISOString(),
      updatedAt: item?.updatedAt ?? new Date().toISOString()
    }))
    .filter((item) => item.symbol)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.symbol.localeCompare(b.symbol));
}

function normalizeAlertRecords(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: item?.id,
      symbol: item?.symbol ?? "",
      type: item?.type ?? "",
      timeframe: item?.timeframe ?? null,
      bias: item?.bias ?? "BULL",
      status: item?.status ?? "new",
      priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 1,
      firstSeenAt: item?.firstSeenAt ?? new Date().toISOString(),
      lastSeenAt: item?.lastSeenAt ?? new Date().toISOString(),
      acknowledgedAt: item?.acknowledgedAt ?? null,
      dismissedAt: item?.dismissedAt ?? null,
      meta: item?.meta ?? {}
    }))
    .filter((item) => item.id);
}

export function readLocalWorkspaceState() {
  if (typeof window === "undefined") return createEmptyWorkspaceState();

  const workspaceRaw = safeJsonParse(window.localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY), null);
  const legacyRaw = safeJsonParse(window.localStorage.getItem(LEGACY_CHALLENGE_STORAGE_KEY), null);
  const base = createEmptyWorkspaceState();

  if (workspaceRaw) {
    return {
      challenge: normalizeChallenge(workspaceRaw.challenge ?? base.challenge),
      journalEntries: normalizeJournalEntries(workspaceRaw.journalEntries),
      watchlist: normalizeWatchlist(workspaceRaw.watchlist),
      alertRecords: normalizeAlertRecords(workspaceRaw.alertRecords),
      preferences: workspaceRaw.preferences ?? {}
    };
  }

  if (legacyRaw) {
    return {
      ...base,
      challenge: normalizeChallenge(legacyRaw)
    };
  }

  return base;
}

export function readLegacyChallengeState() {
  if (typeof window === "undefined") return null;
  const legacyRaw = safeJsonParse(window.localStorage.getItem(LEGACY_CHALLENGE_STORAGE_KEY), null);
  return legacyRaw ? normalizeChallenge(legacyRaw) : null;
}

export function hasLegacyChallengeData() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(LEGACY_CHALLENGE_STORAGE_KEY));
}

export function writeLocalWorkspaceState(state) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(state));

  if (state?.challenge) {
    window.localStorage.setItem(
      LEGACY_CHALLENGE_STORAGE_KEY,
      JSON.stringify({
        config: state.challenge.config,
        entries: state.challenge.entries,
        currency: state.challenge.currency
      })
    );
  }
}
