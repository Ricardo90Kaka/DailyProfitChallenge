"use client";

import Link from "next/link";
import { BookOpenText, Star, TrendingUp } from "lucide-react";

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function WatchlistPanel({
  items,
  selectedSymbol,
  onSelectSymbol,
  onToggleWatchlist,
  activeAlertSymbols
}) {
  return (
    <section className="card market-card watchlist-card">
      <div className="market-card-head watchlist-head">
        <div>
          <h2>Watchlist</h2>
          <p className="market-muted">Pinned symbolen syncen mee met je account.</p>
        </div>
      </div>

      <div className="watchlist-list">
        {items.length === 0 && (
          <div className="alert-empty">
            <p>Nog geen symbolen vastgepind.</p>
          </div>
        )}

        {items.map((item) => {
          const hasAlert = activeAlertSymbols.includes(item.symbol);
          const changeClass = Number(item.change24hPct) >= 0 ? "positive" : "negative";

          return (
            <article key={item.symbol} className={`watchlist-item ${selectedSymbol === item.symbol ? "active" : ""}`}>
              <button className="watchlist-symbol-btn" type="button" onClick={() => onSelectSymbol(item.symbol)}>
                <div>
                  <strong>{item.symbol}</strong>
                  <p>{item.assetClass || "Onbekend"}</p>
                </div>
                <div className="watchlist-metrics">
                  <span>{formatPrice(item.price)}</span>
                  <span className={Number.isFinite(item.change24hPct) ? changeClass : ""}>{formatPct(item.change24hPct)}</span>
                </div>
              </button>

              <div className="watchlist-actions">
                {hasAlert && <span className="scanner-inline-badge">Alert</span>}
                <Link className="icon-btn" href={`/journal?symbol=${encodeURIComponent(item.symbol)}`} title="Open in Journal">
                  <BookOpenText size={14} />
                </Link>
                <button className="icon-btn watch-active" type="button" onClick={() => onToggleWatchlist(item.symbol)} title="Verwijder uit watchlist">
                  <Star size={14} fill="currentColor" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="watchlist-footnote market-muted">
          <TrendingUp size={14} />
          Klik op een symbool om scanner, chart en alert-context te synchroniseren.
        </div>
      )}
    </section>
  );
}
