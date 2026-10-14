import { describe, expect, it, vi } from "vitest";

import { classifySyncError } from "@/lib/sync/plan";

import { commitMessage, SKIP_MARKER } from "@/lib/pull/payload";
import { createGitLabClient, listGitLabBranches, loadGitLabHealth, openGitLabReader, TREE_PAGE_LIMIT } from "../client";
import { createFakeGitLabFetch, json, type FakeCall, type FakeRoute } from "./fake-fetch";

/**
 * **GitLab `GitClient`·`RepoReader` 계약** (gitlab-repositories tasks §3 — 가짜 fetch만으로 쓴다). 경계 서명은 `lib/pull/client.ts`·`lib/repo-host/reader.ts`이고
 * 실측은 design §2 Publish 표다. 여기서는 "무엇을 몇 번, 어느 주소로 부르나"와 "실패를 값/던짐으로 어떻게 가르나"를 고정한다.
 */

const REPO = "87515176";
const P = `/projects/${REPO}`;
const TARGET = { host: "gitlab" as const, owner: "g/sub", name: "app", repositoryId: REPO, connectionId: "conn-1" };
const CREDENTIAL = { token: "glpat-connector", expiresAt: null, gitlabUserId: "101" };
/** 토큰 주인(GitLab 101)의 유효 권한 — `members/all`(상속 포함). */
const OWNER = (level: number): Record<string, FakeRoute> => ({ [`GET ${P}/members/all/101`]: { status: 200, body: { id: 101, username: "alice", access_level: level, state: "active", membership_state: "active" } } });
const META = { id: Number(REPO), path_with_namespace: "g/sub/app", default_branch: "main", archived: false, repository_object_format: "sha1", runners_token: "GR-secret" };
const BASE = "b".repeat(40);
const SYNC = "malmoi-i18n/sync-app";
const SYNC_PATH = `${P}/repository/branches/${encodeURIComponent(SYNC)}`;

function client(routes: Record<string, FakeRoute>, credential = CREDENTIAL) {
  const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...routes });
  return { fake, open: () => createGitLabClient(TARGET, credential, { fetch: fake.fetch }) };
}
const writes = (calls: readonly FakeCall[]) => calls.filter((call) => call.method !== "GET");
const keys = (calls: readonly FakeCall[]) => calls.map((call) => `${call.method} ${call.url.pathname.replace(/^\/api\/v4/, "")}`);

describe("createGitLabClient — 생성 때 GET /projects/<id> 한 번(불변식 11의 GitLab 층)", () => {
  it("숫자 id로 한 번 부르고, 모든 요청에 **프로젝트가 참조하는 연결**의 PAT를 싣는다", async () => {
    const { fake, open } = client({ [`GET ${P}/repository/branches/main`]: { status: 200, body: { commit: { id: BASE, committed_date: "2026-10-12T08:47:45.000+00:00" } } } });
    const git = await open();
    await git.getRefSha("heads/main");
    expect(keys(fake.calls)).toEqual([`GET ${P}`, `GET ${P}/repository/branches/main`]);
    expect(fake.calls.every((call) => call.headers.get("PRIVATE-TOKEN") === "glpat-connector")).toBe(true);
  });

  it.each([
    ["보관", { ...META, archived: true }],
    ["SHA-256", { ...META, repository_object_format: "sha256" }],
  ])("⚠️ %s 프로젝트는 쓰기 클라이언트를 주지 않는다 — 재연결 필요(not-installed, 재시도 안 함)이고 다음 요청이 없다", async (_label, meta) => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: meta } });
    const error = await createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "not-installed", retryable: false });
    expect(fake.calls).toHaveLength(1);
  });

  it.each([401, 403, 404])("⚠️ %i(재인가·접근 상실)는 재연결 필요다 — 일시 장애로 접지 않는다", async (status) => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status } });
    const error = await createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "not-installed", retryable: false });
  });

  it.each([429, 500, 503])("%i는 일시 장애다 — 리포 호스트 실패(github-error, 재시도 가능)로 남는다", async (status) => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status } });
    const error = await createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "github-error", retryable: true });
  });

  it("⚠️ 저장된 만료일이 지났으면 원격을 한 번도 부르지 않고 재연결 필요다", async () => {
    const fake = createFakeGitLabFetch({});
    const error = await createGitLabClient(TARGET, { token: "t", expiresAt: new Date("2026-10-01T00:00:00Z"), gitlabUserId: "101" }, { fetch: fake.fetch, now: new Date("2026-10-12T00:00:00Z") }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "not-installed" });
    expect(fake.calls).toEqual([]);
  });

  it("응답 id가 다르면(동어반복이 깨지면) 쓰지 않는다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: { ...META, id: 1 } } });
    await expect(createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch })).rejects.toThrow();
  });
});

describe("읽기 — getRefSha · getTree · getBlobText", () => {
  it("getRefSha: `heads/<branch>`의 브랜치 이름을 경로 조각으로 인코딩하고, 404는 null(부재 — 첫 실행 경로)", async () => {
    const { fake, open } = client({ [`GET ${SYNC_PATH}`]: { status: 404, body: { message: "404 Branch Not Found" } } });
    const git = await open();
    await expect(git.getRefSha(`heads/${SYNC}`)).resolves.toBeNull();
    expect(fake.calls.at(-1)?.url.href).toBe(`https://gitlab.com/api/v4${SYNC_PATH}`);
    await expect(git.getRefSha("dev")).rejects.toThrow(/heads\//);
  });

  it("getRefSha: 404 밖의 실패는 던진다", async () => {
    const { open } = client({ [`GET ${P}/repository/branches/main`]: { status: 500 } });
    await expect((await open()).getRefSha("heads/main")).rejects.toThrow();
  });

  const page = (entries: object[], next?: string): FakeRoute => ({ status: 200, body: entries, headers: next === undefined ? {} : { link: `<https://gitlab.com/api/v4${P}/repository/tree?page_token=${next}&pagination=keyset&per_page=100&recursive=true&ref=${BASE}>; rel="next"` } });
  const entry = (path: string, mode = "100644", type = "blob") => ({ id: `${path}-sha`, name: path, type, path, mode });

  it("getTree: keyset을 `next`가 없을 때까지 읽고 mode를 보존한다", async () => {
    const pages: Record<string, FakeRoute> = { first: page([entry("a"), entry("d", "040000", "tree")], "t2"), t2: page([entry("d/b.json")]) };
    const { fake, open } = client({ [`GET ${P}/repository/tree`]: (call) => { const route = pages[call.url.searchParams.get("page_token") ?? "first"]!; return typeof route === "function" ? route(call) : json(route.body, route.status, route.headers); } });
    const tree = await (await open()).getTree(BASE);
    expect(tree).toEqual([{ path: "a", sha: "a-sha", mode: "100644" }, { path: "d", sha: "d-sha", mode: "040000" }, { path: "d/b.json", sha: "d/b.json-sha", mode: "100644" }]);
    const reads = fake.calls.filter((call) => call.url.pathname.endsWith("/tree"));
    expect(reads.map((call) => [call.url.searchParams.get("ref"), call.url.searchParams.get("recursive"), call.url.searchParams.get("pagination"), call.url.searchParams.get("page_token")])).toEqual([[BASE, "true", "keyset", null], [BASE, "true", "keyset", "t2"]]);
  });

  it("⚠️ getTree: 중간 페이지 실패·모양이 다른 페이지는 던진다 — 부분 트리로 blob 비교를 하지 않는다", async () => {
    for (const second of [{ status: 500 }, { status: 200, body: { message: "x" } }]) {
      let n = 0;
      const { open } = client({ [`GET ${P}/repository/tree`]: () => (n++ === 0 ? json([entry("a")], 200, { link: `<https://gitlab.com/api/v4${P}/repository/tree?page_token=x>; rel="next"` }) : json(second.body, second.status)) });
      await expect((await open()).getTree(BASE)).rejects.toThrow();
    }
  });

  it("⚠️ getTree: 페이지 상한을 넘으면 던진다 — 잘린 트리를 완전한 것으로 쓰지 않는다", async () => {
    let n = 0;
    const { open } = client({ [`GET ${P}/repository/tree`]: () => json([entry(`f${n}`)], 200, { link: `<https://gitlab.com/api/v4${P}/repository/tree?page_token=${++n}>; rel="next"` }) });
    await expect((await open()).getTree(BASE)).rejects.toThrow(/truncated/);
    expect(n).toBe(TREE_PAGE_LIMIT);
  });

  it("getBlobText: base64 → UTF-8 · ⚠️ LFS 포인터는 던진다(파싱·덮어쓰기 금지)", async () => {
    const { open } = client({
      [`GET ${P}/repository/blobs/s1`]: { status: 200, body: { encoding: "base64", content: Buffer.from('{"a":"안녕"}\n').toString("base64") } },
      [`GET ${P}/repository/blobs/lfs`]: { status: 200, body: { encoding: "base64", content: Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:x\nsize 1\n").toString("base64") } },
    });
    const git = await open();
    await expect(git.getBlobText("s1")).resolves.toBe('{"a":"안녕"}\n');
    await expect(git.getBlobText("lfs")).rejects.toThrow(/LFS/);
  });
});

describe("쓰기 — publishSnapshot · resetSyncBranch (첫 외부 쓰기는 호출 하나)", () => {
  it("POST /repository/commits 한 번 — branch · start_sha=고정 base · force · 마커 든 메시지 · update/create, `execute_filemode` 없음", async () => {
    const { fake, open } = client({ [`POST ${P}/repository/commits`]: { status: 201, body: { id: "c".repeat(40), parent_ids: [BASE] } } });
    const git = await open();
    const sha = await git.publishSnapshot({ branch: SYNC, baseSha: BASE, summary: "2 files", changes: [
      { kind: "upsert", path: "locales/ko.json", content: "{}\n", inBase: true }, { kind: "upsert", path: "locales/fr.json", content: "{}\n", inBase: false },
    ] });
    expect(sha).toBe("c".repeat(40));
    expect(keys(writes(fake.calls))).toEqual([`POST ${P}/repository/commits`]);
    // ⚠️ 브랜치 존재 확인(getRefSha)이 없다 — `force: true` 한 형태가 새 브랜치·기존 브랜치 둘 다 base 위 새 커밋으로 만든다(W0 실측).
    expect(keys(fake.calls)).toEqual([`GET ${P}`, `POST ${P}/repository/commits`]);
    const body = JSON.parse(writes(fake.calls)[0]!.body!) as Record<string, unknown>;
    expect(body).toEqual({
      branch: SYNC, start_sha: BASE, force: true, commit_message: commitMessage("2 files"),
      actions: [
        { action: "update", file_path: "locales/ko.json", content: "{}\n", encoding: "text" },
        { action: "create", file_path: "locales/fr.json", content: "{}\n", encoding: "text" },
      ],
    });
    expect(String(body.commit_message)).toContain(SKIP_MARKER);
    expect(JSON.stringify(body)).not.toContain("execute_filemode");
  });

  it("⚠️ 쓰기 실패(보호 브랜치 403·force 400·5xx)는 한 번만 보내고 던진다 — 재시도·우회 없음", async () => {
    for (const status of [403, 400, 502]) {
      const { fake, open } = client({ [`POST ${P}/repository/commits`]: { status, body: { message: "You are not allowed to push into this branch" } } });
      await expect((await open()).publishSnapshot({ branch: SYNC, baseSha: BASE, summary: "1 file", changes: [{ kind: "upsert", path: "a.json", content: "x", inBase: true }] })).rejects.toThrow();
      expect(writes(fake.calls), String(status)).toHaveLength(1);
    }
  });

  it("resetSyncBranch: sync 브랜치를 지운다 — 404는 이미 수렴(성공), 그 밖은 던진다", async () => {
    const gone = client({ [`DELETE ${SYNC_PATH}`]: { status: 404, body: { message: "404 Branch Not Found" } } });
    await expect((await gone.open()).resetSyncBranch(SYNC, BASE)).resolves.toBeUndefined();
    const deleted = client({ [`DELETE ${SYNC_PATH}`]: { status: 204 } });
    await (await deleted.open()).resetSyncBranch(SYNC, BASE);
    expect(keys(writes(deleted.fake.calls))).toEqual([`DELETE ${SYNC_PATH}`]);
    const protectedDefault = client({ [`DELETE ${SYNC_PATH}`]: { status: 400 } });
    await expect((await protectedDefault.open()).resetSyncBranch(SYNC, BASE)).rejects.toThrow();
  });
});

describe("MR 생명주기 — findOpenPr · createPr · updatePrTitle · updatePrBase · closePr · isPullRequestOpen", () => {
  const mr = (over: Record<string, unknown> = {}) => ({ iid: 3, web_url: "https://gitlab.com/g/sub/app/-/merge_requests/3", title: "t", target_branch: "main", source_branch: SYNC, source_project_id: Number(REPO), target_project_id: Number(REPO), state: "opened", ...over });

  it("findOpenPr: state=opened·source_branch로 묻고 자기 프로젝트 MR만 고른다(fork 제외) · 페이지 끝까지", async () => {
    const pages = [json([mr({ iid: 9, source_project_id: 5 })], 200, { "x-next-page": "2" }), json([mr()], 200, { "x-next-page": "" })];
    let n = 0;
    const { fake, open } = client({ [`GET ${P}/merge_requests`]: () => pages[n++]! });
    expect(await (await open()).findOpenPr(SYNC)).toEqual({ url: "https://gitlab.com/g/sub/app/-/merge_requests/3", number: 3, title: "t", base: "main" });
    const list = fake.calls.filter((call) => call.url.pathname.endsWith("/merge_requests"));
    expect(list.map((call) => [call.url.searchParams.get("state"), call.url.searchParams.get("source_branch"), call.url.searchParams.get("page")])).toEqual([["opened", SYNC, "1"], ["opened", SYNC, "2"]]);
  });

  it("findOpenPr: fork MR만 있으면 null(없음) · ⚠️ 404·모양 오류는 던진다(권한 은폐를 없음으로 읽지 않는다)", async () => {
    expect(await (await client({ [`GET ${P}/merge_requests`]: { status: 200, body: [mr({ source_project_id: 5 })] } }).open()).findOpenPr(SYNC)).toBeNull();
    await expect((await client({ [`GET ${P}/merge_requests`]: { status: 404 } }).open()).findOpenPr(SYNC)).rejects.toThrow();
    await expect((await client({ [`GET ${P}/merge_requests`]: { status: 200, body: { message: "x" } } }).open()).findOpenPr(SYNC)).rejects.toThrow();
  });

  it("createPr: POST 한 번, web_url을 돌려준다 · ⚠️ 409(이미 열린 MR)는 성공으로 읽지 않고 던진다", async () => {
    const created = client({ [`POST ${P}/merge_requests`]: { status: 201, body: mr({ iid: 4, web_url: "https://gitlab.com/g/sub/app/-/merge_requests/4" }) } });
    expect(await (await created.open()).createPr(SYNC, "main", "title", "body")).toBe("https://gitlab.com/g/sub/app/-/merge_requests/4");
    expect(JSON.parse(writes(created.fake.calls)[0]!.body!)).toEqual({ source_branch: SYNC, target_branch: "main", title: "title", description: "body" });
    const conflict = client({ [`POST ${P}/merge_requests`]: { status: 409, body: { message: ["Another open merge request already exists for this source branch: !1"] } } });
    await expect((await conflict.open()).createPr(SYNC, "main", "t", "b")).rejects.toThrow(/409/);
    expect(writes(conflict.fake.calls)).toHaveLength(1);
  });

  it("updatePrTitle·updatePrBase: PUT merge_requests/<iid> — 제목·target_branch", async () => {
    const { fake, open } = client({ [`PUT ${P}/merge_requests/3`]: { status: 200, body: mr() } });
    const git = await open();
    await git.updatePrTitle(3, "new");
    await git.updatePrBase(3, "release/2.0");
    expect(writes(fake.calls).map((call) => JSON.parse(call.body!))).toEqual([{ title: "new" }, { target_branch: "release/2.0" }]);
  });

  it("closePr: 이유 노트 → 닫기 순서 · 노트가 실패하면 닫지 않는다(이유 없는 종료를 남기지 않는다)", async () => {
    const { fake, open } = client({ [`POST ${P}/merge_requests/3/notes`]: { status: 201, body: { id: 1 } }, [`PUT ${P}/merge_requests/3`]: { status: 200, body: mr({ state: "closed" }) } });
    await (await open()).closePr(3, "why");
    expect(keys(writes(fake.calls))).toEqual([`POST ${P}/merge_requests/3/notes`, `PUT ${P}/merge_requests/3`]);
    expect(writes(fake.calls).map((call) => JSON.parse(call.body!))).toEqual([{ body: "why" }, { state_event: "close" }]);
    const failed = client({ [`POST ${P}/merge_requests/3/notes`]: { status: 500 } });
    await expect((await failed.open()).closePr(3, "why")).rejects.toThrow();
    expect(writes(failed.fake.calls)).toHaveLength(1);
  });

  it("isPullRequestOpen: GET merge_requests/<iid>의 state", async () => {
    const { open } = client({ [`GET ${P}/merge_requests/3`]: { status: 200, body: mr() }, [`GET ${P}/merge_requests/4`]: { status: 200, body: mr({ iid: 4, state: "merged" }) } });
    const git = await open();
    expect([await git.isPullRequestOpen(3), await git.isPullRequestOpen(4)]).toEqual([true, false]);
  });

  it("compareToBase: from=마지막 적재 커밋·to=base·straight=true · compare_timeout은 던진다", async () => {
    const { fake, open } = client({ [`GET ${P}/repository/compare`]: { status: 200, body: { commits: [], diffs: [{ old_path: "a", new_path: "a", renamed_file: false }], compare_timeout: false } } });
    expect(await (await open()).compareToBase(BASE, "release/2.0")).toEqual({ ahead: true, files: [{ filename: "a" }] });
    const call = fake.calls.at(-1)!;
    expect([call.url.searchParams.get("from"), call.url.searchParams.get("to"), call.url.searchParams.get("straight")]).toEqual([BASE, "release/2.0", "true"]);
    await expect((await client({ [`GET ${P}/repository/compare`]: { status: 200, body: { commits: [], diffs: [], compare_timeout: true } } }).open()).compareToBase(BASE, "main")).rejects.toThrow();
  });
});

describe("openGitLabReader — 온보딩·Sync의 스냅샷 (값으로 준다)", () => {
  const head = { [`GET ${P}/repository/branches/main`]: { status: 200, body: { commit: { id: BASE, committed_date: "2026-10-12T08:47:45.000+00:00" } } } };
  const tree = { [`GET ${P}/repository/tree`]: { status: 200, body: [
    { id: "d", name: "locales", type: "tree", path: "locales", mode: "040000" },
    { id: "e1", name: "en.json", type: "blob", path: "locales/en.json", mode: "100644" },
  ] } };
  const reader = (routes: Record<string, FakeRoute>) => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...routes });
    return { fake, open: () => openGitLabReader(TARGET, CREDENTIAL, { fetch: fake.fetch }) };
  };

  it("snapshot: head·커밋 시각(ISO UTC)·blob만 — files[].size는 비어 있다(크기는 `sizes`)", async () => {
    const { open } = reader({ ...head, ...tree });
    expect(await (await open()).snapshot("main")).toEqual({ status: "ok", headSha: BASE, headCommittedAt: "2026-10-12T08:47:45.000Z", files: [{ path: "locales/en.json", sha: "e1" }] });
  });

  it("snapshot: base 404는 base-branch-missing · 그 밖의 실패는 unavailable · 페이지 상한은 truncated", async () => {
    expect(await (await reader({ [`GET ${P}/repository/branches/main`]: { status: 404 } }).open()).snapshot("main")).toEqual({ status: "base-branch-missing" });
    expect(await (await reader({ ...head, [`GET ${P}/repository/tree`]: { status: 503 } }).open()).snapshot("main")).toEqual({ status: "unavailable" });
    let n = 0;
    const endless = reader({ ...head, [`GET ${P}/repository/tree`]: () => json([], 200, { link: `<https://gitlab.com/api/v4${P}/repository/tree?page_token=${++n}>; rel="next"` }) });
    expect(await (await endless.open()).snapshot("main")).toEqual({ status: "truncated" });
  });

  it("⚠️ sizes: GraphQL 100경로씩(150경로 → 2회), 숫자 id 주소 · 응답 크기를 숫자로", async () => {
    const files = Array.from({ length: 150 }, (_, i) => ({ path: `l/${i}.json`, sha: `s${i}` }));
    const snapshot = { status: "ok" as const, headSha: BASE, headCommittedAt: "2026-10-12T00:00:00.000Z", files };
    const { fake, open } = reader({ "POST /api/graphql": (call) => {
      const { variables } = JSON.parse(call.body!) as { variables: { ids: string[]; ref: string; paths: string[] } };
      return json({ data: { projects: { nodes: [{ id: variables.ids[0], repository: { blobs: { pageInfo: { hasNextPage: false }, nodes: variables.paths.map((path) => ({ path, size: "10", lfsOid: null, oid: files.find((f) => f.path === path)!.sha })) } } }] } } });
    } });
    const sized = await (await open()).sizes(snapshot, files.map((f) => f.path));
    expect(sized.status === "ok" && sized.sizes.size).toBe(150);
    const graphql = fake.calls.filter((call) => call.method === "POST");
    expect(graphql.map((call) => (JSON.parse(call.body!) as { variables: { paths: string[] } }).variables.paths.length)).toEqual([100, 50]);
    expect(graphql.every((call) => (JSON.parse(call.body!) as { variables: { ids: string[]; ref: string } }).variables.ids[0] === `gid://gitlab/Project/${REPO}`)).toBe(true);
    expect(graphql.every((call) => (JSON.parse(call.body!) as { variables: { ref: string } }).variables.ref === BASE)).toBe(true);
  });

  it("sizes: GraphQL 실패·errors는 unavailable이다(예산 초과가 아니다) · 경로 0이면 호출 0", async () => {
    const snapshot = { status: "ok" as const, headSha: BASE, headCommittedAt: "x", files: [{ path: "a", sha: "s" }] };
    for (const route of [{ status: 502 }, { status: 200, body: { errors: [{ message: "complexity" }] } }]) {
      expect(await (await reader({ "POST /api/graphql": route }).open()).sizes(snapshot, ["a"])).toEqual({ status: "unavailable" });
    }
    const none = reader({});
    expect(await (await none.open()).sizes(snapshot, [])).toEqual({ status: "ok", sizes: new Map() });
    expect(none.fake.calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("blob: 못 읽으면 undefined(로그) · LFS 포인터도 undefined", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { open } = reader({
      [`GET ${P}/repository/blobs/ok`]: { status: 200, body: { encoding: "base64", content: Buffer.from("{}").toString("base64") } },
      [`GET ${P}/repository/blobs/bad`]: { status: 500 },
      [`GET ${P}/repository/blobs/lfs`]: { status: 200, body: { encoding: "base64", content: Buffer.from("version https://git-lfs.github.com/spec/v1\n").toString("base64") } },
    });
    const r = await open();
    expect([await r.blob("ok"), await r.blob("bad"), await r.blob("lfs")]).toEqual(["{}", undefined, undefined]);
    vi.restoreAllMocks();
  });
});

describe("listGitLabBranches — ①·설정의 브랜치 목록", () => {
  it("100개씩 최대 3페이지 · 넘으면 truncated · 실패는 unavailable(①을 막지 않는다)", async () => {
    const names = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ name: `b${from + i}` }));
    let page = 0;
    const many = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/repository/branches`]: () => json(names(100, page++ * 100), 200, { "x-next-page": String(page + 1) }) });
    const listed = await listGitLabBranches(TARGET, CREDENTIAL, { fetch: many.fetch });
    expect(listed.status === "ok" && [listed.names.length, listed.truncated]).toEqual([300, true]);
    const few = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/repository/branches`]: { status: 200, body: [{ name: "main" }, { name: "release/2.0" }], headers: { "x-next-page": "" } } });
    expect(await listGitLabBranches(TARGET, CREDENTIAL, { fetch: few.fetch })).toEqual({ status: "ok", names: ["main", "release/2.0"], truncated: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listGitLabBranches(TARGET, CREDENTIAL, { fetch: createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/repository/branches`]: { status: 500 } }).fetch })).toEqual({ status: "unavailable" });
    vi.restoreAllMocks();
  });
});

describe("loadGitLabHealth — 연결 건강성(설정·Home·번역·MCP)", () => {
  it("⚠️ 만료일이 지났으면 원격 0으로 connection-unusable", async () => {
    const fake = createFakeGitLabFetch({});
    expect(await loadGitLabHealth(TARGET, { token: "t", expiresAt: new Date("2026-10-01T00:00:00Z"), gitlabUserId: "101" }, { fetch: fake.fetch, now: new Date("2026-10-12T00:00:00Z") })).toEqual({ status: "connection-unusable" });
    expect(fake.calls).toEqual([]);
  });

  it.each([
    [{ status: 200, body: META }, { status: "ok" }],
    [{ status: 200, body: { ...META, path_with_namespace: "g/renamed" } }, { status: "repo-moved", fullName: "g/renamed" }],
    [{ status: 200, body: { ...META, archived: true } }, { status: "connection-unusable" }],
    [{ status: 401 }, { status: "connection-unusable" }],
    [{ status: 404 }, { status: "connection-unusable" }],
    [{ status: 429 }, { status: "unknown" }],
    [{ status: 503 }, { status: "unknown" }],
  ])("%j → %j", async (route, health) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadGitLabHealth(TARGET, CREDENTIAL, { fetch: createFakeGitLabFetch({ [`GET ${P}`]: route as FakeRoute, ...OWNER(30) }).fetch })).toEqual(health);
    vi.restoreAllMocks();
  });

  it.each([
    ["Developer(30) — sync 브랜치 push·MR이 된다", OWNER(30), { status: "ok" }],
    ["⚠️ Reporter(20)로 강등 — 읽기만 된다: Disconnected(R-C Astra 🟡1)", OWNER(20), { status: "connection-unusable" }],
    ["멤버 아님(404)", { [`GET ${P}/members/all/101`]: { status: 404 } }, { status: "connection-unusable" }],
    ["권한 조회 401", { [`GET ${P}/members/all/101`]: { status: 401 } }, { status: "connection-unusable" }],
    ["⚠️ 권한 조회 일시 장애 — 끊김으로 접지 않는다", { [`GET ${P}/members/all/101`]: { status: 503 } }, { status: "unknown" }],
  ] as const)("토큰 주인의 유효 권한: %s", async (_label, member, health) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...member });
    expect(await loadGitLabHealth(TARGET, CREDENTIAL, { fetch: fake.fetch })).toEqual(health);
    // 묻는 사람은 토큰 주인 자신이다 — 호출자가 아니다(연결의 GitLab 사용자 id·PAT).
    expect(fake.calls.at(-1)?.url.pathname).toBe(`/api/v4${P}/members/all/101`);
    expect(fake.calls.every((call) => call.headers.get("PRIVATE-TOKEN") === "glpat-connector")).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("쓰기 클라이언트의 사전 검사 — 토큰 주인이 쓸 수 있나 (`requireWrite`)", () => {
  it("⚠️ Reporter 주인이면 쓰기 클라이언트를 주지 않는다 — 재연결 필요(not-installed), 쓰기 0", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...OWNER(20) });
    const error = await createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch, requireWrite: true }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "not-installed", retryable: false });
    expect(fake.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("Developer 주인은 연다 · 권한 조회 일시 장애는 원래 오류(github-error, 재시도)", async () => {
    const ok = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...OWNER(30) });
    await expect(createGitLabClient(TARGET, CREDENTIAL, { fetch: ok.fetch, requireWrite: true })).resolves.toBeDefined();
    const flaky = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, [`GET ${P}/members/all/101`]: { status: 503 } });
    const error = await createGitLabClient(TARGET, CREDENTIAL, { fetch: flaky.fetch, requireWrite: true }).catch((caught: unknown) => caught);
    expect(classifySyncError(error)).toMatchObject({ code: "github-error", retryable: true });
  });

  it("읽기 용도(게이트·원격 신호·리더)는 묻지 않는다 — Reporter 주인이어도 열린 MR 조회·Sync는 돈다", async () => {
    const fake = createFakeGitLabFetch({ [`GET ${P}`]: { status: 200, body: META }, ...OWNER(20) });
    await createGitLabClient(TARGET, CREDENTIAL, { fetch: fake.fetch });
    await openGitLabReader(TARGET, CREDENTIAL, { fetch: fake.fetch });
    expect(fake.calls.filter((call) => call.url.pathname.includes("/members/all/"))).toEqual([]);
  });
});
