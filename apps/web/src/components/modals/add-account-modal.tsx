"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_RUN_SCHEDULES } from "@ama/shared";
import { Icon } from "../icon";
import { DesignSummary } from "../design/design-summary";
import { ScreenshotPicker } from "../design/screenshot-picker";
import { StructureEditor, structureIssues } from "../design/structure-editor";
import { useAccountDesign } from "../design/use-account-design";
import { useWorkspace } from "../workspace-context";
import { MAX_SCREENSHOTS } from "../../lib/screenshots";
import { SCHEDULE_OPTIONS } from "../../lib/mock-data";
import { Modal } from "./modal";

const STEPS = ["アカウント", "ターゲット・コンセプト", "デザイン", "スライド構成", "スケジュール", "完了"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;
const LAST: StepIndex = 5;

function Stepper({ step }: { step: StepIndex }) {
  return (
    <ol className="row gap-8" style={{ listStyle: "none", margin: 0, padding: 0, flexWrap: "wrap" }} aria-label="進捗">
      {STEPS.map((label, index) => (
        <li key={label} className="row gap-4" style={{ alignItems: "center", opacity: index <= step ? 1 : 0.45 }}>
          <span
            style={{
              width: 22, height: 22, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12,
              background: index < step ? "#16a34a" : index === step ? "#1d4ed8" : "#cbd5e1", color: "#fff"
            }}
          >
            {index < step ? <Icon name="check" size={12} /> : index + 1}
          </span>
          <span className={index === step ? "strong small" : "muted small"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Add an account step by step: basics, audience, design, page structure, schedule. Every step after the first can be skipped and finished later. */
export function AddAccountModal() {
  const router = useRouter();
  const { closeModal, addAccount, saveAutoRun, notify, apiReady } = useWorkspace();
  const [step, setStep] = useState<StepIndex>(0);
  const [accountId, setAccountId] = useState("");
  const [creating, setCreating] = useState(false);

  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [concept, setConcept] = useState("");
  const [schedule, setSchedule] = useState<string>(SCHEDULE_OPTIONS[0]);
  const [autoRun, setAutoRun] = useState(false);
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const state = useAccountDesign(accountId);
  const busy = state.busy !== null;

  const create = async () => {
    setCreating(true);
    try {
      const id = await addAccount(handle, schedule, target, concept, title);
      setAccountId(id);
      setStep(2);
    } catch (error) {
      notify(error instanceof Error ? error.message : "アカウントの追加に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const finishSchedule = async () => {
    setSavingSchedule(true);
    try {
      await saveAutoRun(accountId, autoRun, schedule);
      setStep(5);
    } catch (error) {
      notify(error instanceof Error ? error.message : "スケジュールを保存できませんでした");
    } finally {
      setSavingSchedule(false);
    }
  };

  const next = () => setStep((s) => Math.min(LAST, s + 1) as StepIndex);
  const back = () => setStep((s) => Math.max(0, s - 1) as StepIndex);
  const structureValid = structureIssues(state.structure).length === 0;
  const designOffline = !apiReady;

  let body;
  let footer;
  switch (step) {
    case 0:
      body = (
        <div className="stack gap-12">
          <p className="muted small" style={{ margin: 0 }}>投稿を作るInstagramアカウントを追加します。以降の設定は、あとから「デザイン」と「エージェント」のタブでも変更できます。</p>
          <label className="label" htmlFor="acc-handle">アカウント名 / ID</label>
          <input id="acc-handle" className="input" placeholder="@username" value={handle} onChange={(e) => setHandle(e.target.value)} />
          <label className="label" htmlFor="acc-title">一覧に表示するタイトル</label>
          <input id="acc-title" className="input" placeholder="例: エンジニア転職" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" onClick={closeModal}>キャンセル</button>
          <button className="btn primary" disabled={handle.trim().length === 0} onClick={() => setStep(1)}>次へ</button>
        </>
      );
      break;
    case 1:
      body = (
        <div className="stack gap-12">
          <p className="muted small" style={{ margin: 0 }}>AIが企画を作るためのベースです。「エージェント」タブの「ペルソナ・ガイドライン」で、あとから変更できます。</p>
          <label className="label" htmlFor="acc-target">ターゲット層</label>
          <input id="acc-target" className="input" placeholder="例: 20代のフリーランス" value={target} onChange={(e) => setTarget(e.target.value)} />
          <label className="label" htmlFor="acc-concept">ワンラインコンセプト</label>
          <input id="acc-concept" className="input" placeholder="例: 未経験からデザインを学ぶノウハウ" value={concept} onChange={(e) => setConcept(e.target.value)} />
          <p className="muted small" style={{ margin: 0 }}>「次へ」でアカウントを作成します。</p>
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" disabled={creating} onClick={back}>戻る</button>
          <button className="btn primary" disabled={creating} onClick={() => void create()}>{creating ? "作成中…" : "アカウントを作成して次へ"}</button>
        </>
      );
      break;
    case 2:
      body = (
        <div className="stack gap-12">
          <p className="muted small" style={{ margin: 0 }}>参考の投稿のスクリーンショットと、文章でのガイドラインから、このアカウントのデザインを作ります。空欄でも進めます(標準のデザインになります)。</p>
          {designOffline ? <p className="note-box">API未接続のため、デザインはあとで設定してください。</p> : null}
          <ScreenshotPicker value={screenshots} onChange={setScreenshots} onError={notify} disabled={designOffline || busy} />
          <span className="muted small">最大{MAX_SCREENSHOTS}枚。参考アカウントのリンクは出典メモとして保存するだけで、取得はしません。</span>
          <input className="input" placeholder="参考アカウント (@handle または instagram.com/…)" value={state.referenceNote} onChange={(e) => state.setReferenceNote(e.target.value)} />
          <textarea className="textarea" rows={4} placeholder="自由文のガイドライン 例: 清潔感のある青系。見出しは太く。絵文字は使わない" value={state.guideline} onChange={(e) => state.setGuideline(e.target.value)} />
          <button
            className="btn primary"
            disabled={designOffline || busy || (screenshots.length === 0 && state.guideline.trim() === "")}
            onClick={() => void state.analyze(screenshots)}
          >
            <Icon name="sparkles" size={14} />
            {state.busy === "analyze" ? "作成中…" : state.design?.hasDesign ? "デザインを作り直す" : "デザインを作成"}
          </button>
          {state.design?.hasDesign ? <DesignSummary design={state.design} handle={handle.startsWith("@") ? handle : `@${handle}`} previewWidth={150} /> : null}
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" disabled={busy} onClick={next}>あとで設定</button>
          <button className="btn primary" disabled={busy} onClick={next}>次へ</button>
        </>
      );
      break;
    case 3:
      body = (
        <div className="stack gap-12">
          <p className="muted small" style={{ margin: 0 }}>1投稿のページ数と並びを決めます(3〜10枚)。前のステップのスクリーンショットから、AIが推定できます。</p>
          {state.design?.structureSummary ? <p className="small" style={{ margin: 0 }}>推定: {state.design.structureSummary}</p> : null}
          <button className="btn outline sm" disabled={designOffline || busy || screenshots.length === 0} onClick={() => void state.analyzeStructure(screenshots)}>
            <Icon name="sparkles" size={12} />
            {state.busy === "structure" ? "推定中…" : screenshots.length === 0 ? "参考のスクリーンショットがありません" : "参考から推定"}
          </button>
          <StructureEditor value={state.structure} onChange={state.setStructure} disabled={busy} />
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" disabled={busy} onClick={back}>戻る</button>
          <button className="btn ghost" disabled={busy} onClick={next}>あとで設定</button>
          <button
            className="btn primary"
            disabled={busy || !structureValid}
            onClick={() => void (designOffline ? Promise.resolve(true) : state.saveStructure()).then((ok) => ok && next())}
          >
            {state.busy === "structure-save" ? "保存中…" : "この構成で次へ"}
          </button>
        </>
      );
      break;
    case 4:
      body = (
        <div className="stack gap-12">
          <p className="muted small" style={{ margin: 0 }}>企画の提案と投稿の生成を、決まった時間に自動で行います。オフのままでも、手動で生成できます。</p>
          <label className="row gap-8" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            自動で生成する
          </label>
          <label className="label" htmlFor="acc-schedule">投稿生成スケジュール</label>
          <select id="acc-schedule" className="select" disabled={!autoRun} value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            {AUTO_RUN_SCHEDULES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" disabled={savingSchedule} onClick={back}>戻る</button>
          <button className="btn ghost" disabled={savingSchedule} onClick={() => setStep(5)}>あとで設定</button>
          <button className="btn primary" disabled={savingSchedule} onClick={() => void finishSchedule()}>{savingSchedule ? "保存中…" : "次へ"}</button>
        </>
      );
      break;
    default:
      body = (
        <div className="stack gap-12">
          <p style={{ margin: 0 }}><strong>{title.trim() || handle}</strong> を追加しました。</p>
          <ul className="bullets small">
            <li>ターゲット: {target.trim() || "未設定"} / コンセプト: {concept.trim() || "未設定"}</li>
            <li>デザイン: {state.design?.hasDesign ? "作成済み" : "標準のデザイン"} · スライド構成: {state.structure.length > 0 ? `${state.structure.length}枚` : "標準(8枚)"}</li>
            <li>自動生成: {autoRun ? schedule : "オフ"}</li>
          </ul>
          <p className="muted small" style={{ margin: 0 }}>設定は「デザイン」タブと「エージェント」タブから、いつでも変更できます。</p>
        </div>
      );
      footer = (
        <>
          <button className="btn ghost" onClick={closeModal}>閉じる</button>
          <button className="btn outline" onClick={() => { closeModal(); router.push("/design"); }}>デザインを確認</button>
          <button className="btn primary" onClick={() => { closeModal(); router.push("/ideas"); }}>最初の企画を提案してもらう</button>
        </>
      );
  }

  return (
    <Modal title="アカウント追加" icon="plus" width={780} onClose={closeModal} footer={footer}>
      <div className="stack gap-16">
        <Stepper step={step} />
        {body}
      </div>
    </Modal>
  );
}
