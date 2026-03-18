"use client";

import { useEffect, useRef } from "react";

export default function TradingViewPanel({ tvSymbol, rawSymbol, theme = "dark", interval = "60", actions = null }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!tvSymbol) return;

    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "Etc/UTC",
      theme: theme === "light" ? "light" : "dark",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: false,
      hotlist: false,
      calendar: false,
      studies: []
    });

    container.appendChild(script);
  }, [interval, tvSymbol, theme]);

  return (
    <section className="card market-card tv-card">
      <div className="market-card-head">
        <h2>TradingView Chart</h2>
        <div className="tv-head-meta">
          {actions}
          <span className="market-muted">{rawSymbol}</span>
        </div>
      </div>
      <div className="tv-wrap">
        <div className="tradingview-widget-container" ref={containerRef} />
      </div>
    </section>
  );
}
