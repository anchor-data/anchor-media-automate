"use client";

import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "../icon";

interface ModalProps {
  title: string;
  icon?: IconName;
  width: number;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function Modal({ title, icon, width, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="modal-head">
          <span className="title">
            {icon ? <Icon name={icon} size={16} /> : null}
            {title}
          </span>
          <button aria-label="閉じる" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}
