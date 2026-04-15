/**
 * Merge Tailwind class strings safely (clsx + tailwind-merge).
 * Import wherever you need dynamic class composition.
 *
 * Usage:
 *   import { cn } from "../utils/helpers";
 *   className={cn("base-class", condition && "extra-class")}
 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format an ISO date string to a readable locale date.
 */
export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Return initials from a full name (up to 2 chars).
 */
export function getInitials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");
}

/**
 * Capitalise the first letter of a string.
 */
export function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
