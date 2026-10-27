"use client";

import type { ReactNode } from "react";

interface PageTopbarProps {
  readonly title: ReactNode;
  readonly children?: ReactNode;
}

/** Title bar shared by every screen; actions sit on the right. */
export function PageTopbar({ title, children }: PageTopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      {children ? <div className="topbar-actions">{children}</div> : null}
    </header>
  );
}

interface TabsProps<T extends string> {
  readonly value: T;
  readonly options: readonly { readonly id: T; readonly label: ReactNode }[];
  readonly onChange: (id: T) => void;
  readonly label: string;
  /** `underline` for in-page tabs, `pill` for the segmented control look. */
  readonly variant?: "underline" | "pill";
}

export function Tabs<T extends string>({ value, options, onChange, label, variant = "underline" }: TabsProps<T>) {
  return (
    <div className={variant === "pill" ? "segmented" : "tabs"} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "active" : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
