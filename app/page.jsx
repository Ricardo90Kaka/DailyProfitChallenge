"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpenText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FileText,
  PlusCircle,
  Save,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  Wallet
} from "lucide-react";
import PerformanceChartPanel from "../components/challenge/PerformanceChartPanel";
import DayDetailDrawer from "../components/challenge/DayDetailDrawer";
import { useAppData } from "../components/AppDataProvider";
import {
  buildDailyPnlSeries,
  buildDrawdownSeries,
  buildEquitySeries,
  buildProjectionData,
  calculateChallengeKpis,
  calculateWeeklyProgress,
  computeYAxisDomain,
  journalEntriesForDate,
  localDateKey,
  recalculateChallengeEntries,
  todayInputValue
} from "../lib/challenge-utils";

const defaultSetupForm = () => ({
  startCapital: 1000,
  goalType: "percent",
  goalValue: 1,
  startDate: todayInputValue()
});

const defaultEntryForm = () => ({
  date: todayInputValue(),
  accountValue: "",
  notes: "",
  isEditing: false,
  editId: null
});

function formatCurrency(currency, value) {
  const numeric = Number(value ?? 0);
  if (currency === "BTC") return `₿ ${numeric.toFixed(8)}`;
  return new Intl.NumberFormat(currency === "EUR" ? "nl-NL" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(numeric);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function buildExportPayload(workspace) {
  return {
    exportedAt: new Date().toISOString(),
    challenge: workspace.challenge,
    journalEntries: workspace.journalEntries,
    watchlist: workspace.watchlist,
    alertRecords: workspace.alertRecords
  };
}

export default function App() {
  const {
    challenge,
    workspace,
    journalEntries,
    saveChallenge,
    saveChallengeSetup,
    replaceChallengeEntries,
    resetChallenge,
    updateWorkspaceStatus
  } = useAppData();

  const [setupForm, setSetupForm] = useState(defaultSetupForm());
  const [setupCurrency, setSetupCurrency] = useState("EUR");
  const [setupMode, setSetupMode] = useState(null);
  const [entryForm, setEntryForm] = useState(defaultEntryForm());
  const [viewMode, setViewMode] = useState("currency");
  const [chartMode, setChartMode] = useState("projection");
  const [projectionRange, setProjectionRange] = useState("year");
  const [selectedDay, setSelectedDay] = useState(null);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    if (challenge.config) {
      setSetupForm({
        startCapital: challenge.config.startCapital,
        goalType: challenge.config.goalType,
        goalValue: challenge.config.goalValue,
        startDate: challenge.config.startDate
      });
    }
    setSetupCurrency(challenge.currency ?? "EUR");
  }, [challenge.config, challenge.currency]);

  const sortedEntries = useMemo(
    () => [...(challenge.entries ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [challenge.entries]
  );

  const kpis = useMemo(
    () => calculateChallengeKpis(challenge.config, sortedEntries),
    [challenge.config, sortedEntries]
  );
  const weeklyProgress = useMemo(
    () => calculateWeeklyProgress(challenge.config, sortedEntries),
    [challenge.config, sortedEntries]
  );
  const yAxisDomain = useMemo(
    () => computeYAxisDomain(challenge.config, sortedEntries),
    [challenge.config, sortedEntries]
  );

  const projectionData = useMemo(() => {
    return buildProjectionData(challenge.config, sortedEntries, projectionRange).map((point) => ({
      ...point,
      displayDate: formatDate(point.date)
    }));
  }, [challenge.config, projectionRange, sortedEntries]);

  const equityData = useMemo(
    () => buildEquitySeries(challenge.config, sortedEntries).map((point) => ({ ...point, displayDate: formatDate(point.date) })),
    [challenge.config, sortedEntries]
  );
  const pnlData = useMemo(
    () => buildDailyPnlSeries(sortedEntries).map((point) => ({ ...point, displayDate: formatDate(point.date) })),
    [sortedEntries]
  );
  const drawdownData = useMemo(
    () => buildDrawdownSeries(challenge.config, sortedEntries).map((point) => ({ ...point, displayDate: formatDate(point.date) })),
    [challenge.config, sortedEntries]
  );

  useEffect(() => {
    updateWorkspaceStatus((prev) => ({
      ...prev,
      challengeEquity: kpis.currentBalance
    }));
  }, [kpis.currentBalance, updateWorkspaceStatus]);

  const resetEntryForm = () => {
    setEntryForm(defaultEntryForm());
  };

  const goalWarning = useMemo(() => {
    const goalValue = Number(setupForm.goalValue ?? 0);
    const startCapital = Number(setupForm.startCapital ?? 0);
    if (setupForm.goalType === "percent" && goalValue > 10) {
      return "Een dagdoel boven 10% maakt de projectie snel onrealistisch. Controleer of dit echt je intentie is.";
    }
    if (setupForm.goalType === "fixed" && startCapital > 0 && goalValue > startCapital * 0.2) {
      return "Dit vaste dagdoel is groot ten opzichte van je startkapitaal. De challenge blijft werken, maar de prognose wordt agressief.";
    }
    return "";
  }, [setupForm]);

  const activeSetupMode = challenge.config ? setupMode : "initial";
  const isSettingsMode = activeSetupMode === "edit";
  const showSetupScreen = activeSetupMode !== null;

  const handleSaveSetup = async () => {
    await saveChallengeSetup({ ...setupForm }, setupCurrency, activeSetupMode === "initial");
    resetEntryForm();
    if (isSettingsMode) {
      setSetupMode(null);
    }
  };

  const openSettings = () => {
    if (!challenge.config) return;

    setSetupForm({
      startCapital: challenge.config.startCapital,
      goalType: challenge.config.goalType,
      goalValue: challenge.config.goalValue,
      startDate: challenge.config.startDate
    });
    setSetupCurrency(challenge.currency ?? "EUR");
    setImportError("");
    setSetupMode("edit");
  };

  const closeSettings = () => {
    setSetupMode(null);
    setImportError("");
    if (challenge.config) {
      setSetupForm({
        startCapital: challenge.config.startCapital,
        goalType: challenge.config.goalType,
        goalValue: challenge.config.goalValue,
        startDate: challenge.config.startDate
      });
      setSetupCurrency(challenge.currency ?? "EUR");
    }
  };

  const handleAddEntry = async (event) => {
    event.preventDefault();
    if (!entryForm.date || entryForm.accountValue === "") return;

    const newEntry = {
      id: entryForm.isEditing ? entryForm.editId : crypto.randomUUID(),
      date: entryForm.date,
      accountValue: Number(entryForm.accountValue),
      notes: entryForm.notes
    };

    let nextEntries;
    if (entryForm.isEditing) {
      nextEntries = sortedEntries.map((entry) => (entry.id === entryForm.editId ? newEntry : entry));
    } else {
      const existingIndex = sortedEntries.findIndex((entry) => entry.date === newEntry.date);
      if (existingIndex >= 0) {
        nextEntries = [...sortedEntries];
        nextEntries[existingIndex] = { ...newEntry, id: nextEntries[existingIndex].id };
      } else {
        nextEntries = [...sortedEntries, newEntry];
      }
    }

    await replaceChallengeEntries(nextEntries);
    resetEntryForm();
  };

  const handleDeleteEntry = async (id) => {
    const nextEntries = sortedEntries.filter((entry) => entry.id !== id);
    await replaceChallengeEntries(nextEntries);
  };

  const handleEdit = (entry) => {
    setEntryForm({
      date: entry.date,
      accountValue: String(entry.accountValue),
      notes: entry.notes || "",
      isEditing: true,
      editId: entry.id
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleExport = () => {
    const payload = buildExportPayload(workspace);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dpc-workspace.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const data = JSON.parse(loadEvent.target?.result);
        if (data.challenge?.config) {
          const normalizedEntries = recalculateChallengeEntries(data.challenge.entries ?? [], data.challenge.config.startCapital);
          await saveChallenge({
            config: data.challenge.config,
            currency: data.challenge.currency ?? challenge.currency,
            entries: normalizedEntries
          });
        } else if (data.config) {
          const normalizedEntries = recalculateChallengeEntries(data.entries ?? [], data.config.startCapital);
          await saveChallenge({
            config: data.config,
            currency: data.currency ?? challenge.currency,
            entries: normalizedEntries
          });
        }
      } catch {
        setImportError("Het importbestand kon niet worden gelezen.");
      }
    };
    reader.readAsText(file);
  };

  const selectedDayEntry = selectedDay ? sortedEntries.find((entry) => entry.date === selectedDay) ?? null : null;
  const selectedDayTrades = selectedDay ? journalEntriesForDate(journalEntries, selectedDay) : [];

  if (showSetupScreen) {
    return (
      <div className="setup-shell workspace-page-shell">
        <div className="bg-shape shape-a" />
        <div className="bg-shape shape-b" />
        <div className="setup-card">
          <div className="brand-row">
            <div className="brand-badge">
              <TrendingUp size={30} />
            </div>
            <div>
              <p className="eyebrow">{isSettingsMode ? "Challenge Settings" : "Performance Workspace"}</p>
              <h1>{isSettingsMode ? "Werk je challenge-instellingen bij" : "Daily Profit Challenge"}</h1>
            </div>
          </div>

          <div className="setup-grid">
            <label>
              Startkapitaal
              <input
                type="number"
                value={setupForm.startCapital}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, startCapital: event.target.value }))}
              />
            </label>

            <label>
              Valuta
              <select value={setupCurrency} onChange={(event) => setSetupCurrency(event.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="BTC">BTC</option>
              </select>
            </label>

            <label>
              Startdatum
              <input
                type="date"
                value={setupForm.startDate}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </label>

            <label>
              Doeltype
              <select
                value={setupForm.goalType}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, goalType: event.target.value }))}
              >
                <option value="percent">% per dag</option>
                <option value="fixed">Vast bedrag per dag</option>
              </select>
            </label>

            <label>
              Dagdoel
              <input
                type="number"
                step="0.1"
                value={setupForm.goalValue}
                onChange={(event) => setSetupForm((prev) => ({ ...prev, goalValue: event.target.value }))}
              />
            </label>
          </div>

          {goalWarning && (
            <div className="inline-warning">
              <AlertTriangle size={16} />
              <span>{goalWarning}</span>
            </div>
          )}

          {importError && (
            <div className="inline-warning">
              <AlertTriangle size={16} />
              <span>{importError}</span>
            </div>
          )}

          <div className="setup-actions">
            <button className="btn btn-primary" type="button" onClick={handleSaveSetup}>
              {isSettingsMode ? "Instellingen opslaan" : "Start Challenge"}
            </button>
            {isSettingsMode && (
              <button className="btn btn-ghost" type="button" onClick={closeSettings}>
                Annuleren
              </button>
            )}
            <label className="import-link">
              Importeer JSON
              <input type="file" onChange={handleImport} accept=".json" hidden />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell workspace-page-shell">
      <div className="bg-shape shape-a" />
      <div className="bg-shape shape-c" />

      <header className="topbar">
        <div className="topbar-title">
          <TrendingUp size={20} />
          <span>Challenge</span>
        </div>

        <div className="topbar-actions">
          <Link className="btn btn-inline btn-ghost" href="/journal">
            <BookOpenText size={14} />
            Open Journal
          </Link>
          <button className="icon-btn" onClick={handleExport} title="Exporteer workspace">
            <Save size={18} />
          </button>
          <label className="btn btn-inline btn-ghost">
            Import
            <input type="file" onChange={handleImport} accept=".json" hidden />
          </label>
          <button className="btn btn-inline btn-ghost" type="button" onClick={openSettings}>
            <Settings2 size={14} />
            Settings
          </button>
          <button
            className="btn btn-inline btn-ghost btn-danger-soft"
            type="button"
            onClick={() => {
              if (window.confirm("Weet je zeker dat je de challenge wilt resetten?")) {
                resetChallenge();
              }
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {importError && (
        <div className="inline-warning workspace-inline-warning">
          <AlertTriangle size={16} />
          <span>{importError}</span>
        </div>
      )}

      <main className="content-grid">
        <section className="main-column">
          <section className="stats-grid challenge-kpi-grid">
            <StatCard title="Account Balans" value={formatCurrency(challenge.currency, kpis.currentBalance)} icon={Wallet} />
            <StatCard title="Weekresultaat" value={formatCurrency(challenge.currency, kpis.weekResult)} icon={Activity} tone={kpis.weekResult >= 0 ? "positive" : "negative"} />
            <StatCard title="Maandresultaat" value={formatCurrency(challenge.currency, kpis.monthResult)} icon={Target} tone={kpis.monthResult >= 0 ? "positive" : "negative"} />
            <StatCard title="Totale return" value={`${kpis.totalReturnPct.toFixed(2)}%`} icon={TrendingUp} tone={kpis.totalReturnPct >= 0 ? "positive" : "negative"} />
            <StatCard title="Max drawdown" value={`${kpis.maxDrawdownPct.toFixed(2)}%`} icon={Activity} tone="negative" />
            <StatCard title="Gem. dagreturn" value={`${kpis.averageDayReturnPct.toFixed(2)}%`} icon={Target} tone="info" />
            <StatCard title="Win streak" value={`${kpis.currentWinStreak} / ${kpis.longestWinStreak}`} icon={TrendingUp} tone="positive" />
            <StatCard title="Loss streak" value={`${kpis.currentLossStreak} / ${kpis.longestLossStreak}`} icon={Activity} tone="negative" />
          </section>

          <section className={`card form-card ${entryForm.isEditing ? "editing" : ""}`}>
            <div className="journal-card-head between">
              <h3>
                {entryForm.isEditing ? <Edit2 size={18} /> : <PlusCircle size={18} />}
                {entryForm.isEditing ? "Dagresultaat wijzigen" : "Dagresultaat vastleggen"}
              </h3>
              <Link className="btn btn-inline btn-ghost" href={`/journal?date=${todayInputValue()}`}>
                Trade loggen
              </Link>
            </div>

            <form onSubmit={handleAddEntry} className="entry-form">
              <div className="form-row">
                <label>
                  Datum
                  <input
                    type="date"
                    required
                    value={entryForm.date}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, date: event.target.value }))}
                  />
                </label>

                <label>
                  Accountwaarde ({challenge.currency === "BTC" ? "₿" : challenge.currency === "EUR" ? "€" : "$"})
                  <input
                    type="number"
                    step="0.00000001"
                    required
                    placeholder="Nieuwe balans"
                    value={entryForm.accountValue}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, accountValue: event.target.value }))}
                  />
                </label>
              </div>

              <label>
                Notities
                <input
                  type="text"
                  placeholder="Strategie, emoties of fouten"
                  value={entryForm.notes}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {entryForm.isEditing ? "Update opslaan" : "Resultaat opslaan"}
                </button>
                {entryForm.isEditing && (
                  <button type="button" className="btn btn-ghost" onClick={resetEntryForm}>
                    Annuleren
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="card weekly-card">
            <div className="weekly-head">
              <h3>Weekelijkse voortgang</h3>
              <strong className={weeklyProgress.percent >= 0 ? "positive" : "negative"}>{weeklyProgress.percent.toFixed(1)}%</strong>
            </div>
            <div className="progress-track bidirectional">
              <div className="progress-center" />
              <div className="progress-fill-positive" style={{ width: `calc(${Math.min(100, Math.max(0, weeklyProgress.percent))}% / 2)` }} />
              <div className="progress-fill-negative" style={{ width: `calc(${Math.min(100, Math.max(0, -weeklyProgress.percent))}% / 2)` }} />
            </div>
            <div className="weekly-meta">
              <span>Weekstart: {formatCurrency(challenge.currency, weeklyProgress.baseline)}</span>
              <span>Huidige stand: {formatCurrency(challenge.currency, weeklyProgress.currentAccount)}</span>
              <span>Weekdoel: {formatCurrency(challenge.currency, weeklyProgress.targetAccount)}</span>
            </div>
          </section>

          <PerformanceChartPanel
            chartMode={chartMode}
            setChartMode={setChartMode}
            projectionRange={projectionRange}
            setProjectionRange={setProjectionRange}
            progressData={projectionData}
            equityData={equityData}
            pnlData={pnlData}
            drawdownData={drawdownData}
            yAxisDomain={yAxisDomain}
            currency={challenge.currency}
            formatVal={(value) => formatCurrency(challenge.currency, value)}
            formatDate={formatDate}
          />

          <section className="card heatmap-card">
            <MonthlyHeatmap
              entries={sortedEntries}
              viewMode={viewMode}
              setViewMode={setViewMode}
              currency={challenge.currency}
              onEdit={handleEdit}
              onSelectDate={setSelectedDay}
            />
          </section>
        </section>

        <aside className="log-column">
          <section className="card log-card">
            <div className="log-header">
              <FileText size={16} />
              <span>Challenge Logboek</span>
            </div>

            <div className="log-list">
              {sortedEntries.length === 0 && <div className="empty-state">Nog geen data ingevoerd</div>}
              {sortedEntries
                .slice()
                .reverse()
                .map((entry) => (
                  <article key={entry.id} className="log-item clickable" onClick={() => setSelectedDay(entry.date)}>
                    <div className="log-item-head">
                      <span>{formatDate(entry.date)}</span>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={(event) => { event.stopPropagation(); handleEdit(entry); }} title="Wijzig dagresultaat">
                          <Edit2 size={14} />
                        </button>
                        <button className="icon-btn danger" onClick={(event) => { event.stopPropagation(); handleDeleteEntry(entry.id); }} title="Verwijder dagresultaat">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="log-item-values">
                      <small>Balans: {formatCurrency(challenge.currency, entry.accountValue)}</small>
                      <strong className={entry.profit >= 0 ? "positive" : "negative"}>{formatCurrency(challenge.currency, entry.profit)}</strong>
                    </div>

                    <div className="log-item-subline">
                      <span>{entry.dayReturnPct.toFixed(2)}%</span>
                      <Link className="log-link" href={`/journal?date=${entry.date}`} onClick={(event) => event.stopPropagation()}>
                        Bekijk trades
                      </Link>
                    </div>

                    {entry.notes && <p className="log-note">{entry.notes}</p>}
                  </article>
                ))}
            </div>
          </section>
        </aside>
      </main>

      <DayDetailDrawer
        open={Boolean(selectedDay)}
        date={selectedDay}
        entry={selectedDayEntry}
        journalEntries={selectedDayTrades}
        formatVal={(value) => formatCurrency(challenge.currency, value)}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone = "default", children }) {
  return (
    <article className={`card stat-card tone-${tone}`}>
      <div>
        <p>{title}</p>
        <h4>{value}</h4>
      </div>

      <div className="stat-side">
        <Icon size={22} />
        {children}
      </div>
    </article>
  );
}

function MonthlyHeatmap({ entries, viewMode, setViewMode, currency, onEdit, onSelectDate }) {
  const [currentViewDate, setCurrentViewDate] = useState(new Date());

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const monthName = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(currentViewDate);

  const days = [];
  for (let i = 0; i < offset; i += 1) days.push(null);
  for (let i = 1; i <= daysInMonth; i += 1) days.push(new Date(year, month, i));

  const getDayData = (date) => {
    if (!date) return null;
    const key = localDateKey(date);
    return entries.find((entry) => entry.date === key) ?? null;
  };

  return (
    <div>
      <div className="heatmap-head">
        <div className="month-nav">
          <h3>
            <Calendar size={18} />
            {monthName}
          </h3>
          <div className="month-nav-buttons">
            <button className="icon-btn" onClick={() => setCurrentViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" onClick={() => setCurrentViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="segmented-control">
          <button onClick={() => setViewMode("currency")} className={viewMode === "currency" ? "active" : ""}>
            {currency}
          </button>
          <button onClick={() => setViewMode("percent")} className={viewMode === "percent" ? "active" : ""}>
            %
          </button>
        </div>
      </div>

      <div className="weekday-row">
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="heatmap-grid">
        {days.map((date, index) => {
          const data = getDayData(date);
          const baseForPercent = data ? data.accountValue - data.profit : 0;
          const percent = baseForPercent !== 0 ? ((data.profit / baseForPercent) * 100).toFixed(1) : "0.0";

          let moodClass = "neutral";
          if (data) {
            if (data.profit > 0) moodClass = "profit";
            if (data.profit < 0) moodClass = "loss";
            if (data.profit === 0) moodClass = "flat";
          }

          const displayVal = data
            ? viewMode === "currency"
              ? currency === "BTC"
                ? `₿${Number(data.profit).toFixed(4)}`
                : `${currency === "EUR" ? "€" : "$"}${Math.round(data.profit)}`
              : `${percent}%`
            : "";

          return (
            <div
              key={index}
              className={`day-cell ${moodClass} ${!date ? "ghost" : ""}`}
              onClick={() => data && onSelectDate?.(data.date)}
            >
              {date && (
                <>
                  <span className="day-number">{date.getDate()}</span>
                  <span className="day-value">{displayVal}</span>
                  {data && (
                    <button
                      className="mini-edit"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(data);
                      }}
                    >
                      <Edit2 size={10} />
                    </button>
                  )}
                  {data?.notes && <div className="note-tooltip">{data.notes}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
