"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Guideline, Idea, MemoryItem, Post, PostAsset, Reference } from "@ama/shared";
import {
  approvePost as approvePostApi,
  createContent,
  createReference,
  deleteMemory,
  deleteReference,
  fetchWorkspaceBundle,
  getGuideline,
  getPostDetail,
  listIdeas,
  listMemory,
  listReferences,
  patchIdea,
  putGuideline,
  regeneratePost,
  renderPost,
  runIdeation,
  schedulePost
} from "../lib/api";
import {
  DEFAULT_PROMPT,
  INITIAL_ACCOUNTS,
  type IdeaCandidate,
  type MockAccount,
  type MockPost
} from "../lib/mock-data";

export type ModalState =
  | { kind: "none" }
  | { kind: "add-account" }
  | { kind: "idea" }
  | { kind: "post-edit"; postId: string }
  | { kind: "engine"; accountId: string };

interface WorkspaceValue {
  accounts: readonly MockAccount[];
  posts: readonly MockPost[];
  activeAccountId: string;
  selectedPostId: string | null;
  selectedIdeaId: string | null;
  modal: ModalState;
  toast: string | null;
  loading: boolean;
  apiReady: boolean;
  dataStore: string | null;
  guideline: Guideline | null;
  references: readonly Reference[];
  memoryItems: readonly MemoryItem[];
  ideas: readonly Idea[];
  setActiveAccountId: (id: string) => void;
  selectPost: (id: string | null) => void;
  selectIdea: (id: string | null) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  addAccount: (
    handle: string,
    schedule: string,
    target: string,
    concept: string,
    title?: string
  ) => void;
  updateAccount: (id: string, patch: Partial<MockAccount>) => void;
  updatePost: (id: string, patch: Partial<MockPost>) => void;
  deletePost: (id: string) => void;
  approvePost: (id: string) => void;
  /** Re-export the stored Canva design (preview URLs expire). */
  reloadPostAssets: (id: string) => Promise<void>;
  /** Re-run the creation agent for a draft. */
  retryGeneration: (id: string) => Promise<void>;
  addDraftFromIdea: (idea: IdeaCandidate) => void;
  generateIdeasFromApi: (input: {
    seedText: string;
    seedUrl?: string;
  }) => Promise<IdeaCandidate[]>;
  saveGuideline: (accountId: string, patch: Partial<MockAccount>) => Promise<void>;
  addReference: (accountId: string, title: string, examplesText: string) => Promise<void>;
  removeReference: (referenceId: string) => Promise<void>;
  removeMemory: (memoryId: string) => Promise<void>;
  refreshAccountSideData: (accountId: string) => Promise<void>;
  notify: (message: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const TOAST_MS = 2400;

function mapAccount(
  accountId: string,
  handle: string,
  guideline: Guideline | null,
  memory: readonly MemoryItem[],
  ideas: readonly Idea[],
  fallback?: MockAccount
): MockAccount {
  return {
    id: accountId,
    handle,
    title: guideline?.concept?.slice(0, 24) || fallback?.title || "アカウント",
    target: guideline?.target || fallback?.target || "",
    concept: guideline?.concept || fallback?.concept || "",
    schedule: fallback?.schedule ?? "毎日 18:00",
    systemPrompt: guideline?.systemPrompt || fallback?.systemPrompt || DEFAULT_PROMPT,
    memory: memory.map((m) => m.topicKey),
    ideaQueue: ideas.filter((i) => i.status === "queued").map((i) => i.title)
  };
}

function dayFromIso(iso: string | null | undefined): number {
  if (!iso) return 1;
  const d = new Date(iso);
  return Number.isNaN(d.getDate()) ? 1 : d.getDate();
}

const GENERATING: readonly string[] = ["pending", "generating_copy", "rendering"];

function formatScheduled(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tomorrow 18:00 in the browser's zone, as an ISO string with offset (what the API requires). */
function defaultScheduleIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00:00` +
    `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`
  );
}

function assetUrlsOf(assets: readonly PostAsset[]): readonly string[] {
  return [...assets].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0)).map((a) => a.imageUrl);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "不明なエラー";
}

function mapApiPost(post: Post, ideaTarget: string, assets?: readonly PostAsset[]): MockPost {
  return {
    id: post.id,
    accountId: post.accountId,
    title: post.title,
    caption: post.caption,
    status:
      post.status === "approved"
        ? "scheduled"
        : post.status === "rejected" || post.status === "failed"
          ? "draft"
          : (post.status as MockPost["status"]),
    day: dayFromIso(post.scheduledAt ?? post.createdAt),
    scheduledAt: formatScheduled(post.scheduledAt),
    ideaTarget,
    ideaId: post.ideaId,
    generationStatus: post.generationStatus,
    generationError: post.generationError ?? null,
    assetUrls: assets ? assetUrlsOf(assets) : undefined
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<readonly MockAccount[]>(INITIAL_ACCOUNTS);
  const [posts, setPosts] = useState<readonly MockPost[]>([]);
  const [activeAccountId, setActiveAccountId] = useState(INITIAL_ACCOUNTS[0]?.id ?? "");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(false);
  const [dataStore, setDataStore] = useState<string | null>(null);
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [references, setReferences] = useState<readonly Reference[]>([]);
  const [memoryItems, setMemoryItems] = useState<readonly MemoryItem[]>([]);
  const [ideas, setIdeas] = useState<readonly Idea[]>([]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), TOAST_MS);
  }, []);

  const refreshAccountSideData = useCallback(async (accountId: string) => {
    const [refs, mem, ideaList, guide] = await Promise.all([
      listReferences(accountId),
      listMemory(accountId),
      listIdeas(accountId),
      getGuideline(accountId).catch(() => null)
    ]);
    const guideItem = guide?.item ?? null;
    setReferences(refs.items);
    setMemoryItems(mem.items);
    setIdeas(ideaList.items);
    if (guideItem) setGuideline(guideItem);
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? mapAccount(accountId, a.handle, guideItem, mem.items, ideaList.items, a)
          : a
      )
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const bundle = await fetchWorkspaceBundle();
        if (cancelled) return;
        setDataStore(bundle.dataStore);
        setGuideline(bundle.guideline);
        setReferences(bundle.references);
        setMemoryItems(bundle.memory);
        setIdeas(bundle.ideas);
        setApiReady(true);

        const mappedAccounts =
          bundle.accounts.length > 0
            ? bundle.accounts.map((acc) =>
                mapAccount(
                  acc.id,
                  acc.instagramHandle.startsWith("@")
                    ? acc.instagramHandle
                    : `@${acc.instagramHandle}`,
                  acc.id === (bundle.accounts[0]?.id ?? "") ? bundle.guideline : null,
                  acc.id === (bundle.accounts[0]?.id ?? "") ? bundle.memory : [],
                  acc.id === (bundle.accounts[0]?.id ?? "") ? bundle.ideas : [],
                  INITIAL_ACCOUNTS.find((a) => a.id === acc.id)
                )
              )
            : INITIAL_ACCOUNTS;

        setAccounts(mappedAccounts);
        const firstId = mappedAccounts[0]?.id ?? "";
        setActiveAccountId(firstId);

        if (cancelled) return;
        setPosts(
          bundle.posts.map((post) => mapApiPost(post, bundle.guideline?.target ?? ""))
        );
      } catch {
        if (!cancelled) {
          setApiReady(false);
          setDataStore("offline-mock");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!apiReady || !activeAccountId) return;
    void refreshAccountSideData(activeAccountId).catch(() => null);
  }, [activeAccountId, apiReady, refreshAccountSideData]);

  // Poll posts whose Canva/agent generation is still running until they are ready or failed.
  const generatingIds = posts
    .filter((p) => p.generationStatus && GENERATING.includes(p.generationStatus))
    .map((p) => p.id)
    .join(",");
  useEffect(() => {
    if (!apiReady || !generatingIds) return;
    const timer = window.setInterval(() => {
      for (const id of generatingIds.split(",")) {
        getPostDetail(id)
          .then((detail) => {
            setPosts((prev) =>
              prev.map((p) => (p.id === id ? mapApiPost(detail.post, p.ideaTarget, detail.assets) : p))
            );
            if (detail.post.generationStatus === "ready") notify("コンテンツが完成しました");
            if (detail.post.generationStatus === "failed") {
              notify(`生成に失敗しました: ${detail.post.generationError ?? ""}`);
            }
          })
          .catch(() => {
            // Transient network error: the next tick retries.
          });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [apiReady, generatingIds, notify]);

  // Load slide images lazily when a finished post is opened.
  useEffect(() => {
    if (!apiReady || !selectedPostId) return;
    const post = posts.find((p) => p.id === selectedPostId);
    if (!post || post.generationStatus !== "ready" || post.assetUrls) return;
    getPostDetail(post.id)
      .then((detail) =>
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? mapApiPost(detail.post, p.ideaTarget, detail.assets) : p))
        )
      )
      .catch((error: unknown) => notify(`プレビューの読み込みに失敗しました: ${errorText(error)}`));
  }, [apiReady, selectedPostId, posts, notify]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      accounts,
      posts,
      activeAccountId,
      selectedPostId,
      selectedIdeaId,
      modal,
      toast,
      loading,
      apiReady,
      dataStore,
      guideline,
      references,
      memoryItems,
      ideas,
      setActiveAccountId: (id: string) => {
        if (id !== activeAccountId) {
          setSelectedPostId(null);
          setSelectedIdeaId(null);
        }
        setActiveAccountId(id);
      },
      selectPost: (id: string | null) => {
        setSelectedPostId(id);
        if (id) setSelectedIdeaId(null);
      },
      selectIdea: (id: string | null) => {
        setSelectedIdeaId(id);
        if (id) setSelectedPostId(null);
      },
      openModal: setModal,
      closeModal: () => setModal({ kind: "none" }),
      notify,
      refreshAccountSideData,
      addAccount: (handle, schedule, target, concept, title) => {
        const id = `acc_${Date.now()}`;
        const clean = handle.trim().replace(/^@?/, "@");
        const account: MockAccount = {
          id,
          handle: clean,
          title: title?.trim() || concept.trim() || target.trim() || "新規アカウント",
          target: target.trim(),
          concept: concept.trim(),
          schedule,
          systemPrompt: DEFAULT_PROMPT,
          memory: [],
          ideaQueue: []
        };
        setAccounts((prev) => [...prev, account]);
        setActiveAccountId(id);
        setSelectedPostId(null);
        setSelectedIdeaId(null);
      },
      updateAccount: (id, patch) =>
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))),
      updatePost: (id, patch) =>
        setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      deletePost: (id) => {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setSelectedPostId((current) => (current === id ? null : current));
      },
      approvePost: (id) => {
        if (!apiReady) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === id
                ? { ...p, status: "scheduled", scheduledAt: p.scheduledAt ?? "2026/02/21 18:00" }
                : p
            )
          );
          notify("承認して予約しました");
          return;
        }
        void approvePostApi(id)
          .then(() => schedulePost(id, defaultScheduleIso()))
          .then((res) => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === id
                  ? { ...p, status: "scheduled", scheduledAt: formatScheduled(res.item.scheduledAt) }
                  : p
              )
            );
            notify("承認して予約しました");
          })
          .catch((error: unknown) => notify(`承認に失敗しました: ${errorText(error)}`));
      },
      reloadPostAssets: async (id) => {
        try {
          const detail = await renderPost(id, true);
          setPosts((prev) =>
            prev.map((p) => (p.id === id ? mapApiPost(detail.post, p.ideaTarget, detail.assets) : p))
          );
        } catch (error) {
          notify(`プレビューの更新に失敗しました: ${errorText(error)}`);
        }
      },
      retryGeneration: async (id) => {
        try {
          const { item } = await regeneratePost(id);
          setPosts((prev) =>
            prev.map((p) =>
              p.id === id ? { ...mapApiPost(item, p.ideaTarget), assetUrls: undefined } : p
            )
          );
        } catch (error) {
          notify(`再生成に失敗しました: ${errorText(error)}`);
        }
      },
      addDraftFromIdea: (idea) => {
        const target = accounts.find((a) => a.id === activeAccountId)?.target ?? "";
        if (apiReady) {
          void createContent(idea.id)
            .then(({ item }) => {
              setPosts((prev) => [...prev, mapApiPost(item, target)]);
              setSelectedIdeaId(null);
              setSelectedPostId(item.id);
              setIdeas((prev) =>
                prev.map((i) => (i.id === idea.id ? { ...i, status: "selected" } : i))
              );
            })
            .catch((error: unknown) => notify(`コンテンツの作成に失敗しました: ${errorText(error)}`));
          return;
        }
        const id = `post_${Date.now()}`;
        const draft: MockPost = {
          id,
          accountId: activeAccountId,
          title: idea.title,
          caption: idea.summary,
          status: "draft",
          day: new Date().getDate(),
          scheduledAt: null,
          ideaTarget: accounts.find((a) => a.id === activeAccountId)?.target ?? "",
          ideaId: idea.id
        };
        setPosts((prev) => [...prev, draft]);
        setSelectedIdeaId(null);
        setSelectedPostId(id);
        setIdeas((prev) =>
          prev.map((item) => (item.id === idea.id ? { ...item, status: "selected" } : item))
        );
        if (apiReady) {
          void patchIdea(idea.id, { status: "selected" })
            .then((updated) => {
              setIdeas((prev) =>
                prev.map((item) => (item.id === idea.id ? updated.item : item))
              );
            })
            .catch(() => null);
        }
      },
      generateIdeasFromApi: async ({ seedText, seedUrl }) => {
        const result = await runIdeation({
          accountId: activeAccountId,
          count: 3,
          seedText,
          seedUrl: seedUrl || undefined
        });
        const stored = await listIdeas(activeAccountId);
        const savedIds = new Set(result.items.map((idea) => idea.id));
        const confirmed = stored.items.filter((idea) => savedIds.has(idea.id));
        if (confirmed.length !== result.items.length) {
          throw new Error("生成した企画をデータベースに保存できませんでした");
        }
        setIdeas(stored.items);
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === activeAccountId
              ? {
                  ...a,
                  ideaQueue: stored.items
                    .filter((idea) => idea.status === "queued")
                    .map((idea) => idea.title)
                }
              : a
          )
        );
        return result.items.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary
        }));
      },
      saveGuideline: async (accountId, patch) => {
        setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, ...patch } : a)));
        if (!apiReady) return;
        const account = accounts.find((a) => a.id === accountId);
        const merged = { ...account, ...patch };
        const item = await putGuideline(accountId, {
          target: merged?.target ?? "",
          concept: merged?.concept ?? "",
          tone: guideline?.tone ?? "やさしく実践的",
          contentPillars: guideline?.contentPillars ?? ["転職準備"],
          ngRules: guideline?.ngRules ?? [],
          ctaPolicy: guideline?.ctaPolicy ?? "",
          hashtagPolicy: guideline?.hashtagPolicy ?? "",
          jobPickEnabled: guideline?.jobPickEnabled ?? false,
          systemPrompt: merged?.systemPrompt ?? DEFAULT_PROMPT
        });
        setGuideline(item.item);
      },
      addReference: async (accountId, title, examplesText) => {
        if (!apiReady) {
          notify("API未接続のため参照は保存されません");
          return;
        }
        const created = await createReference(accountId, {
          kind: "doc",
          title,
          sourceNote: "uploaded via dashboard",
          examplesText,
          active: true
        });
        setReferences((prev) => [created.item, ...prev]);
      },
      removeReference: async (referenceId) => {
        if (apiReady) await deleteReference(referenceId);
        setReferences((prev) => prev.filter((r) => r.id !== referenceId));
      },
      removeMemory: async (memoryId) => {
        if (apiReady) await deleteMemory(memoryId);
        setMemoryItems((prev) => prev.filter((m) => m.id !== memoryId));
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === activeAccountId
              ? {
                  ...a,
                  memory: memoryItems
                    .filter((m) => m.id !== memoryId)
                    .map((m) => m.topicKey)
                }
              : a
          )
        );
      }
    }),
    [
      accounts,
      posts,
      activeAccountId,
      selectedPostId,
      selectedIdeaId,
      modal,
      toast,
      loading,
      apiReady,
      dataStore,
      guideline,
      references,
      memoryItems,
      ideas,
      notify,
      refreshAccountSideData
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
