"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "../lib/api";
import { approvePost, regeneratePost, runAgent } from "../lib/api";

type Props = {
  initialData: DashboardData;
};

const flowLabels = [
  "1. 求人取得",
  "2. 選定",
  "3. 投稿生成",
  "4. 画像生成",
  "5. 承認",
  "6. 投稿",
  "7. 分析"
];

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DashboardClient({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready");

  const modeClass = useMemo(
    () => (data.health.dataStore === "mock" ? "pill mock" : "pill live"),
    [data.health.dataStore]
  );

  async function refreshAll() {
    const accountId = data.account?.id ?? "acc_001";
    const [postsRes, jobsRes, accountRes] = await Promise.all([
      fetch(`${apiBaseUrl}/posts`),
      fetch(`${apiBaseUrl}/jobs`),
      fetch(`${apiBaseUrl}/accounts/${accountId}/config`)
    ]);
    const posts = await postsRes.json();
    const jobs = await jobsRes.json();
    const account = await accountRes.json();
    setData((prev) => ({
      ...prev,
      posts: posts.items ?? [],
      jobs: jobs.items ?? [],
      account: account.item ?? null
    }));
  }

  async function onRunAgent() {
    setBusy(true);
    try {
      const accountId = data.account?.id ?? "acc_001";
      const result = await runAgent(accountId);
      await refreshAll();
      setMessage(
        `Agent mode=${result.mode} | ${result.summary}\nReasoning:\n- ${result.reasoning.join("\n- ")}`
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(postId: string) {
    setBusy(true);
    try {
      await approvePost(postId);
      await refreshAll();
      setMessage(`Approved post ${postId}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerate(postId: string) {
    setBusy(true);
    try {
      await regeneratePost(postId);
      await refreshAll();
      setMessage(`Regenerated post ${postId}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1 className="title">Instagram求人メディア自動化ダッシュボード</h1>
      <p className="subtitle">
        Next.js facade + Hono backend + Turso/mock data. 認証なしの初期セットアップ。
      </p>

      <div className="card">
        <h2>Operational Flow</h2>
        <div className="status-strip">
          {flowLabels.map((label) => (
            <div className="status-item" key={label}>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Agent</h2>
          <p>
            Mode: <span className={modeClass}>{data.health.mode}</span> / Store:{" "}
            <span className={modeClass}>{data.health.dataStore}</span>
          </p>
          <div className="actions">
            <button disabled={busy} onClick={onRunAgent}>
              Run agent
            </button>
            <button disabled={busy} onClick={refreshAll}>
              Refresh
            </button>
          </div>
          <div className="logs">{message}</div>
        </section>

        <section className="card">
          <h2>Posts</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.id}</td>
                  <td>{post.title}</td>
                  <td>{post.status}</td>
                  <td className="actions">
                    <button disabled={busy} onClick={() => onApprove(post.id)}>
                      Approve
                    </button>
                    <button disabled={busy} onClick={() => onRegenerate(post.id)}>
                      Regenerate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Jobs</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Location</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.company}</td>
                  <td>{job.role}</td>
                  <td>{job.location}</td>
                  <td>
                    <a href={job.url} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Settings</h2>
          <pre className="logs">{JSON.stringify(data.account, null, 2)}</pre>
          <p>
            Integrations configured: OpenAI={String(data.health.integrations.openai)}, Canva=
            {String(data.health.integrations.canva)}, Instagram=
            {String(data.health.integrations.instagram)}
          </p>
        </section>
      </div>
    </div>
  );
}
