"use client";

import { Icon } from "./icon";

export type StepState = "done" | "current" | "upcoming";

export interface WorkflowStep {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
  readonly onSelect?: () => void;
}

export function WorkflowSteps({ steps }: { steps: readonly WorkflowStep[] }) {
  return (
    <ol className="steps" aria-label="制作の進行状況">
      {steps.map((step, index) => {
        const body = (
          <>
            <span className="step-dot">
              {step.state === "done" ? <Icon name="check" size={12} /> : index + 1}
            </span>
            <span className="step-label">{step.label}</span>
          </>
        );
        return (
          <li
            key={step.key}
            className={`step ${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {step.onSelect ? (
              <button type="button" onClick={step.onSelect}>
                {body}
              </button>
            ) : (
              <span className="step-static">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
