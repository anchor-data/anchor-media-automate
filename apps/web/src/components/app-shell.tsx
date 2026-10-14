"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { ModalHost } from "./modals/modal-host";
import { useWorkspace } from "./workspace-context";

const NAV: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/calendar", label: "カレンダー", icon: "calendar" },
  { href: "/analytics", label: "分析", icon: "activity" },
  { href: "/settings", label: "設定", icon: "settings" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toast } = useWorkspace();

  return (
    <div className="shell">
      <header className="topbar">
        <label className="topbar-search">
          <Icon name="search" size={14} />
          <input type="search" placeholder="検索..." aria-label="検索" />
        </label>
      </header>
      <div className="body">
        <nav className="primary-nav" aria-label="メインナビゲーション">
          <div className="logo">A</div>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname.startsWith(item.href) ? " active" : ""}`}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={20} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
      <ModalHost />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
