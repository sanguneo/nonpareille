import { useId, type ReactNode } from "react";
import { cx } from "./cx.ts";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Id of the control when it cannot be wrapped (otherwise the label wraps the control). */
  htmlFor?: string;
  /** Label a group of controls (e.g. Segmented) instead of a single input. */
  group?: boolean;
  /** Label and control side by side (checkbox rows). */
  inline?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, htmlFor, group = false, inline = false, className, children }: FieldProps) {
  const labelId = useId();
  const classes = cx("field", inline && "field_inline", className);
  const extras = (
    <>
      {hint !== undefined ? <p className="field_hint">{hint}</p> : null}
      {error !== undefined ? <p className="field_error" role="alert">{error}</p> : null}
    </>
  );

  if (group) {
    return (
      <div className={classes} role="group" aria-labelledby={labelId}>
        <span id={labelId} className="field_label">{label}</span>
        {children}
        {extras}
      </div>
    );
  }
  if (htmlFor !== undefined) {
    return (
      <div className={classes}>
        <label className="field_label" htmlFor={htmlFor}>{label}</label>
        {children}
        {extras}
      </div>
    );
  }
  return (
    <label className={classes}>
      <span className="field_label">{label}</span>
      {children}
      {extras}
    </label>
  );
}
