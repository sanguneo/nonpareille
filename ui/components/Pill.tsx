import type { HTMLAttributes } from "react";
import { cx } from "./cx.ts";

export type PillTone = "neutral" | "accent" | "ok" | "danger" | "outline";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** Leading status dot in the current text color. */
  dot?: boolean;
}

const TONE_CLASS: Record<PillTone, string | undefined> = {
  neutral: undefined,
  accent: "pill_accent",
  ok: "pill_ok",
  danger: "pill_danger",
  outline: "pill_outline",
};

export function Pill({ tone = "neutral", dot = false, className, children, ...rest }: PillProps) {
  return (
    <span className={cx("pill", TONE_CLASS[tone], className)} {...rest}>
      {dot ? <span className="pill_dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
