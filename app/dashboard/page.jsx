"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Clock3,
  LayoutDashboard,
  Layers3,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import TradingViewPanel from "../../components/dashboard/TradingViewPanel";
import PerpScannerTable from "../../components/dashboard/PerpScannerTable";
import AlertsPanel from "../../components/dashboard/AlertsPanel";
import WatchlistPanel from "../../components/dashboard/WatchlistPanel";
import { useTheme } from "../../components/ThemeProvider";
import { useAppData } from "../../components/AppDataProvider";
import {
  fetchUsdcPerpRows,
  fetchCandleSeries,
  computeRsi,
  detectInsideBarBreak,
  detectStairStepBreak,
  isSuperstack4h,
  isSuperstack1h
} from "../../lib/hyperliquid";

const DASHBOARD_UI_STORAGE_KEY = "daily-profit-dashboard-ui:v3";

const MIN_SCANNER_VOLUME = 500_000;
const RSI_SCAN_LIMIT = 50;
const RSI_CONCURRENCY = 4;
const ABNORMAL_VOLUME_MULTIPLIER = 2.5;
const VOLUME_MA_PERIOD = 20;
const BULL_RSI_THRESHOLD = 30;
const BEAR_RSI_THRESHOLD = 70;
const ANALYSIS_INTERVALS = ["1d", "4h", "1h", "15m", "5m"];
const INSIDE_BAR_INTERVALS = ["1d", "4h", "1h", "15m"];
const STAIR_STEP_INTERVALS = ["1d", "4h", "1h", "5m"];
const ALERT_TYPE_OPTIONS = [
  "ABNORMAL_VOLUME",
  "INSIDE_BAR_BREAK",
  "STAIR_STEP_BREAK",
  "SUPERSTACK_4H",
  "SUPERSTACK_1H"
];
const ALERT_TIMEFRAME_OPTIONS = ["1d", "4h", "1h", "15m", "5m"];
const DASHBOARD_DEFAULTS = {
  selectedRawSymbol: "BTC",
  scannerQuoteMode: "USD",
  assetFilter: "ALL",
  volumeFloor: MIN_SCANNER_VOLUME,
  onlyWatchlist: false,
  onlyActiveAlerts: false,
  alertStatus: "ALL",
  alertSort: "priority",
  chartInterval: "60"
};
const LOCAL_FILTER_DEFAULTS = {
  query: "",
  marketBias: "BULL",
  selectedAlertTypes: ALERT_TYPE_OPTIONS,
  selectedTimeframes: ALERT_TIMEFRAME_OPTIONS
};
const TIMEFRAME_ORDER = {
  "1d": 4,
  "4h": 3,
  "1h": 2,
  "15m": 1,
  "5m": 0
};

async function proxyFetchImpl(_url, init) {
  return fetch("/api/hyperliquid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: init?.body,
    cache: "no-store",
    signal: init?.signal
  });
}

function errorMessage(error) {
  return error?.message ?? "Onbekende fout";
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function normalizeSelection(input, allowedValues) {
  if (!Array.isArray(input)) return [...allowedValues];
  const allowedSet = new Set(allowedValues);
  return input.filter((value) => allowedSet.has(value));
}

function matchesAlertStatus(record, alertStatus) {
  if (alertStatus === "NEW") return record.status === "new";
  if (alertStatus === "ACTIVE") return ["active", "cooling"].includes(record.status);
  if (alertStatus === "ACK") return record.status === "acknowledged";
  return ["new", "active", "acknowledged", "cooling"].includes(record.status);
}

function sortAlerts(records, alertSort) {
  const next = [...records];

  next.sort((left, right) => {
    if (alertSort === "symbol") {
      const symbolCompare = left.symbol.localeCompare(right.symbol);
      if (symbolCompare !== 0) return symbolCompare;
      return new Date(right.lastSeenAt) - new Date(left.lastSeenAt);
    }

    if (alertSort === "timeframe") {
      const timeframeCompare = (TIMEFRAME_ORDER[right.timeframe] ?? -1) - (TIMEFRAME_ORDER[left.timeframe] ?? -1);
      if (timeframeCompare !== 0) return timeframeCompare;
      return new Date(right.lastSeenAt) - new Date(left.lastSeenAt);
    }

    if (alertSort === "priority") {
      const priorityCompare = Number(right.priority ?? 0) - Number(left.priority ?? 0);
      if (priorityCompare !== 0) return priorityCompare;
      return new Date(right.lastSeenAt) - new Date(left.lastSeenAt);
    }

    return new Date(right.lastSeenAt) - new Date(left.lastSeenAt);
  });

  return next;
}

function computeVolumeSignal(series) {
  if (!Array.isArray(series) || series.length < VOLUME_MA_PERIOD + 1) {
    return null;
  }

  const normalized = series
    .map((point) => ({
      open: Number(point?.open),
      close: Number(point?.close),
      volume: Number(point?.volume)
    }))
    .filter((point) => Number.isFinite(point.volume));

  if (normalized.length < VOLUME_MA_PERIOD + 1) return null;

  const slice = normalized.slice(-(VOLUME_MA_PERIOD + 1));
  const latestCandle = slice[slice.length - 1];
  const currentVolume = latestCandle.volume;
  const baseline = slice.slice(0, -1).map((point) => point.volume);
  const ma20Volume = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;

  if (!Number.isFinite(currentVolume) || !Number.isFinite(ma20Volume) || ma20Volume <= 0) {
    return null;
  }

  let candleDirection = "DOJI";
  if (Number.isFinite(latestCandle.open) && Number.isFinite(latestCandle.close)) {
    if (latestCandle.close > latestCandle.open) candleDirection = "BULL";
    if (latestCandle.close < latestCandle.open) candleDirection = "BEAR";
  }

  return {
    currentVolume,
    ma20Volume,
    ratio: currentVolume / ma20Volume,
    candleDirection
  };
}

function isOverbought4h(snapshot, threshold = BEAR_RSI_THRESHOLD) {
  if (!snapshot) return false;
  const { rsi4h, rsi1h, rsi15m, rsi5m } = snapshot;
  return [rsi4h, rsi1h, rsi15m, rsi5m].every((value) => typeof value === "number" && value > threshold);
}

function isOverbought1h(snapshot, threshold = BEAR_RSI_THRESHOLD) {
  if (!snapshot) return false;
  const { rsi1h, rsi15m, rsi5m } = snapshot;
  return [rsi1h, rsi15m, rsi5m].every((value) => typeof value === "number" && value > threshold);
}

function toCloseSeries(series) {
  if (!Array.isArray(series)) return [];

  return series
    .map((point) => Number(point?.close))
    .filter((value) => Number.isFinite(value));
}

function buildRsiSnapshot(seriesByInterval) {
  return {
    rsi4h: computeRsi(toCloseSeries(seriesByInterval["4h"]), 14),
    rsi1h: computeRsi(toCloseSeries(seriesByInterval["1h"]), 14),
    rsi15m: computeRsi(toCloseSeries(seriesByInterval["15m"]), 14),
    rsi5m: computeRsi(toCloseSeries(seriesByInterval["5m"]), 14)
  };
}

function MarketSummaryCard({ title, value, detail, tone = "default", icon: Icon }) {
  return (
    <article className={`card stat-card market-summary-card tone-${tone}`}>
      <div>
        <p>{title}</p>
        <h4>{value}</h4>
        {detail ? <small>{detail}</small> : null}
      </div>
      <Icon size={18} />
    </article>
  );
}

export default function DashboardPage() {
  const { theme } = useTheme();
  const {
    alertRecords,
    watchlist,
    preferences,
    activeAlertCount,
    workspaceStatus,
    toggleWatchlistSymbol,
    syncAlertSnapshot,
    acknowledgeAlert,
    dismissAlert,
    updateWorkspaceStatus,
    savePreferences
  } = useAppData();

  const [rows, setRows] = useState([]);
  const [selectedRawSymbol, setSelectedRawSymbol] = useState(DASHBOARD_DEFAULTS.selectedRawSymbol);
  const [scannerQuoteMode, setScannerQuoteMode] = useState(DASHBOARD_DEFAULTS.scannerQuoteMode);
  const [assetFilter, setAssetFilter] = useState(DASHBOARD_DEFAULTS.assetFilter);
  const [volumeFloor, setVolumeFloor] = useState(DASHBOARD_DEFAULTS.volumeFloor);
  const [onlyWatchlist, setOnlyWatchlist] = useState(DASHBOARD_DEFAULTS.onlyWatchlist);
  const [onlyActiveAlerts, setOnlyActiveAlerts] = useState(DASHBOARD_DEFAULTS.onlyActiveAlerts);
  const [alertStatus, setAlertStatus] = useState(DASHBOARD_DEFAULTS.alertStatus);
  const [alertSort, setAlertSort] = useState(DASHBOARD_DEFAULTS.alertSort);
  const [chartInterval, setChartInterval] = useState(DASHBOARD_DEFAULTS.chartInterval);
  const [query, setQuery] = useState(LOCAL_FILTER_DEFAULTS.query);
  const [marketBias, setMarketBias] = useState(LOCAL_FILTER_DEFAULTS.marketBias);
  const [selectedAlertTypes, setSelectedAlertTypes] = useState(LOCAL_FILTER_DEFAULTS.selectedAlertTypes);
  const [selectedTimeframes, setSelectedTimeframes] = useState(LOCAL_FILTER_DEFAULTS.selectedTimeframes);
  const [rsiMap, setRsiMap] = useState({});
  const [insideBarMap, setInsideBarMap] = useState({});
  const [stairStepMap, setStairStepMap] = useState({});
  const [volumeSignalMap, setVolumeSignalMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [scannerWarning, setScannerWarning] = useState("");
  const [rsiWarning, setRsiWarning] = useState("");
  const [lastScannerUpdated, setLastScannerUpdated] = useState(null);
  const [lastRsiUpdated, setLastRsiUpdated] = useState(null);

  const rowsRef = useRef(rows);
  const selectedSymbolRef = useRef(selectedRawSymbol);
  const scannerInFlightRef = useRef(false);
  const rsiInFlightRef = useRef(false);
  const uiHydratedRef = useRef(false);
  const prefsPersistReadyRef = useRef(false);
  const scannerSymbolSignature = useMemo(() => rows.map((row) => row.symbol).join("|"), [rows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    selectedSymbolRef.current = selectedRawSymbol;
  }, [selectedRawSymbol]);

  useEffect(() => {
    const nextPrefs = preferences ?? {};
    if (!nextPrefs || typeof nextPrefs !== "object") return;

    if (nextPrefs.selectedRawSymbol) setSelectedRawSymbol(nextPrefs.selectedRawSymbol);
    if (nextPrefs.scannerQuoteMode === "USD" || nextPrefs.scannerQuoteMode === "BTC") {
      setScannerQuoteMode(nextPrefs.scannerQuoteMode);
    }
    if (typeof nextPrefs.assetFilter === "string") setAssetFilter(nextPrefs.assetFilter);
    if (Number.isFinite(Number(nextPrefs.volumeFloor))) setVolumeFloor(Number(nextPrefs.volumeFloor));
    if (typeof nextPrefs.onlyWatchlist === "boolean") setOnlyWatchlist(nextPrefs.onlyWatchlist);
    if (typeof nextPrefs.onlyActiveAlerts === "boolean") setOnlyActiveAlerts(nextPrefs.onlyActiveAlerts);
    if (typeof nextPrefs.alertStatus === "string") setAlertStatus(nextPrefs.alertStatus);
    if (typeof nextPrefs.alertSort === "string") setAlertSort(nextPrefs.alertSort);
    if (typeof nextPrefs.chartInterval === "string") setChartInterval(nextPrefs.chartInterval);
  }, [preferences]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_UI_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.query === "string") setQuery(parsed.query);
        if (parsed?.marketBias === "BULL" || parsed?.marketBias === "BEAR") {
          setMarketBias(parsed.marketBias);
        }
        setSelectedAlertTypes(normalizeSelection(parsed?.selectedAlertTypes, ALERT_TYPE_OPTIONS));
        setSelectedTimeframes(normalizeSelection(parsed?.selectedTimeframes, ALERT_TIMEFRAME_OPTIONS));
      }
    } catch {
      // Ignore local storage issues.
    } finally {
      uiHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!uiHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        DASHBOARD_UI_STORAGE_KEY,
        JSON.stringify({
          query,
          marketBias,
          selectedAlertTypes,
          selectedTimeframes
        })
      );
    } catch {
      // Ignore local storage write failures.
    }
  }, [query, marketBias, selectedAlertTypes, selectedTimeframes]);

  useEffect(() => {
    if (!prefsPersistReadyRef.current) {
      prefsPersistReadyRef.current = true;
      return;
    }
    savePreferences({
      selectedRawSymbol,
      scannerQuoteMode,
      assetFilter,
      volumeFloor,
      onlyWatchlist,
      onlyActiveAlerts,
      alertStatus,
      alertSort,
      chartInterval
    });
  }, [
    alertSort,
    alertStatus,
    assetFilter,
    chartInterval,
    onlyActiveAlerts,
    onlyWatchlist,
    savePreferences,
    scannerQuoteMode,
    selectedRawSymbol,
    volumeFloor
  ]);

  useEffect(() => {
    if (scannerQuoteMode !== "BTC") return;
    if (!selectedRawSymbol?.includes(":")) return;

    const fallback =
      rows.find((row) => row.symbol === "BTC" && row.isExternalDex !== true) ??
      rows.find((row) => row.isExternalDex !== true);

    if (fallback?.symbol) {
      setSelectedRawSymbol(fallback.symbol);
    }
  }, [rows, scannerQuoteMode, selectedRawSymbol]);

  const refreshScanner = useCallback(async () => {
    if (scannerInFlightRef.current) return;
    scannerInFlightRef.current = true;
    setLoading((prev) => prev || rowsRef.current.length === 0);

    try {
      const data = await fetchUsdcPerpRows(proxyFetchImpl, {
        timeoutMs: 8_000,
        maxRetries: 2
      });

      data.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
      const filtered = data.filter((row) => (row.volume24hUsd ?? 0) >= MIN_SCANNER_VOLUME);

      setRows(filtered);
      setScannerWarning("");
      const nowIso = new Date().toISOString();
      setLastScannerUpdated(nowIso);
      updateWorkspaceStatus((prev) => ({
        ...prev,
        lastMarketUpdate: nowIso
      }));

      if (!filtered.find((item) => item.symbol === selectedSymbolRef.current) && filtered.length > 0) {
        setSelectedRawSymbol(filtered[0].symbol);
      }
    } catch (error) {
      if ((error?.status === 503 || error?.status === 502 || error?.status === 504) && rowsRef.current.length > 0) {
        setScannerWarning("Tijdelijk geen verse scannerdata, laatste snapshot wordt getoond.");
      } else {
        setScannerWarning(errorMessage(error));
      }
    } finally {
      scannerInFlightRef.current = false;
      setLoading(false);
    }
  }, [updateWorkspaceStatus]);

  const refreshRsiAndVolumeSignals = useCallback(async () => {
    if (rsiInFlightRef.current) return;
    const sourceRows = rowsRef.current;
    if (!sourceRows || sourceRows.length === 0) return;

    rsiInFlightRef.current = true;

    try {
      const rsiSymbols = sourceRows.slice(0, RSI_SCAN_LIMIT).map((row) => row.symbol);
      const rsiSymbolSet = new Set(rsiSymbols);
      const symbols = sourceRows.map((row) => row.symbol);
      const nextRsi = {};
      const nextInsideBars = {};
      const nextStairSteps = {};
      const nextVolumeSignals = {};
      let cursor = 0;
      const candleFetchOptions = {
        fetchImpl: proxyFetchImpl,
        timeoutMs: 8_000,
        maxRetries: 1,
        ttlMs: 60_000
      };

      const workers = Array.from(
        { length: Math.min(RSI_CONCURRENCY, symbols.length) },
        async () => {
          while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= symbols.length) break;

            const symbol = symbols[index];
            try {
              let fifteenMinuteSeries = null;

              if (rsiSymbolSet.has(symbol)) {
                const intervalResults = await Promise.all(
                  ANALYSIS_INTERVALS.map(async (interval) => [
                    interval,
                    await fetchCandleSeries(symbol, interval, 120, candleFetchOptions)
                  ])
                );

                const seriesByInterval = Object.fromEntries(intervalResults);
                nextRsi[symbol] = buildRsiSnapshot(seriesByInterval);
                nextInsideBars[symbol] = INSIDE_BAR_INTERVALS
                  .map((interval) => detectInsideBarBreak(seriesByInterval[interval], { timeframe: interval }))
                  .filter(Boolean);
                nextStairSteps[symbol] = STAIR_STEP_INTERVALS
                  .map((interval) => detectStairStepBreak(seriesByInterval[interval], { timeframe: interval }))
                  .filter(Boolean);

                fifteenMinuteSeries = seriesByInterval["15m"] ?? [];
              }

              if (!fifteenMinuteSeries) {
                fifteenMinuteSeries = await fetchCandleSeries(symbol, "15m", 120, candleFetchOptions);
              }

              nextVolumeSignals[symbol] = computeVolumeSignal(fifteenMinuteSeries);
            } catch {
              if (rsiSymbolSet.has(symbol)) {
                nextRsi[symbol] = {
                  rsi4h: null,
                  rsi1h: null,
                  rsi15m: null,
                  rsi5m: null
                };
                nextInsideBars[symbol] = [];
                nextStairSteps[symbol] = [];
              }
              nextVolumeSignals[symbol] = null;
            }
          }
        }
      );

      await Promise.all(workers);

      setRsiMap((prev) => ({ ...prev, ...nextRsi }));
      setInsideBarMap((prev) => ({ ...prev, ...nextInsideBars }));
      setStairStepMap((prev) => ({ ...prev, ...nextStairSteps }));
      setVolumeSignalMap((prev) => ({ ...prev, ...nextVolumeSignals }));

      if (Object.keys(nextRsi).length > 0 || Object.keys(nextVolumeSignals).length > 0) {
        setRsiWarning("");
        setLastRsiUpdated(new Date().toISOString());
      } else {
        setRsiWarning("Geen signaaldata ontvangen in de laatste run.");
      }
    } catch (error) {
      setRsiWarning(errorMessage(error));
    } finally {
      rsiInFlightRef.current = false;
      setAnalysisReady(true);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    await refreshScanner();
    await refreshRsiAndVolumeSignals();
  }, [refreshScanner, refreshRsiAndVolumeSignals]);

  useEffect(() => {
    refreshScanner();
    const scannerTimer = setInterval(() => {
      refreshScanner();
    }, 180_000);
    return () => clearInterval(scannerTimer);
  }, [refreshScanner]);

  useEffect(() => {
    if (rows.length === 0) return;
    refreshRsiAndVolumeSignals();
  }, [refreshRsiAndVolumeSignals, rows.length, scannerSymbolSignature]);

  useEffect(() => {
    const rsiTimer = setInterval(() => {
      refreshRsiAndVolumeSignals();
    }, 60_000);
    return () => clearInterval(rsiTimer);
  }, [refreshRsiAndVolumeSignals]);

  const topRsiSymbols = useMemo(() => rows.slice(0, RSI_SCAN_LIMIT).map((row) => row.symbol), [rows]);
  const topRsiSet = useMemo(() => new Set(topRsiSymbols), [topRsiSymbols]);
  const rowsBySymbol = useMemo(() => new Map(rows.map((row) => [row.symbol, row])), [rows]);

  const liveAlerts = useMemo(() => {
    const nextAlerts = [];
    const now = new Date().toISOString();

    rows.forEach((row) => {
      const volumeSignal = volumeSignalMap[row.symbol];
      if (
        volumeSignal &&
        Number.isFinite(volumeSignal.currentVolume) &&
        Number.isFinite(volumeSignal.ma20Volume) &&
        volumeSignal.currentVolume > ABNORMAL_VOLUME_MULTIPLIER * volumeSignal.ma20Volume &&
        ["BULL", "BEAR"].includes(volumeSignal.candleDirection)
      ) {
        nextAlerts.push({
          symbol: row.symbol,
          type: "ABNORMAL_VOLUME",
          bias: volumeSignal.candleDirection,
          detectedAt: now,
          meta: {
            timeframe: "15m",
            current15mVolume: volumeSignal.currentVolume,
            ma20Volume: volumeSignal.ma20Volume,
            ratio: volumeSignal.ratio,
            multiplier: ABNORMAL_VOLUME_MULTIPLIER,
            candleDirection: volumeSignal.candleDirection
          }
        });
      }

      if (!topRsiSet.has(row.symbol)) return;

      (insideBarMap[row.symbol] ?? []).forEach((signal) => {
        if (!signal?.direction) return;
        nextAlerts.push({
          symbol: row.symbol,
          type: "INSIDE_BAR_BREAK",
          bias: signal.direction,
          detectedAt: now,
          meta: signal
        });
      });

      (stairStepMap[row.symbol] ?? []).forEach((signal) => {
        if (!signal?.breakoutDirection) return;
        nextAlerts.push({
          symbol: row.symbol,
          type: "STAIR_STEP_BREAK",
          bias: signal.breakoutDirection,
          detectedAt: now,
          meta: signal
        });
      });

      const snapshot = rsiMap[row.symbol];
      if (!snapshot) return;

      if (isSuperstack4h(snapshot, BULL_RSI_THRESHOLD)) {
        nextAlerts.push({
          symbol: row.symbol,
          type: "SUPERSTACK_4H",
          bias: "BULL",
          detectedAt: now,
          meta: {
            rsi4h: snapshot.rsi4h,
            rsi1h: snapshot.rsi1h,
            rsi15m: snapshot.rsi15m,
            rsi5m: snapshot.rsi5m,
            threshold: BULL_RSI_THRESHOLD,
            direction: "oversold"
          }
        });
      }

      if (isOverbought4h(snapshot, BEAR_RSI_THRESHOLD)) {
        nextAlerts.push({
          symbol: row.symbol,
          type: "SUPERSTACK_4H",
          bias: "BEAR",
          detectedAt: now,
          meta: {
            rsi4h: snapshot.rsi4h,
            rsi1h: snapshot.rsi1h,
            rsi15m: snapshot.rsi15m,
            rsi5m: snapshot.rsi5m,
            threshold: BEAR_RSI_THRESHOLD,
            direction: "overbought"
          }
        });
      }

      if (isSuperstack1h(snapshot, BULL_RSI_THRESHOLD)) {
        nextAlerts.push({
          symbol: row.symbol,
          type: "SUPERSTACK_1H",
          bias: "BULL",
          detectedAt: now,
          meta: {
            rsi1h: snapshot.rsi1h,
            rsi15m: snapshot.rsi15m,
            rsi5m: snapshot.rsi5m,
            threshold: BULL_RSI_THRESHOLD,
            direction: "oversold"
          }
        });
      }

      if (isOverbought1h(snapshot, BEAR_RSI_THRESHOLD)) {
        nextAlerts.push({
          symbol: row.symbol,
          type: "SUPERSTACK_1H",
          bias: "BEAR",
          detectedAt: now,
          meta: {
            rsi1h: snapshot.rsi1h,
            rsi15m: snapshot.rsi15m,
            rsi5m: snapshot.rsi5m,
            threshold: BEAR_RSI_THRESHOLD,
            direction: "overbought"
          }
        });
      }
    });

    return nextAlerts;
  }, [rows, volumeSignalMap, topRsiSet, insideBarMap, stairStepMap, rsiMap]);

  useEffect(() => {
    if (!analysisReady) return;
    syncAlertSnapshot(liveAlerts);
  }, [analysisReady, liveAlerts, syncAlertSnapshot]);

  const visibleAlertRecords = useMemo(() => {
    const selectedTypeSet = new Set(selectedAlertTypes);
    const selectedTimeframeSet = new Set(selectedTimeframes);

    return sortAlerts(
      alertRecords.filter((record) => {
        if (record.bias !== marketBias) return false;
        if (!selectedTypeSet.has(record.type)) return false;
        if (!matchesAlertStatus(record, alertStatus)) return false;
        if (record.timeframe && !selectedTimeframeSet.has(record.timeframe)) return false;
        return true;
      }),
      alertSort
    );
  }, [alertRecords, alertSort, alertStatus, marketBias, selectedAlertTypes, selectedTimeframes]);

  const activeAlertSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          alertRecords
            .filter((record) => ["new", "active", "acknowledged", "cooling"].includes(record.status))
            .map((record) => record.symbol)
        )
      ),
    [alertRecords]
  );

  const watchlistSymbols = useMemo(() => watchlist.map((item) => item.symbol), [watchlist]);
  const watchlistItems = useMemo(
    () =>
      watchlist
        .map((item) => ({
          ...item,
          ...(rowsBySymbol.get(item.symbol) ?? {
            price: null,
            change24hPct: null,
            assetClass: "Onbekend"
          })
        }))
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
    [rowsBySymbol, watchlist]
  );

  const tvSymbol = useMemo(() => {
    const base = (selectedRawSymbol || "BTC").split(":").pop()?.toUpperCase() || "BTC";
    return `${base}USDT`;
  }, [selectedRawSymbol]);

  const focusAlertSymbol = visibleAlertRecords[0]?.symbol ?? activeAlertSymbols[0] ?? null;
  const btcRow = rows.find((row) => row.symbol === "BTC" && row.isExternalDex !== true) ?? rows[0] ?? null;
  const risingCount = rows.filter((row) => Number(row.change24hPct) > 0).length;
  const fallingCount = rows.filter((row) => Number(row.change24hPct) < 0).length;
  const topGainer = [...rows].sort((a, b) => Number(b.change24hPct ?? -Infinity) - Number(a.change24hPct ?? -Infinity))[0] ?? null;
  const topLoser = [...rows].sort((a, b) => Number(a.change24hPct ?? Infinity) - Number(b.change24hPct ?? Infinity))[0] ?? null;

  useEffect(() => {
    updateWorkspaceStatus((prev) => ({
      ...prev,
      selectedSymbol: selectedRawSymbol,
      activeAlertCount,
      lastMarketUpdate: lastScannerUpdated ?? prev.lastMarketUpdate
    }));
  }, [activeAlertCount, lastScannerUpdated, selectedRawSymbol, updateWorkspaceStatus]);

  return (
    <div className="market-shell">
      <header className="market-topbar">
        <div className="market-title">
          <LayoutDashboard size={20} />
          <span>Market Dashboard</span>
        </div>

        <div className="market-topbar-actions">
          <button className="icon-btn" onClick={handleManualRefresh} title="Refresh" type="button">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <section className="market-summary-grid">
        <MarketSummaryCard
          title="BTC 24h trend"
          value={formatPct(Number(btcRow?.change24hPct))}
          detail={btcRow ? `Prijs ${formatCompactUsd(Number(btcRow.price))}` : "Nog geen BTC snapshot"}
          tone={Number(btcRow?.change24hPct) >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <MarketSummaryCard
          title="Market breadth"
          value={`${risingCount} / ${fallingCount}`}
          detail="Rising vs falling symbols"
          tone="info"
          icon={Activity}
        />
        <MarketSummaryCard
          title="Actieve alerts"
          value={String(activeAlertCount)}
          detail={`${visibleAlertRecords.length} zichtbaar in ${marketBias.toLowerCase()} modus`}
          tone="default"
          icon={Layers3}
        />
        <MarketSummaryCard
          title="Universe"
          value={String(rows.length)}
          detail={`Watchlist ${watchlist.length} • laatste update ${workspaceStatus.lastMarketUpdate ? new Date(workspaceStatus.lastMarketUpdate).toLocaleTimeString("nl-NL") : "-"}`}
          tone="default"
          icon={Clock3}
        />
      </section>

      <section className="card market-card market-regime-card">
        <div className="market-card-head between">
          <div>
            <h2>Market Regime</h2>
            <p className="market-muted">Snelle context voordat je de scanner induikt.</p>
          </div>
        </div>
        <div className="market-regime-grid">
          <div className="market-regime-item">
            <span>Top mover</span>
            <strong>{topGainer?.symbol ?? "-"}</strong>
            <small className={Number(topGainer?.change24hPct) >= 0 ? "positive" : "negative"}>{formatPct(Number(topGainer?.change24hPct))}</small>
          </div>
          <div className="market-regime-item">
            <span>Top loser</span>
            <strong>{topLoser?.symbol ?? "-"}</strong>
            <small className={Number(topLoser?.change24hPct) >= 0 ? "positive" : "negative"}>{formatPct(Number(topLoser?.change24hPct))}</small>
          </div>
          <div className="market-regime-item">
            <span>Watchlist met alerts</span>
            <strong>{watchlistItems.filter((item) => activeAlertSymbols.includes(item.symbol)).length}</strong>
            <small>{watchlist.length > 0 ? "Pinned symbolen in focus" : "Nog geen watchlist"}</small>
          </div>
          <div className="market-regime-item">
            <span>Scanner status</span>
            <strong>{scannerWarning ? "Stale" : "Live"}</strong>
            <small>{scannerWarning || "Snapshot gezond"}</small>
          </div>
        </div>
      </section>

      <main className="market-grid workspace-market-grid">
        <div className="market-main-col">
          <TradingViewPanel
            tvSymbol={tvSymbol}
            rawSymbol={selectedRawSymbol}
            theme={theme}
            interval={chartInterval}
            actions={
              <div className="tv-actions-row">
                <div className="segmented-control market-bias-switch compact">
                  <button className={chartInterval === "15" ? "active" : ""} onClick={() => setChartInterval("15")}>15m</button>
                  <button className={chartInterval === "60" ? "active" : ""} onClick={() => setChartInterval("60")}>1h</button>
                  <button className={chartInterval === "240" ? "active" : ""} onClick={() => setChartInterval("240")}>4h</button>
                  <button className={chartInterval === "1D" ? "active" : ""} onClick={() => setChartInterval("1D")}>1d</button>
                </div>

                {focusAlertSymbol && focusAlertSymbol !== selectedRawSymbol && (
                  <button className="btn btn-inline btn-ghost" type="button" onClick={() => setSelectedRawSymbol(focusAlertSymbol)}>
                    Open active alert
                  </button>
                )}
              </div>
            }
          />

          <PerpScannerTable
            rows={rows}
            selectedSymbol={selectedRawSymbol}
            onSelectSymbol={setSelectedRawSymbol}
            query={query}
            onQueryChange={setQuery}
            quoteMode={scannerQuoteMode}
            onQuoteModeChange={setScannerQuoteMode}
            assetFilter={assetFilter}
            onAssetFilterChange={setAssetFilter}
            volumeFloor={volumeFloor}
            onVolumeFloorChange={setVolumeFloor}
            onlyWatchlist={onlyWatchlist}
            onOnlyWatchlistChange={setOnlyWatchlist}
            onlyActiveAlerts={onlyActiveAlerts}
            onOnlyActiveAlertsChange={setOnlyActiveAlerts}
            watchlistSymbols={watchlistSymbols}
            activeAlertSymbols={activeAlertSymbols}
            onToggleWatchlist={toggleWatchlistSymbol}
          />
        </div>

        <div className="market-side-col">
          <WatchlistPanel
            items={watchlistItems}
            selectedSymbol={selectedRawSymbol}
            onSelectSymbol={setSelectedRawSymbol}
            onToggleWatchlist={toggleWatchlistSymbol}
            activeAlertSymbols={activeAlertSymbols}
          />

          <AlertsPanel
            alerts={visibleAlertRecords}
            lastUpdated={lastRsiUpdated || lastScannerUpdated}
            marketBias={marketBias}
            onMarketBiasChange={setMarketBias}
            selectedAlertTypes={selectedAlertTypes}
            onSelectedAlertTypesChange={setSelectedAlertTypes}
            selectedTimeframes={selectedTimeframes}
            onSelectedTimeframesChange={setSelectedTimeframes}
            alertStatus={alertStatus}
            onAlertStatusChange={setAlertStatus}
            alertSort={alertSort}
            onAlertSortChange={setAlertSort}
            onAcknowledgeAlert={acknowledgeAlert}
            onDismissAlert={dismissAlert}
            onSelectSymbol={setSelectedRawSymbol}
            onToggleWatchlist={toggleWatchlistSymbol}
            watchlistSymbols={watchlistSymbols}
          />

          {loading && rows.length === 0 && (
            <div className="card market-card market-status">Dashboard laden...</div>
          )}

          {scannerWarning && (
            <div className="card market-card market-status warning">
              <p>Scanner waarschuwing: {scannerWarning}</p>
            </div>
          )}

          {rsiWarning && (
            <div className="card market-card market-status warning">
              <p>Signaal waarschuwing: {rsiWarning}</p>
            </div>
          )}

          <div className="card market-card market-status">
            <div className="market-status-stack">
              <p className="market-muted">
                Scanner update:{" "}
                {lastScannerUpdated ? new Date(lastScannerUpdated).toLocaleTimeString("nl-NL") : "nog niet beschikbaar"}
              </p>
              <p className="market-muted">
                Signalen update:{" "}
                {lastRsiUpdated ? new Date(lastRsiUpdated).toLocaleTimeString("nl-NL") : "nog niet beschikbaar"}
              </p>
              <p className="market-muted">USD/USDC only alert-engine • BTC-tab blijft alleen een weergave.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
