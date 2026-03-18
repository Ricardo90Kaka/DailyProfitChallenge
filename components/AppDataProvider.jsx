"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  reconcileAlertRecords,
  acknowledgeAlertRecord,
  dismissAlertRecord,
  activeAlertCount
} from "../lib/alert-records";
import { recalculateChallengeEntries } from "../lib/challenge-utils";
import {
  createEmptyWorkspaceState,
  readLocalWorkspaceState,
  writeLocalWorkspaceState
} from "../lib/workspace-storage";

const AppDataContext = createContext(null);

const DEFAULT_WORKSPACE_STATUS = {
  selectedSymbol: "BTC",
  activeAlertCount: 0,
  lastMarketUpdate: null,
  challengeEquity: 0
};

export function AppDataProvider({ children }) {
  const [workspace, setWorkspace] = useState(createEmptyWorkspaceState());
  const [workspaceStatus, setWorkspaceStatus] = useState(DEFAULT_WORKSPACE_STATUS);
  const workspaceRef = useRef(workspace);

  useEffect(() => {
    const localState = readLocalWorkspaceState();
    setWorkspace(localState);
    workspaceRef.current = localState;
  }, []);

  useEffect(() => {
    workspaceRef.current = workspace;
    writeLocalWorkspaceState(workspace);
  }, [workspace]);

  const commitWorkspace = useCallback((updater) => {
    setWorkspace((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const saveChallenge = useCallback(
    async (nextChallenge) => {
      commitWorkspace((prev) => ({
        ...prev,
        challenge: nextChallenge
      }));
    },
    [commitWorkspace]
  );

  const saveChallengeSetup = useCallback(
    async (config, currency, resetEntries = false) => {
      const nextEntries = resetEntries
        ? []
        : recalculateChallengeEntries(
            workspaceRef.current.challenge.entries,
            config?.startCapital ?? 0
          );

      const nextChallenge = {
        config,
        currency: currency ?? workspaceRef.current.challenge.currency ?? "EUR",
        entries: nextEntries
      };

      await saveChallenge(nextChallenge);
    },
    [saveChallenge]
  );

  const replaceChallengeEntries = useCallback(
    async (entries) => {
      const currentChallenge = workspaceRef.current.challenge;
      const recalculated = recalculateChallengeEntries(
        entries,
        currentChallenge.config?.startCapital ?? 0
      );

      await saveChallenge({
        ...currentChallenge,
        entries: recalculated
      });
    },
    [saveChallenge]
  );

  const updateChallengeCurrency = useCallback(
    async (currency) => {
      await saveChallenge({
        ...workspaceRef.current.challenge,
        currency
      });
    },
    [saveChallenge]
  );

  const resetChallenge = useCallback(async () => {
    await saveChallenge({
      config: null,
      currency: workspaceRef.current.challenge.currency ?? "EUR",
      entries: []
    });
  }, [saveChallenge]);

  const upsertJournalEntry = useCallback(
    async (entry) => {
      const normalized = {
        id: entry.id ?? crypto.randomUUID(),
        date: entry.date,
        symbol: (entry.symbol ?? "").toUpperCase(),
        assetClass: entry.assetClass ?? "Crypto",
        side: entry.side ?? "Long",
        timeframe: entry.timeframe ?? "1h",
        setup: entry.setup ?? "",
        confidence: Number(entry.confidence ?? 3),
        resultAmount: Number(entry.resultAmount ?? 0),
        errorCategory: entry.errorCategory ?? "",
        notes: entry.notes ?? "",
        chartLink: entry.chartLink ?? "",
        createdAt: entry.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      commitWorkspace((prev) => ({
        ...prev,
        journalEntries: [normalized, ...prev.journalEntries.filter((item) => item.id !== normalized.id)].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        )
      }));

      return normalized;
    },
    [commitWorkspace]
  );

  const deleteJournalEntry = useCallback(
    async (id) => {
      commitWorkspace((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.filter((entry) => entry.id !== id)
      }));
    },
    [commitWorkspace]
  );

  const toggleWatchlistSymbol = useCallback(
    async (symbol) => {
      const normalized = (symbol ?? "").toUpperCase();
      if (!normalized) return;

      commitWorkspace((prev) => {
        const exists = prev.watchlist.some((item) => item.symbol === normalized);
        const nextWatchlist = exists
          ? prev.watchlist.filter((item) => item.symbol !== normalized)
          : [
              ...prev.watchlist,
              {
                id: crypto.randomUUID(),
                symbol: normalized,
                tags: [],
                pinned: true,
                sortOrder: prev.watchlist.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ];

        return {
          ...prev,
          watchlist: nextWatchlist
        };
      });
    },
    [commitWorkspace]
  );

  const syncAlertSnapshot = useCallback(
    async (liveAlerts) => {
      commitWorkspace((prev) => ({
        ...prev,
        alertRecords: reconcileAlertRecords(prev.alertRecords, liveAlerts)
      }));
    },
    [commitWorkspace]
  );

  const acknowledgeAlert = useCallback(
    async (id) => {
      commitWorkspace((prev) => ({
        ...prev,
        alertRecords: acknowledgeAlertRecord(prev.alertRecords, id)
      }));
    },
    [commitWorkspace]
  );

  const dismissAlert = useCallback(
    async (id) => {
      commitWorkspace((prev) => ({
        ...prev,
        alertRecords: dismissAlertRecord(prev.alertRecords, id)
      }));
    },
    [commitWorkspace]
  );

  const savePreferences = useCallback(
    async (updater) => {
      commitWorkspace((prev) => ({
        ...prev,
        preferences:
          typeof updater === "function"
            ? updater(prev.preferences ?? {})
            : {
                ...(prev.preferences ?? {}),
                ...(updater ?? {})
              }
      }));
    },
    [commitWorkspace]
  );

  const updateWorkspaceStatus = useCallback((updater) => {
    setWorkspaceStatus((prev) =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater }
    );
  }, []);

  const currentActiveAlertCount = activeAlertCount(workspace.alertRecords);

  const value = useMemo(
    () => ({
      workspace,
      challenge: workspace.challenge,
      journalEntries: workspace.journalEntries,
      watchlist: workspace.watchlist,
      alertRecords: workspace.alertRecords,
      preferences: workspace.preferences,
      workspaceStatus,
      activeAlertCount: currentActiveAlertCount,
      saveChallenge,
      saveChallengeSetup,
      replaceChallengeEntries,
      updateChallengeCurrency,
      resetChallenge,
      upsertJournalEntry,
      deleteJournalEntry,
      toggleWatchlistSymbol,
      syncAlertSnapshot,
      acknowledgeAlert,
      dismissAlert,
      savePreferences,
      updateWorkspaceStatus
    }),
    [
      acknowledgeAlert,
      currentActiveAlertCount,
      deleteJournalEntry,
      dismissAlert,
      replaceChallengeEntries,
      resetChallenge,
      saveChallenge,
      saveChallengeSetup,
      savePreferences,
      syncAlertSnapshot,
      toggleWatchlistSymbol,
      updateChallengeCurrency,
      updateWorkspaceStatus,
      upsertJournalEntry,
      workspace,
      workspaceStatus
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return context;
}
