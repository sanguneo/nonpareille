import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.ts";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  /** Stretch to the container width. */
  block?: boolean;
}

export function Button({ variant = "primary", size = "md", block = false, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", variant === "primary" ? "btn_primary" : "btn_ghost", size === "sm" && "btn_sm", block && "btn_block", className)}
      {...rest}
    />
  );
}
