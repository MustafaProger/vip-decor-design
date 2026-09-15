import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "text";
const classes = (variant: Variant, className = "") =>
  `${variant === "text" ? "text-link" : `button${variant === "secondary" ? " secondary" : ""}`} ${className}`.trim();

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type={type} className={classes(variant, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={classes(variant, className)} {...props} />;
}
