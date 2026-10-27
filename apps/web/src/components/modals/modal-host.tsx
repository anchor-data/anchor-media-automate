"use client";

import { useWorkspace } from "../workspace-context";
import { AddAccountModal } from "./add-account-modal";
import { IdeaModal } from "./idea-modal";

export function ModalHost() {
  const { modal } = useWorkspace();

  switch (modal.kind) {
    case "add-account":
      return <AddAccountModal />;
    case "idea":
      return <IdeaModal />;
    default:
      return null;
  }
}
