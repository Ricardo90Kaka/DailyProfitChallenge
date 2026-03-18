"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, LayoutDashboard, MoonStar, Sun, Target } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function AppNavigation() {
  const pathname = usePathname();
  const dashboardActive = pathname?.startsWith("/dashboard");
  const challengeActive = pathname === "/";
  const journalActive = pathname?.startsWith("/journal");
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="app-sidebar" aria-label="Hoofdnavigatie">
      <div className="app-nav-brand">DPC</div>
      <nav className="app-nav-links">
        <Link
          href="/dashboard"
          className={`nav-liquid-btn ${dashboardActive ? "active" : ""}`}
          aria-current={dashboardActive ? "page" : undefined}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </Link>

        <Link
          href="/"
          className={`nav-liquid-btn ${challengeActive ? "active" : ""}`}
          aria-current={challengeActive ? "page" : undefined}
        >
          <Target size={18} />
          <span>Challenge</span>
        </Link>

        <Link
          href="/journal"
          className={`nav-liquid-btn ${journalActive ? "active" : ""}`}
          aria-current={journalActive ? "page" : undefined}
        >
          <BookOpenText size={18} />
          <span>Journal</span>
        </Link>
      </nav>

      <div className="app-nav-footer">
        <button className="theme-toggle-btn" type="button" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={14} /> : <MoonStar size={14} />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>
    </aside>
  );
}
