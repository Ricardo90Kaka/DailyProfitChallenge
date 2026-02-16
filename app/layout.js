import "./globals.css";

export const metadata = {
  title: "Daily Profit Challenge",
  description: "Track your daily trading progress."
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
