import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "./cx.ts";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/** Radio-group style selector with roving tabindex (arrow keys move and select). */
export function Segmented<T extends string>({ options, value, onChange, size = "md", className, ...aria }: SegmentedProps<T>) {
  const enabled = options.filter((option) => !option.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let target: SegmentedOption<T> | undefined;
    const index = enabled.findIndex((option) => option.value === value);
    if (NEXT_KEYS.has(event.key)) target = enabled[(index + 1) % enabled.length];
    else if (PREV_KEYS.has(event.key)) target = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    if (!target) return;
    event.preventDefault();
    onChange(target.value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons?.[options.findIndex((option) => option.value === target.value)]?.focus();
  };

  return (
    <div role="radiogroup" className={cx("segmented", size === "sm" && "segmented_sm", className)} {...aria}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            className="segmented_option"
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
