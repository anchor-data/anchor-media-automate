import type { Account, Job, Post } from "@ama/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";

export type DashboardData = {
  health: {
    ok: boolean;
    mode: string;
    dataStore: string;
    integrations: Record<string, boolean>;
  };
  posts: Post[];
  jobs: Job[];
  account: Account | null;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [health, posts, jobs, account] = await Promise.all([
    getJson<DashboardData["health"]>("/health"),
    getJson<{ items: Post[] }>("/posts"),
    getJson<{ items: Job[] }>("/jobs"),
    getJson<{ item: Account }>("/accounts/acc_001/config").catch(() => ({ item: null }))
  ]);

  return {
    health,
    posts: posts.items,
    jobs: jobs.items,
    account: account.item
  };
}

export async function runAgent(accountId: string) {
  const response = await fetch(`${API_BASE_URL}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, limit: 5 })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent run failed: ${text}`);
  }
  return response.json();
}

export async function approvePost(postId: string) {
  const response = await fetch(`${API_BASE_URL}/posts/${postId}/approve`, {
    method: "POST"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Approve failed: ${text}`);
  }
  return response.json();
}

export async function regeneratePost(postId: string) {
  const response = await fetch(`${API_BASE_URL}/agent/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Regenerate failed: ${text}`);
  }
  return response.json();
}
