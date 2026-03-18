import "./globals.css";
import AppNavigation from "../components/AppNavigation";
import { ThemeProvider } from "../components/ThemeProvider";
import { AppDataProvider } from "../components/AppDataProvider";
import SessionStrip from "../components/SessionStrip";

export const metadata = {
  title: "Daily Profit Challenge",
  description: "Track your daily trading progress."
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>
        <ThemeProvider>
          <AppDataProvider>
            <div className="app-frame">
              <AppNavigation />
              <div className="app-content">
                <SessionStrip />
                {children}
              </div>
            </div>
          </AppDataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
