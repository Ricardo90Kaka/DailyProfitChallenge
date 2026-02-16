"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart
} from "recharts";
import {
  TrendingUp,
  Calendar,
  Save,
  Edit2,
  PlusCircle,
  Trash2,
  Target,
  Wallet,
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

const STORAGE_KEY = "daily-profit-challenge:v1";

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

function localDateKey(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

function dateFromInput(dateValue) {
  return new Date(`${dateValue}T00:00:00`);
}

function recalculateProfits(items, startCapital) {
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
  let prev = Number(startCapital) || 0;

  const withProfits = sorted.map((entry) => {
    const accountValue = Number(entry.accountValue);
    const profit = accountValue - prev;
    prev = accountValue;
    return {
      ...entry,
      accountValue,
      profit
    };
  });

  return withProfits;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [viewMode, setViewMode] = useState("currency");
  const [currency, setCurrency] = useState("EUR");
  const [storageReady, setStorageReady] = useState(false);

  const [setupForm, setSetupForm] = useState({
    startCapital: 1000,
    goalType: "percent",
    goalValue: 1,
    startDate: todayInputValue()
  });

  const [entryForm, setEntryForm] = useState({
    date: todayInputValue(),
    accountValue: "",
    notes: "",
    isEditing: false,
    editId: null
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStorageReady(true);
        return;
      }

      const parsed = JSON.parse(raw);
      if (parsed?.config) setConfig(parsed.config);
      if (parsed?.currency) setCurrency(parsed.currency);
      if (Array.isArray(parsed?.entries) && parsed?.config?.startCapital !== undefined) {
        setEntries(recalculateProfits(parsed.entries, parsed.config.startCapital));
      }
    } catch {
      // Ignore local storage corruption and continue with defaults.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          config,
          entries,
          currency
        })
      );
    } catch {
      // Ignore quota/privacy mode failures.
    }
  }, [config, entries, currency, storageReady]);

  const formatVal = (value) => {
    const safeVal = Number(value) || 0;

    if (currency === "BTC") {
      return `₿ ${safeVal.toFixed(8)}`;
    }

    const locale = currency === "EUR" ? "nl-NL" : "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(safeVal);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short"
    });
  };

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [entries]);

  const currentBalance = useMemo(() => {
    if (!config) return 0;
    if (sortedEntries.length === 0) return Number(config.startCapital) || 0;
    return Number(sortedEntries[sortedEntries.length - 1].accountValue) || 0;
  }, [config, sortedEntries]);

  const yAxisDomain = useMemo(() => {
    if (!config) return [0, "auto"];
    const values = [Number(config.startCapital), ...entries.map((e) => Number(e.accountValue))];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.floor(min * 0.98), Math.ceil(max * 1.02)];
  }, [config, entries]);

  const progressData = useMemo(() => {
    if (!config) return [];

    let projectedBalance = Number(config.startCapital) || 0;
    const data = [];

    const entryMap = new Map();
    sortedEntries.forEach((e) => entryMap.set(e.date, Number(e.accountValue)));

    const startDate = new Date(config.startDate);
    const lastEntryDate =
      sortedEntries.length > 0 ? new Date(sortedEntries[sortedEntries.length - 1].date) : new Date();

    const endDate = new Date(lastEntryDate);
    endDate.setDate(endDate.getDate() + 365);

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = localDateKey(currentDate);
      const actualValue = entryMap.get(dateStr);

      if (config.goalType === "percent") {
        projectedBalance = projectedBalance * (1 + Number(config.goalValue) / 100);
      } else {
        projectedBalance += Number(config.goalValue);
      }

      data.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        actual: actualValue !== undefined ? actualValue : null,
        projected: projectedBalance
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  }, [config, sortedEntries]);

  const weeklyProgress = useMemo(() => {
    if (!config) {
      return {
        percent: 0,
        baseline: 0,
        currentAccount: 0,
        targetAccount: 0,
        currentGain: 0,
        targetGain: 0
      };
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const weekStart = new Date(todayStart);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(todayStart.getDate() + diffToMonday);

    const challengeStart = dateFromInput(config.startDate);
    const activeStart = challengeStart > weekStart ? challengeStart : weekStart;

    if (activeStart > todayStart) {
      const baselineFuture = Number(config.startCapital);
      return {
        percent: 0,
        baseline: baselineFuture,
        currentAccount: baselineFuture,
        targetAccount: baselineFuture,
        currentGain: 0,
        targetGain: 0
      };
    }

    const prevBeforeActiveStart = [...sortedEntries]
      .reverse()
      .find((entry) => dateFromInput(entry.date) < activeStart);

    const baseline = prevBeforeActiveStart
      ? Number(prevBeforeActiveStart.accountValue)
      : Number(config.startCapital);

    const latestUpToToday = [...sortedEntries]
      .reverse()
      .find((entry) => dateFromInput(entry.date) <= todayStart);

    const currentAccount = latestUpToToday ? Number(latestUpToToday.accountValue) : baseline;
    const currentGain = currentAccount - baseline;
    let targetAccount = baseline;

    if (config.goalType === "percent") {
      targetAccount = baseline * Math.pow(1 + Number(config.goalValue) / 100, 7);
    } else {
      targetAccount = baseline + Number(config.goalValue) * 7;
    }

    const targetGain = targetAccount - baseline;
    const rawPercent = targetGain !== 0 ? (currentGain / targetGain) * 100 : 0;
    return {
      percent: Number.isFinite(rawPercent) ? rawPercent : 0,
      baseline,
      currentAccount,
      targetAccount,
      currentGain,
      targetGain
    };
  }, [config, sortedEntries]);

  const resetEntryForm = () => {
    setEntryForm({
      date: todayInputValue(),
      accountValue: "",
      notes: "",
      isEditing: false,
      editId: null
    });
  };

  const handleStartChallenge = () => {
    setConfig({ ...setupForm });
    setEntries([]);
    resetEntryForm();
  };

  const handleAddEntry = (e) => {
    e.preventDefault();
    if (!entryForm.date || entryForm.accountValue === "") return;

    const newEntry = {
      id: entryForm.isEditing ? entryForm.editId : Date.now(),
      date: entryForm.date,
      accountValue: Number(entryForm.accountValue),
      notes: entryForm.notes
    };

    let nextEntries;

    if (entryForm.isEditing) {
      nextEntries = entries.map((en) => (en.id === entryForm.editId ? newEntry : en));
    } else {
      const existingIndex = entries.findIndex((en) => en.date === newEntry.date);
      if (existingIndex >= 0) {
        nextEntries = [...entries];
        nextEntries[existingIndex] = { ...newEntry, id: nextEntries[existingIndex].id };
      } else {
        nextEntries = [...entries, newEntry];
      }
    }

    setEntries(recalculateProfits(nextEntries, config.startCapital));
    resetEntryForm();
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

  const handleDeleteEntry = (id) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(recalculateProfits(next, config.startCapital));
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({ config, entries, currency }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trading_data.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result);
        if (data.config && Array.isArray(data.entries)) {
          setConfig(data.config);
          setEntries(recalculateProfits(data.entries, data.config.startCapital));
          if (data.currency) setCurrency(data.currency);
          resetEntryForm();
        }
      } catch {
        alert("Fout bij laden");
      }
    };
    reader.readAsText(file);
  };

  if (!config) {
    return (
      <div className="setup-shell">
        <div className="bg-shape shape-a" />
        <div className="bg-shape shape-b" />
        <div className="setup-card">
          <div className="brand-row">
            <div className="brand-badge">
              <TrendingUp size={30} />
            </div>
            <div>
              <p className="eyebrow">Performance Journal</p>
              <h1>Daily Profit Challenge</h1>
            </div>
          </div>

          <div className="setup-grid">
            <label>
              Startkapitaal
              <input
                type="number"
                value={setupForm.startCapital}
                onChange={(e) => setSetupForm({ ...setupForm, startCapital: e.target.value })}
              />
            </label>

            <label>
              Valuta
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
                onChange={(e) => setSetupForm({ ...setupForm, startDate: e.target.value })}
              />
            </label>

            <label>
              Doeltype
              <select
                value={setupForm.goalType}
                onChange={(e) => setSetupForm({ ...setupForm, goalType: e.target.value })}
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
                onChange={(e) => setSetupForm({ ...setupForm, goalValue: e.target.value })}
              />
            </label>
          </div>

          <div className="setup-actions">
            <button className="btn btn-primary" onClick={handleStartChallenge}>
              Start Challenge
            </button>
            <label className="import-link">
              Importeer JSON
              <input type="file" onChange={handleImport} accept=".json" hidden />
            </label>
          </div>
        </div>
      </div>
    );
  }

  const totalGrowth = currentBalance - Number(config.startCapital);
  const growthPercent = ((totalGrowth / Number(config.startCapital)) * 100).toFixed(2);

  return (
    <div className="dashboard-shell">
      <div className="bg-shape shape-a" />
      <div className="bg-shape shape-c" />

      <header className="topbar">
        <div className="topbar-title">
          <TrendingUp size={20} />
          <span>Daily Profit Challenge</span>
        </div>

        <div className="topbar-actions">
          <button className="icon-btn" onClick={handleExport} title="Exporteer Gegevens">
            <Save size={18} />
          </button>
          <button className="btn btn-ghost" onClick={() => setConfig(null)}>
            Reset
          </button>
        </div>
      </header>

      <main className="content-grid">
        <section className="main-column">
          <section className="stats-grid">
            <StatCard title="Account Balans" value={formatVal(currentBalance)} icon={Wallet}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="currency-select">
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="BTC">BTC</option>
              </select>
            </StatCard>

            <StatCard
              title="Totale Winst"
              value={formatVal(totalGrowth)}
              icon={Activity}
              tone={totalGrowth >= 0 ? "positive" : "negative"}
            />

            <StatCard title="Groei" value={`${growthPercent}%`} icon={Target} tone="info" />
          </section>

          <section className={`card form-card ${entryForm.isEditing ? "editing" : ""}`}>
            <h3>
              {entryForm.isEditing ? <Edit2 size={18} /> : <PlusCircle size={18} />}
              {entryForm.isEditing ? "Resultaat Wijzigen" : "Dagelijks Resultaat Vastleggen"}
            </h3>

            <form onSubmit={handleAddEntry} className="entry-form">
              <div className="form-row">
                <label>
                  Datum
                  <input
                    type="date"
                    required
                    value={entryForm.date}
                    onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                  />
                </label>

                <label>
                  Accountwaarde ({currency === "BTC" ? "₿" : currency === "EUR" ? "€" : "$"})
                  <input
                    type="number"
                    step="0.00000001"
                    required
                    placeholder="Nieuwe balans"
                    value={entryForm.accountValue}
                    onChange={(e) => setEntryForm({ ...entryForm, accountValue: e.target.value })}
                  />
                </label>
              </div>

              <label>
                Notities
                <input
                  type="text"
                  placeholder="Strategie, emoties of fouten"
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {entryForm.isEditing ? "Update Opslaan" : "Resultaat Opslaan"}
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
              <strong className={weeklyProgress.percent >= 0 ? "positive" : "negative"}>
                {weeklyProgress.percent.toFixed(1)}%
              </strong>
            </div>
            <div className="progress-track bidirectional">
              <div className="progress-center" />
              <div
                className="progress-fill-positive"
                style={{ width: `calc(${Math.min(100, Math.max(0, weeklyProgress.percent))}% / 2)` }}
              />
              <div
                className="progress-fill-negative"
                style={{ width: `calc(${Math.min(100, Math.max(0, -weeklyProgress.percent))}% / 2)` }}
              />
            </div>
            <div className="weekly-meta">
              <span>Weekstart: {formatVal(weeklyProgress.baseline)}</span>
              <span>Huidige stand: {formatVal(weeklyProgress.currentAccount)}</span>
              <span>Weekdoel: {formatVal(weeklyProgress.targetAccount)}</span>
            </div>
          </section>

          <section className="card chart-card">
            <h3>Groei Curve & Prognose</h3>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273450" vertical={false} />
                  <XAxis dataKey="displayDate" stroke="#8ea6c9" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="#8ea6c9"
                    tick={{ fontSize: 11 }}
                    domain={yAxisDomain}
                    tickFormatter={(v) =>
                      currency === "BTC" ? `₿${Number(v).toFixed(4)}` : `${currency === "EUR" ? "€" : "$"}${Math.round(v)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1827",
                      borderColor: "#243249",
                      borderRadius: "10px"
                    }}
                    formatter={(v) => [formatVal(Math.round(Number(v) * 100) / 100), ""]}
                  />
                  <Area type="monotone" dataKey="actual" stroke="#00c48c" fill="#00c48c" fillOpacity={0.15} strokeWidth={3} connectNulls />
                  <Line type="monotone" dataKey="projected" stroke="#60a5fa" strokeDasharray="7 6" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card heatmap-card">
            <MonthlyHeatmap entries={entries} viewMode={viewMode} setViewMode={setViewMode} currency={currency} onEdit={handleEdit} />
          </section>
        </section>

        <aside className="log-column">
          <section className="card log-card">
            <div className="log-header">
              <FileText size={16} />
              <span>Logboek</span>
            </div>

            <div className="log-list">
              {sortedEntries
                .slice()
                .reverse()
                .map((entry) => (
                  <article key={entry.id} className="log-item">
                    <div className="log-item-head">
                      <span>{formatDate(entry.date)}</span>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => handleEdit(entry)} title="Wijzig">
                          <Edit2 size={14} />
                        </button>
                        <button className="icon-btn danger" onClick={() => handleDeleteEntry(entry.id)} title="Verwijder">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="log-item-values">
                      <small>Balans: {formatVal(entry.accountValue)}</small>
                      <strong className={entry.profit >= 0 ? "positive" : "negative"}>
                        {entry.profit >= 0 ? "+" : ""}
                        {formatVal(entry.profit)}
                      </strong>
                    </div>

                    {entry.notes && <p className="log-note">{entry.notes}</p>}
                  </article>
                ))}

              {entries.length === 0 && <div className="empty-state">Nog geen data ingevoerd</div>}
            </div>
          </section>
        </aside>
      </main>
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

function MonthlyHeatmap({ entries, viewMode, setViewMode, currency, onEdit }) {
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

  const changeMonth = (delta) => {
    const d = new Date(currentViewDate);
    d.setMonth(d.getMonth() + delta);
    setCurrentViewDate(d);
  };

  const getDayData = (date) => {
    if (!date) return null;
    const s = localDateKey(date);
    return entries.find((e) => e.date === s);
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
            <button className="icon-btn" onClick={() => changeMonth(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" onClick={() => changeMonth(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="segmented-control">
          <button
            onClick={() => setViewMode("currency")}
            className={viewMode === "currency" ? "active" : ""}
          >
            {currency}
          </button>
          <button
            onClick={() => setViewMode("percent")}
            className={viewMode === "percent" ? "active" : ""}
          >
            %
          </button>
        </div>
      </div>

      <div className="weekday-row">
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="heatmap-grid">
        {days.map((date, i) => {
          const data = getDayData(date);

          let moodClass = "neutral";
          if (data) {
            if (data.profit > 0) moodClass = "profit";
            if (data.profit < 0) moodClass = "loss";
            if (data.profit === 0) moodClass = "flat";
          }

          const baseForPercent = data ? data.accountValue - data.profit : 0;
          const percent = baseForPercent !== 0 ? ((data.profit / baseForPercent) * 100).toFixed(1) : "0.0";

          const displayVal = data
            ? viewMode === "currency"
              ? currency === "BTC"
                ? `₿${Number(data.profit).toFixed(4)}`
                : `${currency === "EUR" ? "€" : "$"}${Math.round(data.profit)}`
              : `${percent}%`
            : "";

          return (
            <div key={i} className={`day-cell ${moodClass} ${!date ? "ghost" : ""}`}>
              {date && (
                <>
                  <span className="day-number">{date.getDate()}</span>
                  <span className="day-value">{displayVal}</span>

                  {data && (
                    <button
                      className="mini-edit"
                      onClick={(e) => {
                        e.stopPropagation();
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
