import { fail } from "@/lib/failure";
export function requireRepositoryId(expected: string | null | undefined, actual: string): void {
  if (!expected || !/^[1-9][0-9]*$/.test(expected) || expected !== actual) {
    fail("repository identity changed or is not pinned; reconnect the project", "not-installed");
  }
}
