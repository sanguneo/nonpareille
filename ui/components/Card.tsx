import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Commands shown in the card head, after the title (split-nav secondary slot). */
  actions?: ReactNode;
  /** Smaller padding for dense panels. */
  tight?: boolean;
  as?: "section" | "article" | "div";
}

export function Card({ title, description, actions, tight = false, as: Tag = "section", className, children, ...rest }: CardProps) {
  const hasHead = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <Tag className={cx("card", tight && "card_tight", className)} {...rest}>
      {hasHead ? (
        <div className="card_head">
          {title !== undefined || description !== undefined ? (
            <div className="card_head_text">
              {title !== undefined ? <h2 className="card_title">{title}</h2> : null}
              {description !== undefined ? <p className="card_desc">{description}</p> : null}
            </div>
          ) : null}
          {actions !== undefined ? <div className="card_actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
