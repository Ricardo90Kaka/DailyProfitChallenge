"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenText, Filter, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAppData } from "../../components/AppDataProvider";
import { todayInputValue } from "../../lib/challenge-utils";

const EMPTY_FORM = {
  id: null,
  date: todayInputValue(),
  symbol: "",
  assetClass: "Crypto",
  side: "Long",
  timeframe: "1h",
  setup: "",
  confidence: 3,
  resultAmount: 0,
  errorCategory: "",
  notes: "",
  chartLink: ""
};

function formatResult(value, currency = "EUR") {
  const numeric = Number(value ?? 0);
  if (currency === "BTC") return `₿${numeric.toFixed(4)}`;
  return new Intl.NumberFormat(currency === "EUR" ? "nl-NL" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(numeric);
}

function buildTopSetup(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    if (!entry.setup) return;
    counts.set(entry.setup, (counts.get(entry.setup) ?? 0) + 1);
  });

  let winner = null;
  counts.forEach((count, setup) => {
    if (!winner || count > winner.count) {
      winner = { setup, count };
    }
  });

  return winner;
}

function JournalPageContent() {
  const searchParams = useSearchParams();
  const {
    journalEntries,
    upsertJournalEntry,
    deleteJournalEntry,
    challenge,
    updateWorkspaceStatus
  } = useAppData();

  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({
    symbol: "",
    setup: "",
    side: "ALL",
    timeframe: "ALL",
    profitState: "ALL",
    errorCategory: "",
    dateFrom: "",
    dateTo: ""
  });

  useEffect(() => {
    const symbol = searchParams.get("symbol");
    const date = searchParams.get("date");

    if (date) {
      setForm((prev) => ({
        ...prev,
        date
      }));
      setFilters((prev) => ({
        ...prev,
        dateFrom: date,
        dateTo: date
      }));
    }

    if (symbol) {
      setForm((prev) => ({
        ...prev,
        symbol: symbol.toUpperCase()
      }));
      updateWorkspaceStatus((prev) => ({ ...prev, selectedSymbol: symbol.toUpperCase() }));
    }
  }, [searchParams, updateWorkspaceStatus]);

  const filteredEntries = useMemo(() => {
    return journalEntries.filter((entry) => {
      if (filters.symbol && !entry.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) return false;
      if (filters.setup && !entry.setup.toLowerCase().includes(filters.setup.toLowerCase())) return false;
      if (filters.side !== "ALL" && entry.side !== filters.side) return false;
      if (filters.timeframe !== "ALL" && entry.timeframe !== filters.timeframe) return false;
      if (filters.errorCategory && !entry.errorCategory.toLowerCase().includes(filters.errorCategory.toLowerCase())) {
        return false;
      }
      if (filters.profitState === "WIN" && Number(entry.resultAmount) <= 0) return false;
      if (filters.profitState === "LOSS" && Number(entry.resultAmount) >= 0) return false;
      if (filters.dateFrom && entry.date < filters.dateFrom) return false;
      if (filters.dateTo && entry.date > filters.dateTo) return false;
      return true;
    });
  }, [filters, journalEntries]);

  const stats = useMemo(() => {
    const trades = filteredEntries.length;
    const wins = filteredEntries.filter((entry) => Number(entry.resultAmount) > 0).length;
    const losses = filteredEntries.filter((entry) => Number(entry.resultAmount) < 0).length;
    const totalResult = filteredEntries.reduce((sum, entry) => sum + Number(entry.resultAmount ?? 0), 0);
    const averageResult = trades > 0 ? totalResult / trades : 0;
    const topSetup = buildTopSetup(filteredEntries);
    const mostCommonError = buildTopSetup(
      filteredEntries.map((entry) => ({ ...entry, setup: entry.errorCategory })).filter((entry) => entry.setup)
    );

    return {
      trades,
      wins,
      losses,
      totalResult,
      averageResult,
      winRate: trades > 0 ? (wins / trades) * 100 : 0,
      expectancyLight: trades > 0 ? averageResult : 0,
      topSetup,
      mostCommonError
    };
  }, [filteredEntries]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.date || !form.symbol.trim()) return;

    const saved = await upsertJournalEntry({
      ...form,
      symbol: form.symbol.trim().toUpperCase()
    });

    setForm((prev) => ({
      ...EMPTY_FORM,
      symbol: prev.symbol
    }));

    updateWorkspaceStatus((prev) => ({
      ...prev,
      selectedSymbol: saved.symbol
    }));
  };

  const startEdit = (entry) => {
    setForm({ ...entry });
  };

  return (
    <div className="journal-shell">
      <header className="journal-topbar">
        <div className="journal-title">
          <BookOpenText size={20} />
          <div>
            <p className="eyebrow">Trade Log</p>
            <h1>Journal</h1>
          </div>
        </div>
        <Link className="btn btn-inline btn-ghost" href="/">
          Challenge bekijken
        </Link>
      </header>

      <main className="journal-grid">
        <section className="journal-main-col">
          <section className="stats-grid journal-stats-grid">
            <article className="card stat-card tone-info">
              <div>
                <p>Trades</p>
                <h4>{stats.trades}</h4>
              </div>
            </article>
            <article className="card stat-card tone-positive">
              <div>
                <p>Winrate</p>
                <h4>{stats.winRate.toFixed(1)}%</h4>
              </div>
            </article>
            <article className="card stat-card tone-default">
              <div>
                <p>Gemiddeld resultaat</p>
                <h4>{formatResult(stats.averageResult, challenge.currency)}</h4>
              </div>
            </article>
            <article className="card stat-card tone-negative">
              <div>
                <p>Top setup</p>
                <h4>{stats.topSetup?.setup || "-"}</h4>
              </div>
            </article>
            <article className="card stat-card tone-default">
              <div>
                <p>Meest gemaakte fout</p>
                <h4>{stats.mostCommonError?.setup || "-"}</h4>
              </div>
            </article>
          </section>

          <section className="card journal-form-card">
            <div className="journal-card-head">
              <h2>
                <PlusCircle size={18} />
                {form.id ? "Trade bijwerken" : "Trade loggen"}
              </h2>
            </div>

            <form className="journal-form" onSubmit={handleSubmit}>
              <div className="journal-form-grid">
                <label>
                  Datum
                  <input type="date" required value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                </label>
                <label>
                  Symbool
                  <input value={form.symbol} onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))} placeholder="BTC" required />
                </label>
                <label>
                  Asset class
                  <select value={form.assetClass} onChange={(event) => setForm((prev) => ({ ...prev, assetClass: event.target.value }))}>
                    <option>Crypto</option>
                    <option>TradFi</option>
                    <option>Commodities</option>
                    <option>Indices</option>
                  </select>
                </label>
                <label>
                  Side
                  <select value={form.side} onChange={(event) => setForm((prev) => ({ ...prev, side: event.target.value }))}>
                    <option>Long</option>
                    <option>Short</option>
                  </select>
                </label>
                <label>
                  Timeframe
                  <select value={form.timeframe} onChange={(event) => setForm((prev) => ({ ...prev, timeframe: event.target.value }))}>
                    <option>1d</option>
                    <option>4h</option>
                    <option>1h</option>
                    <option>15m</option>
                    <option>5m</option>
                  </select>
                </label>
                <label>
                  Setup
                  <input value={form.setup} onChange={(event) => setForm((prev) => ({ ...prev, setup: event.target.value }))} placeholder="Inside Bar Break" />
                </label>
                <label>
                  Confidence (1-5)
                  <input type="number" min="1" max="5" value={form.confidence} onChange={(event) => setForm((prev) => ({ ...prev, confidence: event.target.value }))} />
                </label>
                <label>
                  Resultaat
                  <input type="number" step="0.01" value={form.resultAmount} onChange={(event) => setForm((prev) => ({ ...prev, resultAmount: event.target.value }))} />
                </label>
                <label>
                  Foutcategorie
                  <input value={form.errorCategory} onChange={(event) => setForm((prev) => ({ ...prev, errorCategory: event.target.value }))} placeholder="Te vroeg ingestapt" />
                </label>
                <label>
                  Chart link
                  <input value={form.chartLink} onChange={(event) => setForm((prev) => ({ ...prev, chartLink: event.target.value }))} placeholder="https://..." />
                </label>
              </div>

              <label>
                Notities
                <textarea rows="4" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Wat zag je, wat werkte, wat niet?" />
              </label>

              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {form.id ? "Trade opslaan" : "Trade toevoegen"}
                </button>
                {form.id && (
                  <button className="btn btn-ghost" type="button" onClick={() => setForm(EMPTY_FORM)}>
                    Annuleren
                  </button>
                )}
              </div>
            </form>
          </section>
        </section>

        <aside className="journal-side-col">
          <section className="card journal-filters-card">
            <div className="journal-card-head">
              <h2>
                <Filter size={18} />
                Filters
              </h2>
            </div>
            <div className="journal-filter-grid">
              <label>
                Symbool
                <input value={filters.symbol} onChange={(event) => setFilters((prev) => ({ ...prev, symbol: event.target.value }))} />
              </label>
              <label>
                Setup
                <input value={filters.setup} onChange={(event) => setFilters((prev) => ({ ...prev, setup: event.target.value }))} />
              </label>
              <label>
                Side
                <select value={filters.side} onChange={(event) => setFilters((prev) => ({ ...prev, side: event.target.value }))}>
                  <option value="ALL">Alles</option>
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select>
              </label>
              <label>
                Timeframe
                <select value={filters.timeframe} onChange={(event) => setFilters((prev) => ({ ...prev, timeframe: event.target.value }))}>
                  <option value="ALL">Alles</option>
                  <option value="1d">1d</option>
                  <option value="4h">4h</option>
                  <option value="1h">1h</option>
                  <option value="15m">15m</option>
                  <option value="5m">5m</option>
                </select>
              </label>
              <label>
                Resultaat
                <select value={filters.profitState} onChange={(event) => setFilters((prev) => ({ ...prev, profitState: event.target.value }))}>
                  <option value="ALL">Alles</option>
                  <option value="WIN">Winnaars</option>
                  <option value="LOSS">Verliezers</option>
                </select>
              </label>
              <label>
                Foutcategorie
                <input value={filters.errorCategory} onChange={(event) => setFilters((prev) => ({ ...prev, errorCategory: event.target.value }))} />
              </label>
              <label>
                Vanaf
                <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} />
              </label>
              <label>
                Tot
                <input type="date" value={filters.dateTo} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="card journal-feed-card">
            <div className="journal-card-head between">
              <h2>Trade overzicht</h2>
              <span className="market-muted">{filteredEntries.length} trades</span>
            </div>

            <div className="journal-feed">
              {filteredEntries.length === 0 && <div className="empty-state">Nog geen trades voor deze filters.</div>}
              {filteredEntries.map((entry) => (
                <article key={entry.id} className="journal-entry-card">
                  <div className="journal-entry-head">
                    <div>
                      <strong>{entry.symbol}</strong>
                      <p>{entry.date} • {entry.setup || "Onbenoemde setup"}</p>
                    </div>
                    <div className="journal-entry-actions">
                      <button className="icon-btn" type="button" onClick={() => startEdit(entry)} title="Bewerk trade">
                        <Pencil size={14} />
                      </button>
                      <button className="icon-btn danger" type="button" onClick={() => deleteJournalEntry(entry.id)} title="Verwijder trade">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="journal-entry-meta">
                    <span>{entry.side}</span>
                    <span>{entry.timeframe}</span>
                    <span>{entry.assetClass}</span>
                    <span>Confidence {entry.confidence}/5</span>
                  </div>

                  <div className="journal-entry-foot">
                    <strong className={Number(entry.resultAmount) >= 0 ? "positive" : "negative"}>
                      {formatResult(entry.resultAmount, challenge.currency)}
                    </strong>
                    {entry.errorCategory && <span className="journal-tag danger">{entry.errorCategory}</span>}
                  </div>

                  {entry.notes && <p className="journal-entry-notes">{entry.notes}</p>}
                  {entry.chartLink && (
                    <a className="journal-link" href={entry.chartLink} target="_blank" rel="noreferrer">
                      Chart / screenshot openen
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={<div className="journal-shell"><div className="card journal-form-card">Journal laden...</div></div>}>
      <JournalPageContent />
    </Suspense>
  );
}
