import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instagram求人メディア自動化ダッシュボード",
  description: "Facade dashboard for agent-driven recruiting content workflow"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
