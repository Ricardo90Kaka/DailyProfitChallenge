"use client";

import Link from "next/link";
import { BellOff, BookOpenText, CheckCheck, Star } from "lucide-react";

const ALERT_TYPE_OPTIONS = [
  { value: "ABNORMAL_VOLUME", label: "Abnormal Volume" },
  { value: "INSIDE_BAR_BREAK", label: "Inside Bar Break" },
  { value: "STAIR_STEP_BREAK", label: "Stair-step" },
  { value: "SUPERSTACK_4H", label: "4h superstack" },
  { value: "SUPERSTACK_1H", label: "1h superstack" }
];

const ALERT_TIMEFRAME_OPTIONS = [
  { value: "1d", label: "1d" },
  { value: "4h", label: "4h" },
  { value: "1h", label: "1h" },
  { value: "15m", label: "15m" },
  { value: "5m", label: "5m" }
];

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatMarketNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function typeLabel(type) {
  if (type === "ABNORMAL_VOLUME") return "Abnormal Volume";
  if (type === "INSIDE_BAR_BREAK") return "Inside Bar Break";
  if (type === "STAIR_STEP_BREAK") return "Stair-step";
  if (type === "SUPERSTACK_4H") return "4h superstack";
  if (type === "SUPERSTACK_1H") return "1h superstack";
  return type;
}

function rsiMetaText(meta) {
  if (!meta) return "";
  const parts = [];
  if (typeof meta.rsi4h === "number") parts.push(`4h: ${meta.rsi4h.toFixed(1)}`);
  if (typeof meta.rsi1h === "number") parts.push(`1h: ${meta.rsi1h.toFixed(1)}`);
  if (typeof meta.rsi15m === "number") parts.push(`15m: ${meta.rsi15m.toFixed(1)}`);
  if (typeof meta.rsi5m === "number") parts.push(`5m: ${meta.rsi5m.toFixed(1)}`);
  return parts.join(" | ");
}

function FilterToggleGroup({ title, options, selectedValues, onChange }) {
  const toggleValue = (value) => {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];
    onChange(next);
  };

  return (
    <div className="filter-toggle-group" aria-label={title}>
      <span className="filter-toggle-label">{title}</span>
      <div className="filter-toggle-row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-toggle-btn ${selectedValues.includes(option.value) ? "active" : ""}`}
            onClick={() => toggleValue(option.value)}
            aria-pressed={selectedValues.includes(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function alertDetail(record) {
  if (record.type === "ABNORMAL_VOLUME") {
    return `15m vol: ${formatUsd(record.meta?.current15mVolume)} | MA20: ${formatUsd(record.meta?.ma20Volume)} | ratio: ${typeof record.meta?.ratio === "number" ? `${record.meta.ratio.toFixed(2)}x` : "-"} | candle: ${record.meta?.candleDirection ?? "-"}`;
  }

  if (record.type === "INSIDE_BAR_BREAK") {
    return `${record.timeframe ?? "-"} | ${record.meta?.direction === "BULL" ? "Bull" : record.meta?.direction === "BEAR" ? "Bear" : "-"} | inside bars: ${record.meta?.insideBarCount ?? "-"} | range: ${formatMarketNumber(record.meta?.referenceLow)} - ${formatMarketNumber(record.meta?.referenceHigh)}`;
  }

  if (record.type === "STAIR_STEP_BREAK") {
    return `${record.timeframe ?? "-"} | setup: ${record.meta?.setupDirection === "BULL" ? "Bull" : record.meta?.setupDirection === "BEAR" ? "Bear" : "-"} | break: ${record.meta?.breakoutDirection === "BULL" ? "Bull" : record.meta?.breakoutDirection === "BEAR" ? "Bear" : "-"} | reeks: ${record.meta?.setupLength ?? "-"}`;
  }

  if (record.type === "SUPERSTACK_4H" || record.type === "SUPERSTACK_1H") {
    return rsiMetaText(record.meta);
  }

  return "";
}

function statusLabel(status) {
  if (status === "new") return "Nieuw";
  if (status === "active") return "Actief";
  if (status === "acknowledged") return "Ack";
  if (status === "cooling") return "Cooling";
  if (status === "dismissed") return "Dismissed";
  return status;
}

function groupAlerts(records) {
  const groups = [];
  const map = new Map();

  records.forEach((record) => {
    if (!map.has(record.symbol)) {
      const group = { symbol: record.symbol, records: [] };
      groups.push(group);
      map.set(record.symbol, group);
    }
    map.get(record.symbol).records.push(record);
  });

  return groups;
}

export default function AlertsPanel({
  alerts,
  lastUpdated,
  marketBias,
  onMarketBiasChange,
  selectedAlertTypes,
  onSelectedAlertTypesChange,
  selectedTimeframes,
  onSelectedTimeframesChange,
  alertStatus,
  onAlertStatusChange,
  alertSort,
  onAlertSortChange,
  onAcknowledgeAlert,
  onDismissAlert,
  onSelectSymbol,
  onToggleWatchlist,
  watchlistSymbols
}) {
  const groupedAlerts = groupAlerts(alerts);
  const watchlistSet = new Set(watchlistSymbols);

  return (
    <section className="card market-card alerts-card">
      <div className="market-card-head">
        <div className="alerts-head-main">
          <h2>Alert Overzicht</h2>
          <div className="alerts-filter-row">
            <FilterToggleGroup title="Alerttypes" options={ALERT_TYPE_OPTIONS} selectedValues={selectedAlertTypes} onChange={onSelectedAlertTypesChange} />
            <FilterToggleGroup title="Timeframes" options={ALERT_TIMEFRAME_OPTIONS} selectedValues={selectedTimeframes} onChange={onSelectedTimeframesChange} />
          </div>
        </div>
        <div className="alerts-head-meta">
          <div className="segmented-control market-bias-switch">
            <button className={marketBias === "BULL" ? "active" : ""} onClick={() => onMarketBiasChange("BULL")}>Bull</button>
            <button className={marketBias === "BEAR" ? "active" : ""} onClick={() => onMarketBiasChange("BEAR")}>Bear</button>
          </div>
          <div className="segmented-control market-bias-switch compact">
            <button className={alertStatus === "ALL" ? "active" : ""} onClick={() => onAlertStatusChange("ALL")}>Alles</button>
            <button className={alertStatus === "NEW" ? "active" : ""} onClick={() => onAlertStatusChange("NEW")}>New</button>
            <button className={alertStatus === "ACTIVE" ? "active" : ""} onClick={() => onAlertStatusChange("ACTIVE")}>Active</button>
            <button className={alertStatus === "ACK" ? "active" : ""} onClick={() => onAlertStatusChange("ACK")}>Ack</button>
          </div>
          <div className="segmented-control market-bias-switch compact">
            <button className={alertSort === "priority" ? "active" : ""} onClick={() => onAlertSortChange("priority")}>Prioriteit</button>
            <button className={alertSort === "newest" ? "active" : ""} onClick={() => onAlertSortChange("newest")}>Nieuwste</button>
            <button className={alertSort === "symbol" ? "active" : ""} onClick={() => onAlertSortChange("symbol")}>Symbool</button>
            <button className={alertSort === "timeframe" ? "active" : ""} onClick={() => onAlertSortChange("timeframe")}>TF</button>
          </div>
          <span className="market-muted">
            {lastUpdated ? `Laatste update: ${new Date(lastUpdated).toLocaleTimeString("nl-NL")}` : "Laden..."}
          </span>
        </div>
      </div>

      <div className="alerts-list">
        {groupedAlerts.length === 0 && (
          <div className="alert-empty">
            <p>Geen actieve alerts gevonden.</p>
          </div>
        )}

        {groupedAlerts.map((group) => (
          <section key={group.symbol} className="alert-group-card">
            <div className="alert-group-head">
              <button className="alert-symbol-btn" type="button" onClick={() => onSelectSymbol(group.symbol)}>
                {group.symbol}
              </button>
              <div className="scanner-row-actions">
                <button className={`icon-btn ${watchlistSet.has(group.symbol) ? "watch-active" : ""}`} type="button" onClick={() => onToggleWatchlist(group.symbol)} title="Watchlist toggle">
                  <Star size={14} fill={watchlistSet.has(group.symbol) ? "currentColor" : "none"} />
                </button>
                <Link className="icon-btn" href={`/journal?symbol=${encodeURIComponent(group.symbol)}`} title="Log trade voor dit symbool">
                  <BookOpenText size={14} />
                </Link>
              </div>
            </div>

            <div className="alert-group-list">
              {group.records.map((record) => (
                <article key={record.id} className="alert-item">
                  <div className="alert-item-head">
                    <div className="alert-badge-row">
                      <span className={`alert-badge bias-${(record.bias || marketBias || "BULL").toLowerCase()}`}>{record.bias || marketBias}</span>
                      <span className="alert-badge">{typeLabel(record.type)}</span>
                      <span className={`alert-badge alert-status-badge status-${record.status}`}>{statusLabel(record.status)}</span>
                    </div>
                  </div>
                  <p className="alert-detail">{alertDetail(record)}</p>
                  <div className="alert-record-meta">
                    <small className="market-muted">First seen: {new Date(record.firstSeenAt).toLocaleTimeString("nl-NL")}</small>
                    <small className="market-muted">Last seen: {new Date(record.lastSeenAt).toLocaleTimeString("nl-NL")}</small>
                  </div>
                  <div className="alert-actions-row">
                    <button className="btn btn-inline btn-ghost" type="button" onClick={() => onAcknowledgeAlert(record.id)}>
                      <CheckCheck size={14} />
                      Ack
                    </button>
                    <button className="btn btn-inline btn-ghost" type="button" onClick={() => onDismissAlert(record.id)}>
                      <BellOff size={14} />
                      Dismiss
                    </button>
                    <button className="btn btn-inline btn-ghost" type="button" onClick={() => onSelectSymbol(record.symbol)}>
                      Open chart
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
