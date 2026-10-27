"use client";

interface BasicTabProps {
  readonly title: string;
  readonly target: string;
  readonly concept: string;
  readonly prompt: string;
  readonly onTitle: (value: string) => void;
  readonly onTarget: (value: string) => void;
  readonly onConcept: (value: string) => void;
  readonly onPrompt: (value: string) => void;
}

/** Guideline basics and the agent system prompt. */
export function BasicTab({ title, target, concept, prompt, onTitle, onTarget, onConcept, onPrompt }: BasicTabProps) {
  return (
    <div className="stack gap-16">
      <div className="tile stack gap-8">
        <span className="label">ターゲット & コンセプト（ガイドライン）</span>
        <input
          className="input"
          aria-label="アカウント一覧の表示タイトル"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="アカウント一覧の表示タイトル"
        />
        <input className="input" aria-label="ターゲット" value={target} onChange={(e) => onTarget(e.target.value)} />
        <input className="input" aria-label="コンセプト" value={concept} onChange={(e) => onConcept(e.target.value)} />
      </div>
      <div className="tile stack gap-8">
        <span className="label">システムプロンプト</span>
        <textarea
          className="textarea"
          rows={6}
          aria-label="システムプロンプト"
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
        />
      </div>
    </div>
  );
}
