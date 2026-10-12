#!/usr/bin/env tsx
/**
 * Read-only, DB-free live smoke. GITLAB_TEST_TOKEN + GITLAB_TEST_PROJECT (numeric id or namespace/path).
 * These are test-process inputs, never application configuration. No response bodies, paths or tokens are logged.
 * Run explicitly with pnpm smoke:gitlab; importing the pure checks in Vitest never calls the network.
 */
import { pathToFileURL } from "node:url";
import { createGitLabClient, openGitLabReader, type GitLabTarget } from "@/lib/gitlab/client";
import { classifyGitLabFailure, createGitLabTransport, isGitLabProjectId, nextPage, projectPath, type GitLabTransport } from "@/lib/gitlab/transport";
import { planProjectMeta } from "@/lib/gitlab-connect/access-plan";
import { isTokenShaped, planPatVerification, tokenExpired, type RemoteResult } from "@/lib/gitlab-connect/verify";
import type { GitTreeEntry } from "@/lib/pull/client";
import type { RepoSizes, RepoSnapshot } from "@/lib/repo-host/reader";

class SmokeFailure extends Error {}

export function parseSmokeInput(env: Readonly<Record<string, string | undefined>>): { token: string; project: string } {
  const token = env.GITLAB_TEST_TOKEN ?? "";
  const project = env.GITLAB_TEST_PROJECT ?? "";
  if (!isTokenShaped(token) || !(isGitLabProjectId(project) || /^[\w.-]+(?:\/[\w.-]+)+$/.test(project))) {
    throw new SmokeFailure("input-invalid");
  }
  return { token, project };
}

/** Compare the same immutable commit through reader and Publish client, including blob identity, not just counts. */
export function summarizeSmoke(snapshot: RepoSnapshot, tree: readonly GitTreeEntry[], sizes: RepoSizes, openMRs: number): string {
  if (snapshot.status !== "ok") throw new SmokeFailure(`snapshot-${snapshot.status}`);
  const blobs = tree.filter((entry) => ["100644", "100755", "120000"].includes(entry.mode));
  const identities = new Map(blobs.map((entry) => [entry.path, entry.sha]));
  if (blobs.length !== snapshot.files.length || snapshot.files.some((file) => identities.get(file.path) !== file.sha)) {
    throw new SmokeFailure("tree-mismatch");
  }
  if (sizes.status !== "ok") throw new SmokeFailure(`sizes-${sizes.status}`);
  let bytes = 0;
  for (const file of snapshot.files) {
    const size = sizes.sizes.get(file.path);
    if (size === undefined || !Number.isSafeInteger(size) || size < 0) throw new SmokeFailure("sizes-incomplete");
    bytes += size;
  }
  return `smoke:gitlab ok connection=ok identity=ok blobs=${blobs.length} bytes=${bytes} openMRs=${openMRs}`;
}

/** Resolve a display path via the list endpoint; all subsequent repository calls are pinned to the numeric id. */
async function resolveId(transport: GitLabTransport, project: string): Promise<string> {
  if (isGitLabProjectId(project)) return project;
  let page: string | null = "1";
  for (let read = 0; read < 100 && page !== null; read += 1) {
    const response = await transport.get("/projects", { search: project.split("/").at(-1)!, membership: "true", per_page: "100", page });
    if (!Array.isArray(response.body)) throw new SmokeFailure("project-list-invalid");
    for (const item of response.body) {
      if (typeof item !== "object" || item === null || item.path_with_namespace !== project) continue;
      if (!Number.isSafeInteger(item.id) || !isGitLabProjectId(String(item.id))) throw new SmokeFailure("project-id-invalid");
      return String(item.id);
    }
    page = nextPage(response.headers);
  }
  throw new SmokeFailure(page === null ? "project-not-found" : "project-list-truncated");
}

async function main(): Promise<void> {
  const { token, project } = parseSmokeInput(process.env);
  const transport = createGitLabTransport(token);
  let self: RemoteResult;
  try {
    self = { ok: true, body: (await transport.get("/personal_access_tokens/self")).body };
  } catch (error) {
    self = { ok: false, error };
  }
  const verified = planPatVerification(self);
  if (verified.status !== "ok") throw new SmokeFailure(verified.status);
  if (tokenExpired(verified.expiresAt, new Date())) throw new SmokeFailure("token-expired");
  const id = await resolveId(transport, project);
  const meta = planProjectMeta({ ok: true, body: (await transport.get(projectPath(id))).body }, id);
  if (meta.status !== "ok") throw new SmokeFailure(`project-${meta.status}`);
  if (!isGitLabProjectId(project) && `${meta.owner}/${meta.name}` !== project) throw new SmokeFailure("project-moved");
  const target: GitLabTarget = { host: "gitlab", repositoryId: id, owner: meta.owner, name: meta.name, connectionId: "smoke" };
  const credential = { token, gitlabUserId: verified.gitlabUserId, expiresAt: verified.expiresAt };
  const reader = await openGitLabReader(target, credential);
  const client = await createGitLabClient(target, credential);
  const snapshot = await reader.snapshot(meta.defaultBranch);
  if (snapshot.status !== "ok") throw new SmokeFailure(`snapshot-${snapshot.status}`);
  const tree = await client.getTree(snapshot.headSha);
  const sizes = await reader.sizes(snapshot, snapshot.files.map((file) => file.path));
  let page: string | null = "1";
  let openMRs = 0;
  for (let read = 0; read < 100 && page !== null; read += 1) {
    const response = await transport.get(projectPath(id, "merge_requests"), { state: "opened", per_page: "100", page });
    if (!Array.isArray(response.body)) throw new SmokeFailure("mr-list-invalid");
    openMRs += response.body.length;
    page = nextPage(response.headers);
  }
  if (page !== null) throw new SmokeFailure("mr-list-truncated");
  console.log(summarizeSmoke(snapshot, tree, sizes, openMRs));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Never print Error.message from I/O: paths and upstream response details are not a safe diagnostic contract.
    console.error(`smoke:gitlab failed reason=${error instanceof SmokeFailure ? error.message : classifyGitLabFailure(error)}`);
    process.exitCode = 1;
  });
}
