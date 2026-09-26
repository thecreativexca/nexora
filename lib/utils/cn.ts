export type ClassValue = string | false | null | undefined;

/** Tiny class-name joiner (keeps the dependency list small). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
