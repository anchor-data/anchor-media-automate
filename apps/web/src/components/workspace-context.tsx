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
import type { Guideline, Idea, MemoryItem, Reference } from "@ama/shared";
import {
  createReference,
  deleteMemory,
  deleteReference,
  fetchWorkspaceBundle,
  getGuideline,
  listIdeas,
  listMemory,
  listReferences,
  patchIdea,
  putGuideline,
  runIdeation
} from "../lib/api";
import {
  DEFAULT_PROMPT,
  INITIAL_ACCOUNTS,
  INITIAL_POSTS,
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<readonly MockAccount[]>(INITIAL_ACCOUNTS);
  const [posts, setPosts] = useState<readonly MockPost[]>(INITIAL_POSTS);
  const [activeAccountId, setActiveAccountId] = useState(INITIAL_ACCOUNTS[0]?.id ?? "");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
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

        if (bundle.posts.length > 0) {
          setPosts(
            bundle.posts.map((p) => ({
              id: p.id,
              accountId: p.accountId,
              title: p.title,
              caption: p.caption,
              status:
                p.status === "approved"
                  ? "scheduled"
                  : p.status === "rejected" || p.status === "failed"
                    ? "draft"
                    : (p.status as MockPost["status"]),
              day: dayFromIso(p.scheduledAt ?? p.createdAt),
              scheduledAt: p.scheduledAt ?? null,
              ideaTarget: bundle.guideline?.target ?? ""
            }))
          );
        }
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

  const value = useMemo<WorkspaceValue>(
    () => ({
      accounts,
      posts,
      activeAccountId,
      selectedPostId,
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
        if (id !== activeAccountId) setSelectedPostId(null);
        setActiveAccountId(id);
      },
      selectPost: setSelectedPostId,
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
      },
      updateAccount: (id, patch) =>
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))),
      updatePost: (id, patch) =>
        setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      deletePost: (id) => {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setSelectedPostId((current) => (current === id ? null : current));
      },
      approvePost: (id) =>
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: "scheduled", scheduledAt: p.scheduledAt ?? "2026/02/21 18:00" }
              : p
          )
        ),
      addDraftFromIdea: (idea) => {
        const id = `post_${Date.now()}`;
        const draft: MockPost = {
          id,
          accountId: activeAccountId,
          title: idea.title,
          caption: `${idea.summary}\n\n#キャリア #転職`,
          status: "draft",
          day: 24,
          scheduledAt: null,
          ideaTarget: accounts.find((a) => a.id === activeAccountId)?.target ?? ""
        };
        setPosts((prev) => [...prev, draft]);
        setSelectedPostId(id);
        if (apiReady) {
          void patchIdea(idea.id, { status: "selected" }).catch(() => null);
        }
      },
      generateIdeasFromApi: async ({ seedText, seedUrl }) => {
        if (!apiReady) {
          const { generateIdeas } = await import("../lib/mock-data");
          return [...generateIdeas(seedText)];
        }
        const result = await runIdeation({
          accountId: activeAccountId,
          count: 3,
          seedText,
          seedUrl: seedUrl || undefined
        });
        setIdeas((prev) => [...result.items, ...prev]);
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === activeAccountId
              ? {
                  ...a,
                  ideaQueue: [
                    ...result.items.map((i) => i.title),
                    ...a.ideaQueue.filter((t) => !result.items.some((i) => i.title === t))
                  ]
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
