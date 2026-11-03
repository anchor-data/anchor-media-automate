"use client";

import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "削除に失敗しました";
}

export function SettingsAccountPage() {
  const { accounts, activeAccountId, removeAccount, notify } = useWorkspace();
  const active = accounts.find((a) => a.id === activeAccountId) ?? null;

  const deleteActive = async () => {
    if (!active) return;
    if (!window.confirm(`${active.handle} を削除しますか?投稿・アイデア・ガイドライン・画像もすべて削除され、元に戻せません。`)) return;
    try {
      await removeAccount(active.id);
      notify("アカウントを削除しました");
    } catch (error) {
      notify(errorText(error));
    }
  };

  return (
    <>
      <PageTopbar title="設定" />
      <div className="split">
        <section className="pane grow pad-32">
          <div className="stack gap-16" style={{ maxWidth: 720 }}>
            <div className="page-head tight">
              <div>
                <h1>アカウント</h1>
                <p className="muted small">対象のアカウントは左上のメニューで切り替えます</p>
              </div>
            </div>
            {active ? (
              <div className="stack gap-8">
                <strong>アカウントの削除</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  {active.handle} の投稿・アイデア・ガイドライン・画像・メモリーをすべて削除します。元に戻せません。
                </p>
                <button className="btn outline" style={{ alignSelf: "flex-start" }} onClick={() => void deleteActive()}>
                  アカウントを削除
                </button>
              </div>
            ) : (
              <p className="empty">アカウントがありません</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
