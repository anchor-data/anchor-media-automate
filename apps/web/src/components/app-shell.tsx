"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_SECTIONS, activeItemHref, sectionFor } from "../lib/nav";
import { stageOf } from "../lib/post-stage";
import { Icon } from "./icon";
import { ModalHost } from "./modals/modal-host";
import { useWorkspace } from "./workspace-context";

function AccountSwitcher() {
  const { accounts, activeAccountId, setActiveAccountId, openModal } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeAccountId);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar sm">{(active?.handle ?? "@A").replace("@", "").slice(0, 1).toUpperCase()}</span>
        <span className="switcher-name">{active?.handle.replace("@", "") ?? "アカウント未設定"}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <div className="switcher-menu" role="listbox">
          {accounts.map((account) => (
            <button
              key={account.id}
              role="option"
              aria-selected={account.id === activeAccountId}
              className={`switcher-item${account.id === activeAccountId ? " active" : ""}`}
              onClick={() => {
                setActiveAccountId(account.id);
                setOpen(false);
              }}
            >
              <span className="avatar sm">{account.handle.replace("@", "").slice(0, 1).toUpperCase()}</span>
              <span className="stack gap-2">
                <strong>{account.handle}</strong>
                <span className="muted small">{account.title}</span>
              </span>
            </button>
          ))}
          <button
            className="switcher-item add"
            onClick={() => {
              setOpen(false);
              openModal({ kind: "add-account" });
            }}
          >
            <Icon name="plus" size={14} />
            アカウントを追加
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { toast, posts, activeAccountId, openModal } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const section = sectionFor(pathname);
  const activeHref = activeItemHref(section, pathname);
  const reviewCount = posts.filter((p) => p.accountId === activeAccountId && stageOf(p) === "review").length;

  return (
    <div className="app">
      <nav className="rail" aria-label="メインナビゲーション">
        <button
          className="rail-toggle"
          aria-label={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          aria-pressed={collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Icon name="panel-left" size={22} />
        </button>
        <div className="rail-create">
          <button className="rail-plus" aria-label="作成" onClick={() => openModal({ kind: "idea" })}>
            <Icon name="plus" size={20} />
          </button>
          <span>作成</span>
        </div>
        <div className="rail-items">
          {NAV_SECTIONS.map((item) => {
            const active = item.id === section.id;
            if (item.disabled) {
              return (
                <span key={item.id} className="rail-item disabled" aria-disabled="true" title="現在ご利用いただけません">
                  <span className="rail-icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <span>{item.label}</span>
                </span>
              );
            }
            return (
              <Link
                key={item.id}
                href={item.items[0]?.href ?? "/calendar"}
                className={`rail-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="rail-icon">
                  <Icon name={item.icon} size={22} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="rail-bottom">
          <Link href="/review" className="rail-bell" aria-label={`承認待ち ${reviewCount}件`}>
            <Icon name="bell" size={22} />
            {reviewCount > 0 ? <span className="count-badge">{reviewCount}</span> : null}
          </Link>
          <span className="avatar lg" aria-label="ログイン中のユーザー">
            A
          </span>
        </div>
      </nav>
      {collapsed ? null : (
        <aside className="side">
          <div className="side-brand">
            <span className="brand-mark">A</span>
            <strong>Anchor Media</strong>
          </div>
          <AccountSwitcher />
          <div className="side-heading">{section.heading}</div>
          <nav className="side-nav" aria-label={`${section.label}メニュー`}>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link${item.href === activeHref ? " active" : ""}`}
                aria-current={item.href === activeHref ? "page" : undefined}
              >
                {item.label}
                {item.reviewBadge && reviewCount > 0 ? <span className="count-badge inline">{reviewCount}</span> : null}
              </Link>
            ))}
          </nav>
        </aside>
      )}
      <main className="main-card">{children}</main>
      <ModalHost />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
