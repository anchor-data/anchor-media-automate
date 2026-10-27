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
import {
  DEFAULT_AUTO_RUN_SCHEDULE,
  autoRunSettingsSchema,
  captionWithHashtags,
  slideFieldsSchema,
  type Guideline,
  type GuidelineUpsert,
  type Idea,
  type MemoryItem,
  type Post,
  type PostAsset,
  type Reference,
  type SlideFields
} from "@ama/shared";
import {
  approvePost as approvePostApi,
  createAccountApi,
  createContent,
  createReference,
  deleteMemory,
  deleteReference,
  uploadReferenceFile,
  importInstagramReferences,
  patchPostCaption,
  patchPostSlides,
  fetchWorkspaceBundle,
  getGuideline,
  getPostDetail,
  listIdeas,
  listMemory,
  listPosts,
  listReferences,
  patchIdea,
  putAutoRun,
  putCanvaTemplate,
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
import { defaultScheduleDate, toIsoWithOffset } from "../lib/schedule";

export type ModalState = { kind: "none" } | { kind: "add-account" } | { kind: "idea" };

export interface IdeationInput {
  readonly seedText?: string;
  readonly seedUrl?: string;
  readonly count?: number;
}

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
  /** Which external services the API has credentials for; null while unknown/offline. */
  integrations: Readonly<Record<string, boolean>> | null;
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
    title?: string,
    canvaTemplateId?: string
  ) => Promise<void>;
  saveCanvaTemplate: (accountId: string, templateId: string) => Promise<void>;
  /** Turns scheduled idea+content generation on or off for an account. */
  saveAutoRun: (accountId: string, enabled: boolean, schedule: string) => Promise<void>;
  /** Persists a caption edit (hashtags included in the text) to the API; local-only when offline. */
  savePostCaption: (id: string, caption: string) => Promise<void>;
  /** Persists edited slide copy, then re-renders the Canva images. */
  savePostSlides: (id: string, slides: SlideFields) => Promise<void>;
  /** Approves and schedules a draft. Resolves true on success. */
  approvePost: (id: string, scheduledIso?: string) => Promise<boolean>;
  /** Re-export the stored Canva design (preview URLs expire). */
  reloadPostAssets: (id: string) => Promise<void>;
  /** Re-run the creation agent for a draft, optionally with reviewer feedback. */
  retryGeneration: (id: string, feedback?: string) => Promise<void>;
  /** Creates content from an idea; resolves to the new post id (null on failure). */
  addDraftFromIdea: (idea: IdeaCandidate) => Promise<string | null>;
  rejectIdea: (ideaId: string, reason: string) => Promise<void>;
  generateIdeasFromApi: (input: IdeationInput) => Promise<IdeaCandidate[]>;
  saveGuidelineDetails: (accountId: string, body: GuidelineUpsert) => Promise<void>;
  addReference: (accountId: string, title: string, examplesText: string) => Promise<void>;
  uploadReference: (accountId: string, file: File) => Promise<{ truncated: boolean }>;
  importInstagramReference: (accountId: string, referenceUrl: string, screenshots: string[]) => Promise<number>;
  removeReference: (referenceId: string) => Promise<void>;
  removeMemory: (memoryId: string) => Promise<void>;
  refreshAccountSideData: (accountId: string) => Promise<void>;
  refreshPosts: () => Promise<void>;
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
    autoRunEnabled: fallback?.autoRunEnabled ?? false,
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

function assetUrlsOf(assets: readonly PostAsset[]): readonly string[] {
  return [...assets].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0)).map((a) => a.imageUrl);
}

function canvaDesignIdOf(assets: readonly PostAsset[]): string | undefined {
  return assets.find((a) => a.canvaDesignId)?.canvaDesignId;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "不明なエラー";
}

function mapApiPost(post: Post, ideaTarget: string, assets?: readonly PostAsset[]): MockPost {
  const slides = slideFieldsSchema.safeParse(post.slidesJson);
  const dateIso = post.scheduledAt ?? post.createdAt;
  return {
    id: post.id,
    accountId: post.accountId,
    title: post.title,
    // Older posts kept hashtags in a separate list; show them inside the caption text.
    caption: captionWithHashtags(post.caption, post.hashtags ?? []),
    status:
      post.status === "approved"
        ? "scheduled"
        : post.status === "rejected" || post.status === "failed"
          ? "draft"
          : (post.status as MockPost["status"]),
    rawStatus: post.status,
    day: dayFromIso(dateIso),
    dateIso,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    scheduledAt: formatScheduled(post.scheduledAt),
    ideaTarget,
    ideaId: post.ideaId,
    generationStatus: post.generationStatus,
    generationError: post.generationError ?? null,
    assetUrls: assets ? assetUrlsOf(assets) : undefined,
    canvaDesignId: assets ? canvaDesignIdOf(assets) : undefined,
    slides: slides.success ? slides.data : undefined
  };
}

/** Keeps already-loaded slide images when a list refresh replaces the post. */
function mergeLoaded(next: MockPost, previous: MockPost | undefined): MockPost {
  if (!previous?.assetUrls) return next;
  return { ...next, assetUrls: previous.assetUrls, canvaDesignId: previous.canvaDesignId };
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
  const [integrations, setIntegrations] = useState<Readonly<Record<string, boolean>> | null>(null);
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
    setGuideline(guideItem);
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? {
              ...mapAccount(accountId, a.handle, guideItem, mem.items, ideaList.items, a),
              canvaTemplateId: a.canvaTemplateId
            }
          : a
      )
    );
  }, []);

  const refreshPosts = useCallback(async () => {
    const res = await listPosts();
    setPosts((prev) =>
      res.items.map((post) => {
        const before = prev.find((p) => p.id === post.id);
        return mergeLoaded(mapApiPost(post, before?.ideaTarget ?? ""), before);
      })
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
        setIntegrations(bundle.health.integrations);
        setGuideline(bundle.guideline);
        setReferences(bundle.references);
        setMemoryItems(bundle.memory);
        setIdeas(bundle.ideas);
        setApiReady(true);

        const firstId = bundle.accounts[0]?.id ?? "";
        const mappedAccounts =
          bundle.accounts.length > 0
            ? bundle.accounts.map((acc) => ({
                ...mapAccount(
                  acc.id,
                  acc.instagramHandle.startsWith("@") ? acc.instagramHandle : `@${acc.instagramHandle}`,
                  acc.id === firstId ? bundle.guideline : null,
                  acc.id === firstId ? bundle.memory : [],
                  acc.id === firstId ? bundle.ideas : [],
                  INITIAL_ACCOUNTS.find((a) => a.id === acc.id)
                ),
                canvaTemplateId: acc.canvaTemplateId,
                schedule: acc.autoRunSchedule ?? DEFAULT_AUTO_RUN_SCHEDULE,
                autoRunEnabled: acc.autoRunEnabled ?? false
              }))
            : INITIAL_ACCOUNTS;

        setAccounts(mappedAccounts);
        setActiveAccountId(mappedAccounts[0]?.id ?? "");
        setPosts(bundle.posts.map((post) => mapApiPost(post, bundle.guideline?.target ?? "")));
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

  const value = useMemo<WorkspaceValue>(() => {
    const replacePost = (id: string, next: (p: MockPost) => MockPost) =>
      setPosts((prev) => prev.map((p) => (p.id === id ? next(p) : p)));

    const targetOf = () => accounts.find((a) => a.id === activeAccountId)?.target ?? "";

    return {
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
      integrations,
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
      refreshPosts,
      addAccount: async (handle, schedule, target, concept, title, canvaTemplateId) => {
        const clean = handle.trim().replace(/^@?/, "@");
        const label = title?.trim() || concept.trim() || target.trim() || "新規アカウント";
        let id = `acc_${Date.now()}`;
        if (apiReady) {
          if (!canvaTemplateId) throw new Error("Canvaテンプレートを選択してください");
          const created = await createAccountApi({
            name: label,
            instagramHandle: clean,
            tone: "やさしく実践的",
            canvaTemplateId
          });
          id = created.item.id;
          // Ideation needs a guideline; empty fields fall back so the account is usable right away.
          await putGuideline(id, {
            target: target.trim() || "未設定",
            concept: concept.trim() || "未設定",
            tone: "やさしく実践的",
            contentPillars: [],
            ngRules: [],
            ctaPolicy: "",
            hashtagPolicy: "",
            jobPickEnabled: false,
            systemPrompt: DEFAULT_PROMPT
          });
        }
        const account: MockAccount = {
          id,
          handle: clean,
          title: label,
          target: target.trim(),
          concept: concept.trim(),
          schedule,
          systemPrompt: DEFAULT_PROMPT,
          memory: [],
          ideaQueue: [],
          canvaTemplateId
        };
        setAccounts((prev) => [...prev, account]);
        setActiveAccountId(id);
        setSelectedPostId(null);
        setSelectedIdeaId(null);
      },
      saveCanvaTemplate: async (accountId, templateId) => {
        await putCanvaTemplate(accountId, templateId);
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, canvaTemplateId: templateId } : a))
        );
      },
      saveAutoRun: async (accountId, enabled, schedule) => {
        const settings = autoRunSettingsSchema.parse({ enabled, schedule });
        if (apiReady) await putAutoRun(accountId, settings);
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, autoRunEnabled: enabled, schedule } : a))
        );
      },
      savePostCaption: async (id, caption) => {
        if (apiReady) {
          const { item } = await patchPostCaption(id, caption);
          replacePost(id, (p) => ({ ...p, caption: item.caption }));
          return;
        }
        replacePost(id, (p) => ({ ...p, caption }));
      },
      savePostSlides: async (id, slides) => {
        if (!apiReady) {
          replacePost(id, (p) => ({ ...p, slides }));
          return;
        }
        await patchPostSlides(id, slides);
        const detail = await renderPost(id, false);
        replacePost(id, (p) => mapApiPost(detail.post, p.ideaTarget, detail.assets));
      },
      approvePost: async (id, scheduledIso) => {
        const iso = scheduledIso ?? toIsoWithOffset(defaultScheduleDate());
        if (!apiReady) {
          replacePost(id, (p) => ({
            ...p,
            status: "scheduled",
            rawStatus: "scheduled",
            dateIso: iso,
            scheduledAt: formatScheduled(iso)
          }));
          notify("承認して予約しました");
          return true;
        }
        try {
          await approvePostApi(id);
          const res = await schedulePost(id, iso);
          replacePost(id, (p) => ({
            ...p,
            status: "scheduled",
            rawStatus: "scheduled",
            dateIso: res.item.scheduledAt ?? iso,
            scheduledAt: formatScheduled(res.item.scheduledAt)
          }));
          notify("承認して予約しました");
          return true;
        } catch (error) {
          notify(`承認に失敗しました: ${errorText(error)}`);
          return false;
        }
      },
      reloadPostAssets: async (id) => {
        try {
          const detail = await renderPost(id, true);
          replacePost(id, (p) => mapApiPost(detail.post, p.ideaTarget, detail.assets));
        } catch (error) {
          notify(`プレビューの更新に失敗しました: ${errorText(error)}`);
        }
      },
      retryGeneration: async (id, feedback) => {
        try {
          const { item } = await regeneratePost(id, feedback);
          replacePost(id, (p) => ({ ...mapApiPost(item, p.ideaTarget), assetUrls: undefined }));
        } catch (error) {
          notify(`再生成に失敗しました: ${errorText(error)}`);
        }
      },
      addDraftFromIdea: async (idea) => {
        const target = targetOf();
        const markSelected = () =>
          setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: "selected" } : i)));

        if (apiReady) {
          try {
            const { item } = await createContent(idea.id);
            setPosts((prev) => [...prev, mapApiPost(item, target)]);
            markSelected();
            return item.id;
          } catch (error) {
            notify(`コンテンツの作成に失敗しました: ${errorText(error)}`);
            return null;
          }
        }
        const id = `post_${Date.now()}`;
        const now = new Date().toISOString();
        const draft: MockPost = {
          id,
          accountId: activeAccountId,
          title: idea.title,
          caption: idea.summary,
          status: "draft",
          rawStatus: "draft",
          day: new Date().getDate(),
          dateIso: now,
          createdAt: now,
          scheduledAt: null,
          ideaTarget: target,
          ideaId: idea.id
        };
        setPosts((prev) => [...prev, draft]);
        markSelected();
        return id;
      },
      rejectIdea: async (ideaId, reason) => {
        if (apiReady) {
          const { item } = await patchIdea(ideaId, { status: "rejected", rejectReason: reason });
          setIdeas((prev) => prev.map((i) => (i.id === ideaId ? item : i)));
          return;
        }
        setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, status: "rejected" } : i)));
      },
      generateIdeasFromApi: async ({ seedText, seedUrl, count = 3 }) => {
        const result = await runIdeation({
          accountId: activeAccountId,
          count,
          seedText: seedText?.trim() || undefined,
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
                  ideaQueue: stored.items.filter((idea) => idea.status === "queued").map((idea) => idea.title)
                }
              : a
          )
        );
        return result.items.map((i) => ({ id: i.id, title: i.title, summary: i.summary }));
      },
      saveGuidelineDetails: async (accountId, body) => {
        const { item } = await putGuideline(accountId, body);
        setGuideline(item);
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId
              ? { ...a, target: item.target, concept: item.concept, systemPrompt: item.systemPrompt }
              : a
          )
        );
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
      uploadReference: async (accountId, file) => {
        if (!apiReady) throw new Error("API未接続のためアップロードできません");
        const created = await uploadReferenceFile(accountId, file);
        setReferences((prev) => [created.item, ...prev]);
        return { truncated: created.truncated };
      },
      importInstagramReference: async (accountId, referenceUrl, screenshots) => {
        if (!apiReady) throw new Error("API未接続のためインポートできません");
        const created = await importInstagramReferences(accountId, referenceUrl, screenshots);
        setReferences((prev) => [...created.items, ...prev]);
        return created.items.length;
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
              ? { ...a, memory: memoryItems.filter((m) => m.id !== memoryId).map((m) => m.topicKey) }
              : a
          )
        );
      }
    };
  }, [
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
    integrations,
    guideline,
    references,
    memoryItems,
    ideas,
    notify,
    refreshAccountSideData,
    refreshPosts
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
