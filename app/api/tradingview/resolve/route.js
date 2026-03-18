import { NextResponse } from "next/server";

const RESOLVER_CACHE_TTL_MS = 60 * 60 * 1000;
const resolverCache = new Map();

function sanitizeSymbol(input) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildTvSymbol(item) {
  const exchange = item?.exchange ?? "HYPERLIQUID";
  if (item?.full_name) return item.full_name;
  if (item?.symbol) return `${exchange}:${item.symbol}`;
  return null;
}

function rankCandidate(item, targetSymbol) {
  const exchange = String(item?.exchange ?? "").toUpperCase();
  if (exchange !== "HYPERLIQUID") return Number.NEGATIVE_INFINITY;

  const symbol = String(item?.symbol ?? "").toUpperCase();
  const targetUsd = `${targetSymbol}USD`;

  if (symbol === targetUsd) return 100;
  if (symbol === targetSymbol) return 90;
  if (symbol.startsWith(targetUsd)) return 80;
  if (symbol.startsWith(targetSymbol)) return 70;
  return 0;
}

async function searchTradingView(text, signal) {
  const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(
    text
  )}&exchange=HYPERLIQUID&hl=1&lang=en&type=&domain=production`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error(`TradingView resolve failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function GET(request) {
  const url = new URL(request.url);
  const rawSymbol = sanitizeSymbol(url.searchParams.get("symbol"));

  if (!rawSymbol) {
    return NextResponse.json({ resolved: false, reason: "missing_symbol" }, { status: 400 });
  }

  const cached = resolverCache.get(rawSymbol);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.value, { status: 200 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const primary = await searchTradingView(`${rawSymbol}USD`, controller.signal);
    const fallback = primary.length > 0 ? [] : await searchTradingView(rawSymbol, controller.signal);
    const candidates = [...primary, ...fallback];

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((item) => {
      const score = rankCandidate(item, rawSymbol);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (!best || bestScore < 0) {
      const unresolved = { resolved: false, reason: "not_found" };
      resolverCache.set(rawSymbol, {
        expiresAt: now + RESOLVER_CACHE_TTL_MS,
        value: unresolved
      });
      return NextResponse.json(unresolved, { status: 200 });
    }

    const result = {
      resolved: true,
      tvSymbol: buildTvSymbol(best),
      source:
        String(best?.symbol ?? "").toUpperCase() === `${rawSymbol}USD` ? "exact" : "fallback"
    };

    if (!result.tvSymbol) {
      const unresolved = { resolved: false, reason: "not_found" };
      resolverCache.set(rawSymbol, {
        expiresAt: now + RESOLVER_CACHE_TTL_MS,
        value: unresolved
      });
      return NextResponse.json(unresolved, { status: 200 });
    }

    resolverCache.set(rawSymbol, {
      expiresAt: now + RESOLVER_CACHE_TTL_MS,
      value: result
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error?.name === "AbortError" ? "TradingView resolve timeout" : error?.message;
    return NextResponse.json(
      { resolved: false, reason: "resolver_failed", error: message ?? "Unknown resolver error" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
