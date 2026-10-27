"use client";

import { useState } from "react";
import { ImageLibrary } from "../image-library";
import { useWorkspace } from "../workspace-context";
import { SCHEDULE_OPTIONS } from "../../lib/mock-data";
import { AutomationTab } from "./engine-settings/automation-tab";
import { BasicTab } from "./engine-settings/basic-tab";
import { ReferencesTab } from "./engine-settings/references-tab";
import { Modal } from "./modal";

const TABS = [
  { id: "basic", label: "基本" },
  { id: "references", label: "参照ライブラリ" },
  { id: "images", label: "画像" },
  { id: "automation", label: "自動生成" }
] as const;
type TabId = (typeof TABS)[number]["id"];

export function EngineSettingsModal({ accountId }: { accountId: string }) {
  const { accounts, closeModal, notify, saveGuideline, saveCanvaTemplate, apiReady } = useWorkspace();
  const account = accounts.find((a) => a.id === accountId);
  const [tab, setTab] = useState<TabId>("basic");
  const [title, setTitle] = useState(account?.title ?? "");
  const [target, setTarget] = useState(account?.target ?? "");
  const [concept, setConcept] = useState(account?.concept ?? "");
  const [schedule, setSchedule] = useState(account?.schedule ?? SCHEDULE_OPTIONS[0]);
  const [autoRun, setAutoRun] = useState(account?.autoRunEnabled ?? false);
  const [prompt, setPrompt] = useState(account?.systemPrompt ?? "");
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState(account?.canvaTemplateId ?? "");
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  if (!account) return null;

  function applyTemplate() {
    if (!account) return;
    setApplyingTemplate(true);
    void saveCanvaTemplate(account.id, templateId)
      .then(() => notify("テンプレートを適用しました"))
      .catch((error: unknown) => notify(error instanceof Error ? error.message : "テンプレートの適用に失敗しました"))
      .finally(() => setApplyingTemplate(false));
  }

  return (
    <Modal
      title={`${account.handle} エージェント設定`}
      icon="instagram"
      width={720}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal} disabled={saving}>
            キャンセル
          </button>
          <button
            className="btn primary"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void saveGuideline(account.id, {
                title: title.trim(),
                target: target.trim(),
                concept: concept.trim(),
                schedule,
                autoRunEnabled: autoRun,
                systemPrompt: prompt
              })
                .then(() => {
                  notify(apiReady ? "ガイドラインを保存しました" : "ローカルのみ保存しました");
                  closeModal();
                })
                .catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "保存に失敗しました");
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "保存中…" : "設定を保存"}
          </button>
        </>
      }
    >
      <div className="stack gap-16">
        <div className="segmented" role="tablist" aria-label="設定セクション">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "basic" ? (
          <BasicTab
            title={title}
            target={target}
            concept={concept}
            prompt={prompt}
            onTitle={setTitle}
            onTarget={setTarget}
            onConcept={setConcept}
            onPrompt={setPrompt}
          />
        ) : null}
        {tab === "references" ? <ReferencesTab accountId={account.id} /> : null}
        {tab === "images" ? <ImageLibrary accountId={account.id} notify={notify} /> : null}
        {tab === "automation" ? (
          <AutomationTab
            accountId={account.id}
            autoRun={autoRun}
            schedule={schedule}
            templateId={templateId}
            applyingTemplate={applyingTemplate}
            onAutoRun={setAutoRun}
            onSchedule={setSchedule}
            onTemplateId={setTemplateId}
            onApplyTemplate={applyTemplate}
          />
        ) : null}
        {tab === "references" || tab === "images" ? (
          <span className="muted small">このタブの変更は即時に反映されます（「設定を保存」は不要）。</span>
        ) : null}
      </div>
    </Modal>
  );
}
