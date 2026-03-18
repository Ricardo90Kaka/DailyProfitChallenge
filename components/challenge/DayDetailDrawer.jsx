"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

export default function DayDetailDrawer({ open, date, entry, journalEntries, formatVal, onClose }) {
  if (!open) return null;

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true">
      <div className="day-drawer">
        <div className="day-drawer-head">
          <div>
            <p className="eyebrow">Dagdetail</p>
            <h3>{date}</h3>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {entry ? (
          <div className="day-drawer-grid">
            <div className="day-detail-card">
              <span>Balans</span>
              <strong>{formatVal(entry.accountValue)}</strong>
            </div>
            <div className="day-detail-card">
              <span>Dagresultaat</span>
              <strong className={entry.profit >= 0 ? "positive" : "negative"}>{formatVal(entry.profit)}</strong>
            </div>
            <div className="day-detail-card">
              <span>Dagreturn</span>
              <strong className={entry.dayReturnPct >= 0 ? "positive" : "negative"}>{entry.dayReturnPct.toFixed(2)}%</strong>
            </div>
          </div>
        ) : (
          <div className="empty-state">Geen challenge-snapshot op deze dag.</div>
        )}

        {entry?.notes && <p className="day-detail-notes">{entry.notes}</p>}

        <div className="day-detail-section">
          <div className="day-section-head">
            <h4>Trades op deze dag</h4>
            <Link className="btn btn-inline btn-ghost" href={`/journal?date=${date}${entry?.symbol ? `&symbol=${entry.symbol}` : ""}`}>
              Open in Journal
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="day-trade-list">
            {journalEntries.length === 0 && <div className="empty-state">Nog geen journal-items op deze dag.</div>}
            {journalEntries.map((trade) => (
              <article key={trade.id} className="day-trade-item">
                <div>
                  <strong>{trade.symbol}</strong>
                  <p>{trade.setup || "Onbenoemde setup"} • {trade.side} • {trade.timeframe}</p>
                </div>
                <strong className={Number(trade.resultAmount) >= 0 ? "positive" : "negative"}>{formatVal(trade.resultAmount)}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
