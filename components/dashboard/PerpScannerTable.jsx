"use client";

import Link from "next/link";
import { BookOpenText, Star } from "lucide-react";
import { useMemo, useState } from "react";

function formatUsd(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatBtc(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000) return `₿${(value / 1_000).toFixed(2)}K`;
  if (Math.abs(value) >= 1) return `₿${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (Math.abs(value) >= 0.01) return `₿${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
  return `₿${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

function formatPriceUsd(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

function formatPriceBtc(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1) return `₿${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
  return `₿${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function safeNumericCompare(a, b) {
  const aValid = Number.isFinite(a);
  const bValid = Number.isFinite(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  return a - b;
}

function isExternalDexRow(row) {
  if (!row) return false;
  if (row.isExternalDex === true) return true;
  return typeof row.symbol === "string" && row.symbol.includes(":");
}

function toDisplayMetrics(row, quoteMode, btcNow, btcPrev) {
  if (quoteMode === "BTC") {
    const priceBtcNow = Number.isFinite(row.price) && Number.isFinite(btcNow) && btcNow > 0 ? row.price / btcNow : null;
    const priceBtcPrev = Number.isFinite(row.prevDayPx) && Number.isFinite(btcPrev) && btcPrev > 0 ? row.prevDayPx / btcPrev : null;
    const change24hPctBtc =
      Number.isFinite(priceBtcNow) && Number.isFinite(priceBtcPrev) && priceBtcPrev !== 0
        ? ((priceBtcNow - priceBtcPrev) / priceBtcPrev) * 100
        : null;
    const volume24hBtc = Number.isFinite(row.volume24hUsd) && Number.isFinite(btcNow) && btcNow > 0 ? row.volume24hUsd / btcNow : null;

    return {
      price: priceBtcNow,
      change24hPct: change24hPctBtc,
      volume24h: volume24hBtc
    };
  }

  return {
    price: row.price,
    change24hPct: row.change24hPct,
    volume24h: row.volume24hUsd
  };
}

export default function PerpScannerTable({
  rows,
  selectedSymbol,
  onSelectSymbol,
  query,
  onQueryChange,
  quoteMode,
  onQuoteModeChange,
  assetFilter,
  onAssetFilterChange,
  volumeFloor,
  onVolumeFloorChange,
  onlyWatchlist,
  onOnlyWatchlistChange,
  onlyActiveAlerts,
  onOnlyActiveAlertsChange,
  watchlistSymbols,
  activeAlertSymbols,
  onToggleWatchlist
}) {
  const [sortKey, setSortKey] = useState("volume");
  const [sortDir, setSortDir] = useState("desc");

  const btcRow = useMemo(() => rows.find((row) => row.symbol === "BTC") ?? null, [rows]);
  const btcNow = Number(btcRow?.price);
  const btcPrev = Number(btcRow?.prevDayPx);
  const watchlistSet = useMemo(() => new Set(watchlistSymbols), [watchlistSymbols]);
  const activeAlertSet = useMemo(() => new Set(activeAlertSymbols), [activeAlertSymbols]);

  const displayRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const quoteFilteredRows = quoteMode === "BTC" ? rows.filter((row) => !isExternalDexRow(row)) : rows;

    return quoteFilteredRows
      .filter((row) => (assetFilter === "ALL" ? true : row.assetClass === assetFilter))
      .filter((row) => (row.volume24hUsd ?? 0) >= volumeFloor)
      .filter((row) => (onlyWatchlist ? watchlistSet.has(row.symbol) : true))
      .filter((row) => (onlyActiveAlerts ? activeAlertSet.has(row.symbol) : true))
      .filter((row) => row.symbol.toLowerCase().includes(search))
      .map((row) => ({
        row,
        ...toDisplayMetrics(row, quoteMode, btcNow, btcPrev)
      }));
  }, [rows, query, quoteMode, btcNow, btcPrev, assetFilter, volumeFloor, onlyWatchlist, onlyActiveAlerts, watchlistSet, activeAlertSet]);

  const sortedRows = useMemo(() => {
    const next = [...displayRows];

    next.sort((left, right) => {
      let cmp = 0;
      if (sortKey === "symbol") cmp = left.row.symbol.localeCompare(right.row.symbol);
      if (sortKey === "price") cmp = safeNumericCompare(left.price, right.price);
      if (sortKey === "change24h") cmp = safeNumericCompare(left.change24hPct, right.change24hPct);
      if (sortKey === "volume") cmp = safeNumericCompare(left.volume24h, right.volume24h);
      if (cmp === 0) cmp = left.row.symbol.localeCompare(right.row.symbol);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return next;
  }, [displayRows, sortDir, sortKey]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "symbol" ? "asc" : "desc");
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  };

  return (
    <section className="card market-card scanner-card">
      <div className="market-card-head scanner-head">
        <div>
          <h2>Hyperliquid Perps Scanner</h2>
          <p className="market-muted">Filter op asset class, volume, watchlist en actieve alerts.</p>
        </div>
        <div className="scanner-controls scanner-controls-grid">
          <div className="segmented-control scanner-quote-switch">
            <button className={quoteMode === "USD" ? "active" : ""} onClick={() => onQuoteModeChange("USD")}>USD</button>
            <button className={quoteMode === "BTC" ? "active" : ""} onClick={() => onQuoteModeChange("BTC")}>BTC</button>
          </div>
          <select className="scanner-filter-select" value={assetFilter} onChange={(event) => onAssetFilterChange(event.target.value)}>
            <option value="ALL">Alle assets</option>
            <option value="Crypto">Crypto</option>
            <option value="TradFi">TradFi</option>
            <option value="Commodities">Commodities</option>
            <option value="Indices">Indices</option>
          </select>
          <select className="scanner-filter-select" value={volumeFloor} onChange={(event) => onVolumeFloorChange(Number(event.target.value))}>
            <option value={500000}>Vol ≥ 500k</option>
            <option value={1000000}>Vol ≥ 1M</option>
            <option value={5000000}>Vol ≥ 5M</option>
            <option value={10000000}>Vol ≥ 10M</option>
          </select>
          <button className={`btn btn-inline ${onlyWatchlist ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => onOnlyWatchlistChange(!onlyWatchlist)}>
            Watchlist
          </button>
          <button className={`btn btn-inline ${onlyActiveAlerts ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => onOnlyActiveAlertsChange(!onlyActiveAlerts)}>
            Actieve alerts
          </button>
          <input className="scanner-search" type="text" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Zoek symbool..." />
        </div>
      </div>

      <div className="scanner-table-wrap">
        <table className="scanner-table">
          <thead>
            <tr>
              <th>
                <button className="sort-btn" type="button" onClick={() => handleSort("symbol")}>
                  Symbol <span>{sortIndicator("symbol")}</span>
                </button>
              </th>
              <th>Asset</th>
              <th className="numeric">
                <button className="sort-btn" type="button" onClick={() => handleSort("price")}>
                  Price ({quoteMode}) <span>{sortIndicator("price")}</span>
                </button>
              </th>
              <th className="numeric">
                <button className="sort-btn" type="button" onClick={() => handleSort("change24h")}>
                  24h% <span>{sortIndicator("change24h")}</span>
                </button>
              </th>
              <th className="numeric">
                <button className="sort-btn" type="button" onClick={() => handleSort("volume")}>
                  Volume ({quoteMode}) <span>{sortIndicator("volume")}</span>
                </button>
              </th>
              <th className="numeric">Acties</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ row, price, change24hPct, volume24h }) => {
              const changeClass = Number(change24hPct) >= 0 ? "positive" : "negative";
              const isSelected = selectedSymbol === row.symbol;
              const inWatchlist = watchlistSet.has(row.symbol);
              const hasActiveAlert = activeAlertSet.has(row.symbol);

              return (
                <tr key={row.symbol} className={isSelected ? "selected" : ""} onClick={() => onSelectSymbol(row.symbol)}>
                  <td className="symbol-cell">
                    <div className="scanner-symbol-stack">
                      <strong>{row.symbol}</strong>
                      {hasActiveAlert && <span className="scanner-inline-badge">Alert</span>}
                    </div>
                  </td>
                  <td>{row.assetClass}</td>
                  <td className="numeric">{quoteMode === "BTC" ? formatPriceBtc(price) : formatPriceUsd(price)}</td>
                  <td className={`numeric ${Number.isFinite(change24hPct) ? changeClass : ""}`}>{formatPct(change24hPct)}</td>
                  <td className="numeric">{quoteMode === "BTC" ? formatBtc(volume24h) : formatUsd(volume24h)}</td>
                  <td className="numeric">
                    <div className="scanner-row-actions">
                      <button
                        className={`icon-btn ${inWatchlist ? "watch-active" : ""}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleWatchlist(row.symbol);
                        }}
                        title={inWatchlist ? "Verwijder uit watchlist" : "Voeg toe aan watchlist"}
                      >
                        <Star size={14} fill={inWatchlist ? "currentColor" : "none"} />
                      </button>
                      <Link
                        className="icon-btn"
                        href={`/journal?symbol=${encodeURIComponent(row.symbol)}`}
                        onClick={(event) => event.stopPropagation()}
                        title="Log trade voor dit symbool"
                      >
                        <BookOpenText size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedRows.length === 0 && <p className="scanner-empty">Geen resultaten voor deze filters.</p>}
      </div>
    </section>
  );
}
