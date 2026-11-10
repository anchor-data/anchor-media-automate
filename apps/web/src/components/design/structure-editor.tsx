"use client";

import type { SlideRole } from "@ama/shared";
import { StructureBoard } from "./structure-board";

export { structureIssues } from "./structure-issues";

interface StructureEditorProps {
  value: readonly SlideRole[];
  onChange: (next: SlideRole[]) => void;
  disabled?: boolean;
}

/** Edit the page structure (role, order by dragging, add, remove) without reference images. */
export function StructureEditor({ value, onChange, disabled = false }: StructureEditorProps) {
  return (
    <StructureBoard
      rows={value.map((role, index) => ({ id: String(index), role }))}
      onRowsChange={(next) => onChange(next.map((row) => row.role))}
      disabled={disabled}
    />
  );
}
