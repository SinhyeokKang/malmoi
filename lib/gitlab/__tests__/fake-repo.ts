import { createHash } from "node:crypto";

import { blobSha } from "@/lib/githash";

import { violatesAddressContract, type FakeCall } from "./fake-fetch";

/**
 * **상태를 가진 GitLab 가짜 리포** (gitlab-repositories tasks §3 첫 항목 — 호출 기록·실패 주입·페이지네이션). 경로별 고정 응답(`fake-fetch.ts`)으로는
 * "no-changes 두 번째 실행의 쓰기 0"처럼 **앞 실행이 바꾼 상태 위의 다음 실행**을 잴 수 없다 — 그래서 브랜치·트리·MR을 들고 W0 실측(design §2 Publish 표)대로
 * 답한다: `force: true` 커밋은 parent = `start_sha` · 같은 source의 열린 MR이 있으면 MR 생성 409 · 브랜치 삭제는 그 브랜치의 열린 MR을 닫는다 ·
 * 없는 브랜치 삭제 404. blob id는 실제 git blob SHA다(2층 비교가 로컬 `git hash-object`와 같은 값을 본다).
 *
 * ⚠️ 주소 계약(`violatesAddressContract`)을 같이 잰다 — 이 가짜를 쓰는 테스트는 모두 숫자 id 주소를 단언한다.
 */

export type FakeMergeRequest = {
  iid: number; title: string; source_branch: string; target_branch: string; state: "opened" | "closed" | "merged";
  source_project_id: number; target_project_id: number; web_url: string; description?: string;
};

export type FakeRepoOptions = {
  repositoryId: string;
  pathWithNamespace?: string;
  archived?: boolean;
  /** 브랜치 → head 커밋. */
  branches: Record<string, string>;
  /**
   * 커밋 → 파일(경로 → 내용). 트리 항목 id는 내용의 blob SHA다. 디렉터리 항목은 경로에서 만든다. 문자열은 UTF-8 바이트, `Buffer`는 그 바이트 그대로다
   * (UTF-16·잘못된 UTF-8 — 아래 `jsonCopy`가 GitLab JSON API의 변환을 흉내 낸다).
   */
  commits: Record<string, Record<string, FileBody>>;
  /** 커밋 → 부모 커밋(시드 커밋 사이의 이력). compare의 `commits`가 이 사슬을 따른다 — 이 가짜가 만든 커밋은 스스로 잇는다. */
  parents?: Record<string, string>;
  mergeRequests?: FakeMergeRequest[];
  /** 호출자 권한 — GitLab 사용자 id → 유효 access level(`members/all`). 없는 사용자는 404(멤버 아님). */
  members?: Record<string, number>;
  /** 트리 페이지 크기(keyset). 기본 100. */
  treePageSize?: number;
  /** `METHOD /path-pattern` 키가 n번째(1부터, 없으면 매번) 불릴 때 그 상태로 답한다. 패턴의 `:x`는 조각 하나다. */
  failOn?: { key: string; nth?: number; status: number; body?: unknown }[];
};

/** 파일 내용 — 문자열은 UTF-8, `Buffer`는 저장 바이트 그대로. */
export type FileBody = string | Buffer;

const bytesOf = (body: FileBody): Buffer => (typeof body === "string" ? Buffer.from(body) : body);
const sameBody = (a: FileBody | undefined, b: FileBody | undefined): boolean => (a === undefined || b === undefined ? a === b : bytesOf(a).equals(bytesOf(b)));

/**
 * **GitLab JSON blob API(`/repository/blobs/:sha`)·files API가 주는 사본** — 실물 측정(apple-strings Q1 결함 D1, 2026-10-19 GitLab.com): 182바이트 UTF-16LE+BOM 파일이
 * `size: 182`인데 content는 UTF-8+BOM으로 바꾼 129바이트(`efbbbf…`)였다. 원본 바이트는 `/raw`만 준다. BOM 있는 UTF-16은 그 측정대로 UTF-8+BOM이다.
 * BOM 없는 UTF-16(NUL 패턴)과 잘못된 UTF-8은 실측이 없다 — 같은 변환(BOM 없이 UTF-8 · 대체 문자)으로 **가정**한다. 둘 다 원본 바이트를 숨긴다는 점이 요지다.
 */
function jsonCopy(bytes: Buffer): Buffer {
  const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return Buffer.concat([utf8Bom, Buffer.from(bytes.subarray(2).toString("utf16le"))]);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.concat([utf8Bom, Buffer.from(Buffer.from(bytes.subarray(2)).swap16().toString("utf16le"))]);
  let odd = 0;
  let even = 0;
  bytes.forEach((b, i) => { if (b === 0) { if (i % 2 === 0) even += 1; else odd += 1; } });
  if (odd >= 2 && odd > even) return Buffer.from(bytes.toString("utf16le"));
  if (even >= 2 && even > odd) return Buffer.from(Buffer.from(bytes).swap16().toString("utf16le"));
  return Buffer.from(new TextDecoder("utf-8").decode(bytes));
}

export function createFakeGitLabRepo(options: FakeRepoOptions) {
  const id = options.repositoryId;
  const base = `/projects/${id}`;
  const branches = new Map(Object.entries(options.branches));
  const commits = new Map(Object.entries(options.commits).map(([sha, files]) => [sha, new Map(Object.entries(files))]));
  const parents = new Map<string, string>(Object.entries(options.parents ?? {}));
  const blobs = new Map<string, FileBody>();
  for (const files of commits.values()) for (const content of files.values()) blobs.set(blobSha(bytesOf(content)), content);
  const mergeRequests: FakeMergeRequest[] = options.mergeRequests?.map((mr) => ({ ...mr })) ?? [];
  const notes: { iid: number; body: string }[] = [];
  const calls: FakeCall[] = [];
  const hits = new Map<string, number>();
  const pageSize = options.treePageSize ?? 100;
  const web = `https://gitlab.com/${options.pathWithNamespace ?? "g/sub/app"}`;

  function respond(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  }

  function treeOf(sha: string): { id: string; path: string; type: string; mode: string; name: string }[] {
    const files = commits.get(sha);
    if (files === undefined) return [];
    const dirs = new Set<string>();
    for (const path of files.keys()) {
      const parts = path.split("/");
      for (let depth = 1; depth < parts.length; depth += 1) dirs.add(parts.slice(0, depth).join("/"));
    }
    const entries = [
      ...[...dirs].map((path) => ({ id: createHash("sha1").update(`tree:${sha}:${path}`).digest("hex"), path, type: "tree", mode: "040000", name: path.split("/").at(-1)! })),
      ...[...files].map(([path, content]) => ({ id: blobSha(bytesOf(content)), path, type: "blob", mode: "100644", name: path.split("/").at(-1)! })),
    ];
    return entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  function matchRoute(method: string, path: string): { key: string; params: string[] } | null {
    const patterns = [
      ["GET", ""], ["GET", "/repository/branches/:b"], ["DELETE", "/repository/branches/:b"], ["GET", "/repository/branches"], ["GET", "/repository/tree"],
      ["GET", "/repository/blobs/:s"], ["GET", "/repository/blobs/:s/raw"], ["POST", "/repository/commits"], ["GET", "/repository/compare"], ["GET", "/merge_requests"], ["POST", "/merge_requests"],
      ["GET", "/merge_requests/:n"], ["PUT", "/merge_requests/:n"], ["POST", "/merge_requests/:n/notes"], ["GET", "/members/all/:u"],
    ] as const;
    if (method === "POST" && path === "/api/graphql") return { key: "POST /api/graphql", params: [] };
    if (!path.startsWith(base)) return null;
    const rest = path.slice(base.length);
    for (const [m, pattern] of patterns) {
      if (m !== method) continue;
      const regex = new RegExp(`^${pattern.replace(/:[a-z]/g, "([^/]+)")}$`);
      const matched = regex.exec(rest);
      if (matched !== null) return { key: `${m} ${pattern}`, params: matched.slice(1).map(decodeURIComponent) };
    }
    return null;
  }

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? init.body : null;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, headers: new Headers(init?.headers), body });
    if (violatesAddressContract(url, body)) throw new Error(`address contract: GitLab must be addressed by numeric id — ${url.pathname}`);
    const path = url.pathname.replace(/^\/api\/v4/, "");
    const route = matchRoute(method, path);
    if (route === null) throw new Error(`unexpected GitLab request: ${method} ${path}`);
    const hit = (hits.get(route.key) ?? 0) + 1;
    hits.set(route.key, hit);
    const failure = options.failOn?.find((f) => f.key === route.key && (f.nth === undefined || f.nth === hit));
    if (failure !== undefined) return respond(failure.body ?? { message: "fake failure" }, failure.status);
    const json = (): Record<string, unknown> => (body === null ? {} : JSON.parse(body) as Record<string, unknown>);
    const q = url.searchParams;

    switch (route.key) {
      case "GET ":
        return respond({ id: Number(id), path_with_namespace: options.pathWithNamespace ?? "g/sub/app", default_branch: "main", archived: options.archived ?? false, repository_object_format: "sha1", runners_token: "GR-fake" });
      case "GET /repository/branches/:b": {
        const sha = branches.get(route.params[0]!);
        return sha === undefined ? respond({ message: "404 Branch Not Found" }, 404) : respond({ name: route.params[0], commit: { id: sha, committed_date: "2026-10-12T08:47:45.000+00:00" } });
      }
      case "GET /repository/branches":
        return respond([...branches.keys()].map((name) => ({ name })), 200, { "x-next-page": "" });
      case "DELETE /repository/branches/:b": {
        const name = route.params[0]!;
        if (!branches.has(name)) return respond({ message: "404 Branch Not Found" }, 404);
        branches.delete(name);
        // W0 실측: source 브랜치를 지우면 열린 MR이 스스로 닫힌다.
        for (const mr of mergeRequests) if (mr.source_branch === name && mr.state === "opened") mr.state = "closed";
        return respond(undefined, 204);
      }
      case "GET /repository/tree": {
        const entries = treeOf(q.get("ref") ?? "");
        const start = Number(q.get("page_token") ?? "0");
        const page = entries.slice(start, start + pageSize);
        const next: Record<string, string> = start + pageSize < entries.length ? { link: `<https://gitlab.com/api/v4${base}/repository/tree?page_token=${start + pageSize}&pagination=keyset&per_page=${pageSize}&recursive=true&ref=${q.get("ref")}>; rel="next"` } : {};
        return respond(page, 200, next);
      }
      case "GET /repository/blobs/:s": {
        const content = blobs.get(route.params[0]!);
        // `size`는 저장 바이트인데 content는 GitLab이 바꾼 사본이다(`jsonCopy` — 실측 D1).
        return content === undefined ? respond({ message: "404 Blob Not Found" }, 404) : respond({ size: bytesOf(content).length, encoding: "base64", content: jsonCopy(bytesOf(content)).toString("base64"), sha: route.params[0] });
      }
      case "GET /repository/blobs/:s/raw": {
        const content = blobs.get(route.params[0]!);
        return content === undefined ? respond({ message: "404 Blob Not Found" }, 404) : new Response(new Uint8Array(bytesOf(content)), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      case "POST /repository/commits": {
        const { branch, start_sha, force, actions } = json() as { branch: string; start_sha: string; force?: boolean; actions: { action: string; file_path: string; content?: string; encoding?: string }[] };
        if (branches.has(branch) && force !== true) return respond({ message: `A branch called '${branch}' already exists.` }, 400);
        const files = new Map(commits.get(start_sha) ?? []);
        for (const action of actions) {
          if (action.action === "create" && files.has(action.file_path)) return respond({ message: "A file with this name already exists" }, 400);
          if ((action.action === "update" || action.action === "delete") && !files.has(action.file_path)) return respond({ message: "A file with this name doesn't exist" }, 400);
          if (action.action === "delete") { files.delete(action.file_path); continue; }
          if (action.content === undefined) return respond({ message: "content is missing" }, 400);
          // `encoding: "base64"` action은 그 바이트를 그대로 저장한다(실측 — Q1이 올린 UTF-16 blob이 로컬 `git hash-object`와 같았다).
          const stored: FileBody = action.encoding === "base64" ? Buffer.from(action.content, "base64") : action.content;
          files.set(action.file_path, stored);
          blobs.set(blobSha(bytesOf(stored)), stored);
        }
        // 실물처럼 같은 내용도 새 커밋이다(커밋 시각이 다르다) — 순번을 섞는다.
        const sha = createHash("sha1").update(`${start_sha}:${commits.size}:${body}`).digest("hex");
        commits.set(sha, files);
        parents.set(sha, start_sha);
        branches.set(branch, sha);
        return respond({ id: sha, parent_ids: [start_sha] }, 201);
      }
      case "GET /repository/compare": {
        // `from`(커밋)과 `to`(브랜치 또는 커밋) 사이를 실제로 계산한다 — 고정 "변경 없음"이면 "base가 앞섰다" 갈래를 어느 테스트도 못 만든다(audit E5).
        // `straight=true`(호출부가 늘 준다)라 diff는 두 트리의 직접 비교다. 모르는 ref는 실물처럼 404다.
        const from = q.get("from") ?? "";
        const to = branches.get(q.get("to") ?? "") ?? q.get("to") ?? "";
        const [before, after] = [commits.get(from), commits.get(to)];
        if (before === undefined || after === undefined) return respond({ message: "404 Ref Not Found" }, 404);
        const ahead: { id: string }[] = [];
        for (let at: string | undefined = to; at !== undefined && at !== from; at = parents.get(at)) ahead.push({ id: at });
        const paths = [...new Set([...before.keys(), ...after.keys()])].filter((path) => !sameBody(before.get(path), after.get(path))).sort();
        const diffs = paths.map((path) => ({ old_path: path, new_path: path, new_file: !before.has(path), deleted_file: !after.has(path), renamed_file: false }));
        return respond({ commits: from === to ? [] : ahead.reverse(), diffs, compare_timeout: false });
      }
      case "GET /merge_requests": {
        const rows = mergeRequests.filter((mr) => (q.get("state") === null || mr.state === q.get("state")) && (q.get("source_branch") === null || mr.source_branch === q.get("source_branch")));
        return respond(rows, 200, { "x-next-page": "" });
      }
      case "POST /merge_requests": {
        const { source_branch, target_branch, title, description } = json() as { source_branch: string; target_branch: string; title: string; description: string };
        const open = mergeRequests.find((mr) => mr.state === "opened" && mr.source_branch === source_branch && mr.source_project_id === Number(id));
        if (open !== undefined) return respond({ message: [`Another open merge request already exists for this source branch: !${open.iid}`] }, 409);
        if (!branches.has(source_branch)) return respond({ message: { source_branch: ["does not exist"] } }, 400);
        const iid = Math.max(0, ...mergeRequests.map((mr) => mr.iid)) + 1;
        const mr: FakeMergeRequest = { iid, title, description, source_branch, target_branch, state: "opened", source_project_id: Number(id), target_project_id: Number(id), web_url: `${web}/-/merge_requests/${iid}` };
        mergeRequests.push(mr);
        return respond(mr, 201);
      }
      case "GET /merge_requests/:n": {
        const mr = mergeRequests.find((row) => row.iid === Number(route.params[0]));
        return mr === undefined ? respond({ message: "404 Not found" }, 404) : respond(mr);
      }
      case "PUT /merge_requests/:n": {
        const mr = mergeRequests.find((row) => row.iid === Number(route.params[0]));
        if (mr === undefined) return respond({ message: "404 Not found" }, 404);
        const update = json() as { title?: string; target_branch?: string; state_event?: string; description?: string };
        if (update.title !== undefined) mr.title = update.title;
        if (update.description !== undefined) mr.description = update.description;
        if (update.target_branch !== undefined) mr.target_branch = update.target_branch;
        if (update.state_event === "close") mr.state = "closed";
        return respond(mr);
      }
      case "GET /members/all/:u": {
        const level = options.members?.[route.params[0]!];
        return level === undefined ? respond({ message: "404 Not found" }, 404) : respond({ id: Number(route.params[0]), username: `u${route.params[0]}`, access_level: level, state: "active", membership_state: "active" });
      }
      case "POST /api/graphql": {
        // `repository.blobs` — 숫자 id 주소(`projects(ids:)`)로만 답한다. 크기는 문자열이다(실측).
        const { variables } = json() as { variables: { ids: string[]; ref: string; paths: string[] } };
        if (variables.ids[0] !== `gid://gitlab/Project/${id}`) return respond({ data: { projects: { nodes: [] } } });
        const files = commits.get(variables.ref) ?? new Map<string, FileBody>();
        const nodes = variables.paths.flatMap((path) => {
          const content = files.get(path);
          return content === undefined ? [] : [{ path, size: String(bytesOf(content).length), lfsOid: null, oid: blobSha(bytesOf(content)) }];
        });
        return respond({ data: { projects: { nodes: [{ id: variables.ids[0], repository: { blobs: { pageInfo: { hasNextPage: false }, nodes } } }] } } });
      }
      case "POST /merge_requests/:n/notes":
        notes.push({ iid: Number(route.params[0]), body: String(json().body) });
        return respond({ id: notes.length }, 201);
      default:
        throw new Error(`unhandled fake route ${route.key}`);
    }
  }) as typeof globalThis.fetch;

  return {
    fetch,
    calls,
    branches,
    commits,
    parents,
    mergeRequests,
    notes,
    /** 비GET 호출(쓰기) — "쓰기 0회" 단언이 이것을 본다. GraphQL 크기 조회(POST)는 읽기라 뺀다. */
    writes: () => calls.filter((call) => call.method !== "GET" && !call.url.pathname.endsWith("/api/graphql")),
    reset: () => { calls.length = 0; },
  };
}
