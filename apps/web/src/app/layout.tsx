import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { WorkspaceProvider } from "../components/workspace-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anchor Media | Instagram求人メディア自動化",
  description: "Instagram求人メディアの企画・投稿・分析を自動化するダッシュボード"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
