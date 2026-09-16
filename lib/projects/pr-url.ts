import type { OpenImportPr } from "@/lib/import/confirm";
export function parseGithubPrUrl(raw: string | null | undefined, project: { repoOwner: string; repoName: string }): OpenImportPr {
  if (raw === null || raw === undefined) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== "https://github.com" || url.username || url.password) return undefined;
    const parts = url.pathname.split("/");
    if (parts.length !== 5 || parts[1]?.toLowerCase() !== project.repoOwner.toLowerCase() || parts[2]?.toLowerCase() !== project.repoName.toLowerCase() || parts[3] !== "pull" || !/^[1-9][0-9]*$/.test(parts[4] ?? "")) return undefined;
    const number = Number(parts[4]);
    return Number.isSafeInteger(number) ? { number, url: raw } : undefined;
  } catch { return undefined; }
}
