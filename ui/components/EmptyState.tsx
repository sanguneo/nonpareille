import type { ReactNode } from "react";
import mascot from "../assets/mascot-960.webp";
import { cx } from "./cx.ts";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary / secondary actions rendered under the text. */
  actions?: ReactNode;
  /** Show the mascot illustration (default true). */
  art?: boolean;
  className?: string;
}

export function EmptyState({ title, description, actions, art = true, className }: EmptyStateProps) {
  return (
    <div className={cx("empty_state", className)}>
      {art ? <img className="empty_state_art" src={mascot} alt="" width={960} height={640} loading="lazy" /> : null}
      <h2 className="empty_state_title">{title}</h2>
      {description !== undefined ? <p className="empty_state_desc">{description}</p> : null}
      {actions !== undefined ? <div className="cluster">{actions}</div> : null}
    </div>
  );
}
