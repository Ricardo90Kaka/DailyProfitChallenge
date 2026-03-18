"use client";

import Link from "next/link";
import { BookOpenText, HardDrive, Layers3, Radar, Wallet } from "lucide-react";
import { useAppData } from "./AppDataProvider";

function formatCompact(value, currency = "EUR") {
  const numeric = Number(value ?? 0);
  if (currency === "BTC") return `₿${numeric.toFixed(4)}`;
  return new Intl.NumberFormat(currency === "EUR" ? "nl-NL" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(numeric);
}

export default function SessionStrip() {
  const { challenge, workspaceStatus, activeAlertCount } = useAppData();

  return (
    <div className="session-strip-wrap">
      <div className="session-strip">
        <div className="session-cluster">
          <span className="session-badge online">
            <HardDrive size={14} />
            Local data
          </span>

          <div className="session-stat">
            <span>Symbool</span>
            <strong>{workspaceStatus.selectedSymbol || "BTC"}</strong>
          </div>
          <div className="session-stat">
            <span>Alerts</span>
            <strong>{workspaceStatus.activeAlertCount ?? activeAlertCount ?? 0}</strong>
          </div>
          <div className="session-stat">
            <span>Equity</span>
            <strong>{formatCompact(workspaceStatus.challengeEquity, challenge.currency)}</strong>
          </div>
          <div className="session-stat">
            <span>Laatste marktupdate</span>
            <strong>
              {workspaceStatus.lastMarketUpdate
                ? new Date(workspaceStatus.lastMarketUpdate).toLocaleTimeString("nl-NL")
                : "--:--"}
            </strong>
          </div>
        </div>

        <div className="session-actions">
          <span className="session-muted session-inline-note">
            <Radar size={14} />
            Elke browser bewaart zijn eigen data lokaal.
          </span>

          <Link className="btn btn-inline btn-ghost" href="/journal">
            <BookOpenText size={14} />
            Journal
          </Link>
          <Link className="btn btn-inline btn-ghost" href="/">
            <Wallet size={14} />
            Challenge
          </Link>
          <Link className="btn btn-inline btn-ghost" href="/dashboard">
            <Layers3 size={14} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
