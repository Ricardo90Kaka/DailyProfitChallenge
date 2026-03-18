"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#0f1827",
  border: "1px solid #243249",
  borderRadius: "10px"
};

function formatAxisValue(currency, value) {
  const numeric = Number(value ?? 0);
  if (currency === "BTC") return `₿${numeric.toFixed(4)}`;
  return `${currency === "EUR" ? "€" : "$"}${Math.round(numeric)}`;
}

export default function PerformanceChartPanel({
  chartMode,
  setChartMode,
  projectionRange,
  setProjectionRange,
  progressData,
  equityData,
  pnlData,
  drawdownData,
  yAxisDomain,
  currency,
  formatVal,
  formatDate
}) {
  const renderProjection = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={progressData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#273450" vertical={false} />
        <XAxis dataKey="displayDate" stroke="#8ea6c9" tick={{ fontSize: 11 }} />
        <YAxis
          stroke="#8ea6c9"
          tick={{ fontSize: 11 }}
          domain={yAxisDomain}
          tickFormatter={(value) => formatAxisValue(currency, value)}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          formatter={(value) => [formatVal(value), ""]}
        />
        <Area type="monotone" dataKey="actual" stroke="#00c48c" fill="#00c48c" fillOpacity={0.15} strokeWidth={3} connectNulls />
        <Line type="monotone" dataKey="projected" stroke="#60a5fa" strokeDasharray="7 6" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderEquity = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={equityData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#273450" vertical={false} />
        <XAxis dataKey="displayDate" stroke="#8ea6c9" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8ea6c9" tick={{ fontSize: 11 }} tickFormatter={(value) => formatAxisValue(currency, value)} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} formatter={(value) => [formatVal(value), "Equity"]} />
        <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} strokeWidth={3} />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderPnl = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={pnlData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#273450" vertical={false} />
        <XAxis dataKey="displayDate" stroke="#8ea6c9" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8ea6c9" tick={{ fontSize: 11 }} tickFormatter={(value) => formatAxisValue(currency, value)} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          formatter={(value, name) => [name === "profit" ? formatVal(value) : `${Number(value).toFixed(2)}%`, name === "profit" ? "Dagresultaat" : "Dagreturn"]}
        />
        <Bar dataKey="profit" radius={[6, 6, 0, 0]} fill="#22c55e" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderDrawdown = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={drawdownData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#273450" vertical={false} />
        <XAxis dataKey="displayDate" stroke="#8ea6c9" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8ea6c9" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} formatter={(value) => [`${Number(value).toFixed(2)}%`, "Drawdown"]} />
        <Area type="monotone" dataKey="drawdownPct" stroke="#ef4444" fill="#ef4444" fillOpacity={0.18} strokeWidth={3} />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const dataRenderer = {
    projection: renderProjection,
    equity: renderEquity,
    pnl: renderPnl,
    drawdown: renderDrawdown
  };

  return (
    <section className="card chart-card">
      <div className="chart-head chart-head-stack">
        <div className="chart-title-stack">
          <h3>Groei Curve & Analyse</h3>
          <p className="market-muted">
            Bekijk projectie, equity, dagelijks resultaat en drawdown zonder de challenge-flow te verlaten.
          </p>
        </div>

        <div className="chart-toolbar">
          <div className="segmented-control projection-switch">
            <button className={chartMode === "projection" ? "active" : ""} onClick={() => setChartMode("projection")}>Projection</button>
            <button className={chartMode === "equity" ? "active" : ""} onClick={() => setChartMode("equity")}>Equity</button>
            <button className={chartMode === "pnl" ? "active" : ""} onClick={() => setChartMode("pnl")}>Daily PnL</button>
            <button className={chartMode === "drawdown" ? "active" : ""} onClick={() => setChartMode("drawdown")}>Drawdown</button>
          </div>

          {chartMode === "projection" && (
            <div className="segmented-control projection-switch secondary">
              <button className={projectionRange === "year" ? "active" : ""} onClick={() => setProjectionRange("year")}>Year</button>
              <button className={projectionRange === "month" ? "active" : ""} onClick={() => setProjectionRange("month")}>Month</button>
            </div>
          )}
        </div>
      </div>

      <div className="chart-wrap">{dataRenderer[chartMode]?.()}</div>
    </section>
  );
}
