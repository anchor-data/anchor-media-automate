"use client";

import { Icon } from "./icon";
import { useWorkspace } from "./workspace-context";

export function AccountSidebar() {
  const { accounts, activeAccountId, setActiveAccountId, openModal, notify } = useWorkspace();

  return (
    <aside className="secondary-nav">
      <h2>アカウント</h2>
      <div className="row gap-12" style={{ gap: 12 }}>
        <button className="add-account" onClick={() => openModal({ kind: "add-account" })}>
          <Icon name="plus" size={14} />
          アカウント追加
        </button>
        <button
          className="icon-btn"
          aria-label="アカウントを連携"
          onClick={() => notify("Instagram連携はモックです")}
        >
          <Icon name="link" size={14} />
        </button>
      </div>
      <div className="account-list">
        {accounts.map((account) => (
          <div className="account-row" key={account.id}>
            <button
              className={`account-select${account.id === activeAccountId ? " active" : ""}`}
              onClick={() => setActiveAccountId(account.id)}
            >
              <span className="avatar">
                <Icon name="instagram" size={14} />
              </span>
              <span className="account-info">
                <span className="account-handle">{account.handle}</span>
                <span className="account-title">
                  {account.title} · {account.schedule}
                </span>
              </span>
            </button>
            <button
              className="icon-btn sm"
              aria-label={`${account.handle} のエージェント設定`}
              onClick={() => openModal({ kind: "engine", accountId: account.id })}
            >
              <Icon name="bot" size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
