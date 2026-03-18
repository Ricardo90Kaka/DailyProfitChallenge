const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

const INTERVAL_TO_MS = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};

const candleCache = new Map();

export class HyperliquidRequestError extends Error {
  constructor(message, { status = null, code = "UNKNOWN", retryable = false, details = null } = {}) {
    super(message);
    this.name = "HyperliquidRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

function normalizeError(error) {
  if (error instanceof HyperliquidRequestError) return error;
  if (error?.name === "AbortError") {
    return new HyperliquidRequestError("Hyperliquid request timed out", {
      code: "TIMEOUT",
      retryable: true
    });
  }
  return new HyperliquidRequestError(error?.message ?? "Hyperliquid request failed", {
    code: "NETWORK_ERROR",
    retryable: true
  });
}

export async function postHyperliquid(payload, fetchImpl = fetch, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseMs = options.retryBaseMs ?? 350;

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(HYPERLIQUID_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        const rawBody = await response.text().catch(() => "");
        let details = null;
        try {
          details = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          details = rawBody || null;
        }

        const error = new HyperliquidRequestError(
          `Hyperliquid request failed: ${response.status}`,
          {
            status: response.status,
            code: "HTTP_ERROR",
            retryable: shouldRetryStatus(response.status),
            details
          }
        );

        if (error.retryable && attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 160);
          await wait(retryBaseMs * (attempt + 1) + jitter);
          attempt += 1;
          continue;
        }

        throw error;
      }

      return response.json();
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.retryable && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 160);
        await wait(retryBaseMs * (attempt + 1) + jitter);
        attempt += 1;
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new HyperliquidRequestError("Hyperliquid request failed after retries", {
    code: "RETRIES_EXCEEDED",
    retryable: false
  });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDexName(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveAssetClass(symbol, dexName) {
  const upper = String(symbol ?? "").toUpperCase();
  const base = upper.includes(":") ? upper.split(":").pop() : upper;
  const commodityKeywords = ["GOLD", "SILVER", "XAU", "XAG", "OIL", "WTI", "BRENT", "CRUDE", "COPPER", "NGAS", "GAS"];
  const indexKeywords = ["SPX", "SPY", "NDX", "NASDAQ", "NAS100", "US500", "US30", "DJI", "DOW", "DXY", "GER", "DE40", "UK100", "NIKKEI", "HSI"];

  if (!dexName && !upper.includes(":")) return "Crypto";
  if (commodityKeywords.some((keyword) => base.includes(keyword))) return "Commodities";
  if (indexKeywords.some((keyword) => base.includes(keyword))) return "Indices";
  return "TradFi";
}

export async function fetchPerpUniverseAndCtx(fetchImpl = fetch, options = {}, dex = null) {
  const dexName = normalizeDexName(dex);
  const payload = dexName ? { type: "metaAndAssetCtxs", dex: dexName } : { type: "metaAndAssetCtxs" };
  const data = await postHyperliquid(payload, fetchImpl, options);
  const meta = data?.[0];
  const assetCtxs = data?.[1] ?? [];
  const universe = meta?.universe ?? [];

  const rows = universe
    .map((item, index) => {
      const ctx = assetCtxs[index] ?? {};
      const symbol = item?.name ?? "";
      const price = toNumber(ctx?.markPx);
      const prevDayPx = toNumber(ctx?.prevDayPx);
      const volume24hUsd = toNumber(ctx?.dayNtlVlm);
      const openInterest = toNumber(ctx?.openInterest);
      const openInterestUsd = price !== null && openInterest !== null ? price * openInterest : null;
      const collateralToken = toNumber(item?.collateralToken);

      let change24hPct = null;
      if (price !== null && prevDayPx !== null && prevDayPx !== 0) {
        change24hPct = ((price - prevDayPx) / prevDayPx) * 100;
      }

      return {
        symbol,
        isDelisted: item?.isDelisted === true,
        price,
        prevDayPx,
        change24hPct,
        volume24hUsd,
        openInterestUsd,
        collateralToken,
        dex: dexName,
        isExternalDex: Boolean(dexName) || symbol.includes(":"),
        assetClass: deriveAssetClass(symbol, dexName)
      };
    })
    .filter((row) => row.symbol && !row.isDelisted);

  return rows;
}

export async function fetchPerpDexs(fetchImpl = fetch, options = {}) {
  const data = await postHyperliquid({ type: "perpDexs" }, fetchImpl, options);
  if (!data || typeof data !== "object") return [];

  return Object.entries(data)
    .filter(([, assets]) => Array.isArray(assets))
    .map(([dex]) => dex)
    .filter((dex) => typeof dex === "string" && dex.length > 0);
}

function mergeRowsBySymbol(rowSets) {
  const merged = new Map();

  rowSets.flat().forEach((row) => {
    if (!row?.symbol) return;

    const existing = merged.get(row.symbol);
    if (!existing) {
      merged.set(row.symbol, row);
      return;
    }

    if (existing.isExternalDex && !row.isExternalDex) {
      merged.set(row.symbol, row);
      return;
    }

    const existingVol = Number(existing.volume24hUsd);
    const incomingVol = Number(row.volume24hUsd);
    if (Number.isFinite(incomingVol) && (!Number.isFinite(existingVol) || incomingVol > existingVol)) {
      merged.set(row.symbol, row);
    }
  });

  return Array.from(merged.values());
}

export async function fetchUsdcPerpRows(fetchImpl = fetch, options = {}) {
  const coreRows = await fetchPerpUniverseAndCtx(fetchImpl, options);

  let dexs = [];
  try {
    dexs = await fetchPerpDexs(fetchImpl, options);
  } catch {
    return coreRows;
  }

  const externalRows = await Promise.all(
    dexs.map(async (dex) => {
      try {
        const rows = await fetchPerpUniverseAndCtx(fetchImpl, options, dex);
        return rows.filter((row) => row.collateralToken === 0);
      } catch {
        return [];
      }
    })
  );

  return mergeRowsBySymbol([coreRows, ...externalRows]);
}

function cacheKey(symbol, interval, lookback) {
  return `${symbol}:${interval}:${lookback}`;
}

function parseCandle(candle) {
  const open = toNumber(candle?.o ?? candle?.open);
  const close = toNumber(candle?.c ?? candle?.close);
  if (close === null) return null;
  const normalizedOpen = open ?? close;
  const high = toNumber(candle?.h ?? candle?.high) ?? Math.max(normalizedOpen, close);
  const low = toNumber(candle?.l ?? candle?.low) ?? Math.min(normalizedOpen, close);

  const volume =
    toNumber(candle?.v ?? candle?.volume ?? candle?.vlm ?? candle?.quoteVolume) ?? 0;

  return { open: normalizedOpen, high, low, close, volume };
}

export async function fetchCandleSeries(symbol, interval, lookback = 120, options = {}) {
  const now = Date.now();
  const ttlMs = options.ttlMs ?? 60_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestOptions = {
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    retryBaseMs: options.retryBaseMs
  };
  const key = cacheKey(symbol, interval, lookback);
  const cached = candleCache.get(key);

  if (cached && now - cached.timestamp < ttlMs) {
    return cached.series;
  }

  const intervalMs = INTERVAL_TO_MS[interval];
  if (!intervalMs) return [];

  const endTime = now;
  const startTime = endTime - lookback * intervalMs;

  const data = await postHyperliquid(
    {
      type: "candleSnapshot",
      req: {
        coin: symbol,
        interval,
        startTime,
        endTime
      }
    },
    fetchImpl,
    requestOptions
  );

  const candles = Array.isArray(data) ? data : [];
  const series = candles
    .map(parseCandle)
    .filter((value) => value !== null);

  candleCache.set(key, { timestamp: now, series });
  return series;
}

export async function fetchCandles(symbol, interval, lookback = 120, options = {}) {
  const series = await fetchCandleSeries(symbol, interval, lookback, options);
  return series.map((point) => point.close);
}

export function computeRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number.isFinite(rsi) ? rsi : null;
}

function isInsideBar(bar, previousBar) {
  if (!bar || !previousBar) return false;

  return (
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(previousBar.high) &&
    Number.isFinite(previousBar.low) &&
    bar.high <= previousBar.high &&
    bar.low >= previousBar.low
  );
}

function countHigherLowRun(series, startIndex) {
  let length = 1;
  let cursor = startIndex;

  while (cursor > 0) {
    const currentBar = series[cursor];
    const previousBar = series[cursor - 1];

    if (
      !currentBar ||
      !previousBar ||
      !Number.isFinite(currentBar.low) ||
      !Number.isFinite(previousBar.low) ||
      currentBar.low <= previousBar.low
    ) {
      break;
    }

    length += 1;
    cursor -= 1;
  }

  return length;
}

function countLowerHighRun(series, startIndex) {
  let length = 1;
  let cursor = startIndex;

  while (cursor > 0) {
    const currentBar = series[cursor];
    const previousBar = series[cursor - 1];

    if (
      !currentBar ||
      !previousBar ||
      !Number.isFinite(currentBar.high) ||
      !Number.isFinite(previousBar.high) ||
      currentBar.high >= previousBar.high
    ) {
      break;
    }

    length += 1;
    cursor -= 1;
  }

  return length;
}

export function detectInsideBarBreak(series, options = {}) {
  if (!Array.isArray(series) || series.length < 4) return null;

  const timeframe = options.timeframe ?? null;
  const currentBar = series[series.length - 1];
  const referenceBar = series[series.length - 2];

  if (
    !currentBar ||
    !referenceBar ||
    !Number.isFinite(currentBar.high) ||
    !Number.isFinite(currentBar.low) ||
    !Number.isFinite(referenceBar.high) ||
    !Number.isFinite(referenceBar.low)
  ) {
    return null;
  }

  let insideBarCount = 0;
  let cursor = series.length - 2;

  while (cursor > 0 && isInsideBar(series[cursor], series[cursor - 1])) {
    insideBarCount += 1;
    cursor -= 1;
  }

  if (insideBarCount < 2) return null;

  const bullishBreak = currentBar.high > referenceBar.high;
  const bearishBreak = currentBar.low < referenceBar.low;

  if (bullishBreak === bearishBreak) return null;

  return {
    timeframe,
    direction: bullishBreak ? "BULL" : "BEAR",
    insideBarCount,
    referenceHigh: referenceBar.high,
    referenceLow: referenceBar.low,
    triggerMode: "wick"
  };
}

export function detectStairStepBreak(series, options = {}) {
  if (!Array.isArray(series) || series.length < 6) return null;

  const timeframe = options.timeframe ?? null;
  const currentBar = series[series.length - 1];
  const previousBar = series[series.length - 2];

  if (
    !currentBar ||
    !previousBar ||
    !Number.isFinite(currentBar.high) ||
    !Number.isFinite(currentBar.low) ||
    !Number.isFinite(previousBar.high) ||
    !Number.isFinite(previousBar.low)
  ) {
    return null;
  }

  const breaksUp = currentBar.high > previousBar.high;
  const breaksDown = currentBar.low < previousBar.low;

  if (breaksUp === breaksDown) return null;

  if (breaksDown) {
    const setupLength = countHigherLowRun(series, series.length - 2);
    if (setupLength < 5) return null;

    return {
      timeframe,
      breakoutDirection: "BEAR",
      setupDirection: "BULL",
      setupLength,
      triggerLevel: previousBar.low,
      triggerMode: "wick"
    };
  }

  const setupLength = countLowerHighRun(series, series.length - 2);
  if (setupLength < 5) return null;

  return {
    timeframe,
    breakoutDirection: "BULL",
    setupDirection: "BEAR",
    setupLength,
    triggerLevel: previousBar.high,
    triggerMode: "wick"
  };
}

export async function fetchRsiSnapshot(symbol, options = {}) {
  const [closes4h, closes1h, closes15m, closes5m] = await Promise.all([
    fetchCandles(symbol, "4h", 120, options),
    fetchCandles(symbol, "1h", 120, options),
    fetchCandles(symbol, "15m", 120, options),
    fetchCandles(symbol, "5m", 120, options)
  ]);

  return {
    rsi4h: computeRsi(closes4h, 14),
    rsi1h: computeRsi(closes1h, 14),
    rsi15m: computeRsi(closes15m, 14),
    rsi5m: computeRsi(closes5m, 14)
  };
}

export function isSuperstack4h(snapshot, threshold = 30) {
  if (!snapshot) return false;
  const { rsi4h, rsi1h, rsi15m, rsi5m } = snapshot;
  return [rsi4h, rsi1h, rsi15m, rsi5m].every((value) => typeof value === "number" && value < threshold);
}

export function isSuperstack1h(snapshot, threshold = 30) {
  if (!snapshot) return false;
  const { rsi1h, rsi15m, rsi5m } = snapshot;
  return [rsi1h, rsi15m, rsi5m].every((value) => typeof value === "number" && value < threshold);
}
