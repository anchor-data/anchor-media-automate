const INTEGRATIONS = [
  { name: "Canva API", connected: true },
  { name: "Instagram Graph API", connected: true },
  { name: "OpenAI Agents", connected: false }
] as const;

export function SettingsView() {
  return (
    <main className="main">
      <div className="page-head">
        <h1>システム設定</h1>
      </div>
      <div className="settings-grid">
        <section className="card">
          <h3>プロフィール</h3>
          <div className="profile">
            <span className="avatar">A</span>
            <span className="muted">admin@anchormedia.jp</span>
          </div>
        </section>
        <section className="card">
          <h3>外部API連携</h3>
          {INTEGRATIONS.map((item) => (
            <div className="integration" key={item.name}>
              <span>{item.name}</span>
              <span className={`badge${item.connected ? "" : " off"}`}>
                {item.connected ? "接続済み" : "未接続"}
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
