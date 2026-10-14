"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
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
  setActiveAccountId: (id: string) => void;
  selectPost: (id: string | null) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  addAccount: (handle: string, schedule: string, target: string, concept: string) => void;
  updateAccount: (id: string, patch: Partial<MockAccount>) => void;
  updatePost: (id: string, patch: Partial<MockPost>) => void;
  deletePost: (id: string) => void;
  approvePost: (id: string) => void;
  addDraftFromIdea: (idea: IdeaCandidate) => void;
  notify: (message: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const TOAST_MS = 2400;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<readonly MockAccount[]>(INITIAL_ACCOUNTS);
  const [posts, setPosts] = useState<readonly MockPost[]>(INITIAL_POSTS);
  const [activeAccountId, setActiveAccountId] = useState(INITIAL_ACCOUNTS[0]?.id ?? "");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(INITIAL_POSTS[0]?.id ?? null);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), TOAST_MS);
  }, []);

  const value = useMemo<WorkspaceValue>(
    () => ({
      accounts,
      posts,
      activeAccountId,
      selectedPostId,
      modal,
      toast,
      setActiveAccountId,
      selectPost: setSelectedPostId,
      openModal: setModal,
      closeModal: () => setModal({ kind: "none" }),
      notify,
      addAccount: (handle, schedule, target, concept) => {
        const id = `acc_${Date.now()}`;
        const clean = handle.trim().replace(/^@?/, "@");
        const account: MockAccount = {
          id,
          handle: clean,
          target: target.trim(),
          concept: concept.trim(),
          schedule,
          systemPrompt: DEFAULT_PROMPT,
          memory: [],
          ideaQueue: []
        };
        setAccounts((prev) => [...prev, account]);
        setActiveAccountId(id);
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
          caption: `${idea.summary}\n\n#キャリア #エンジニア`,
          status: "draft",
          day: 24,
          scheduledAt: null,
          ideaTarget: accounts.find((a) => a.id === activeAccountId)?.target ?? ""
        };
        setPosts((prev) => [...prev, draft]);
        setSelectedPostId(id);
      }
    }),
    [accounts, posts, activeAccountId, selectedPostId, modal, toast, notify]
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
