"use client";

import { useWorkspace } from "../workspace-context";
import { AddAccountModal } from "./add-account-modal";
import { EngineSettingsModal } from "./engine-settings-modal";
import { IdeaModal } from "./idea-modal";
import { PostEditModal } from "./post-edit-modal";

export function ModalHost() {
  const { modal } = useWorkspace();

  switch (modal.kind) {
    case "add-account":
      return <AddAccountModal />;
    case "idea":
      return <IdeaModal />;
    case "post-edit":
      return <PostEditModal postId={modal.postId} />;
    case "engine":
      return <EngineSettingsModal accountId={modal.accountId} />;
    default:
      return null;
  }
}
