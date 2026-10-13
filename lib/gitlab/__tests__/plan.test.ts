import { describe, expect, it } from "vitest";

import { blobSha } from "@/lib/githash";

import {
  buildCommitActions,
  decodeBlob,
  isLfsPointer,
  nextKeysetQuery,
  parseBranchHead,
  parseTreePage,
  planBlobSizes,
  planCompare,
  planGitLabHealth,
  selectOwnMergeRequest,
} from "../plan";

/**
 * GitLab 원격 응답의 순수 판정 (gitlab-repositories design §3 표 — commit 요청 조립 · 원격 파일 판정 · PR/MR 조회 정규화 · URL·오류 판정).
 * 여기서 잰 판정 위에 `../client`가 호출만 얹는다.
 */

const REPO = "87515176";

describe("buildCommitActions — 고정 base 위 스냅샷 하나의 actions", () => {
  it("base에 있으면 update, 없으면 create — `execute_filemode`를 넣지 않는다(수정 파일 100644 — W0 실측)", () => {
    expect(buildCommitActions([
      { path: "locales/ko.json", content: "{}\n", inBase: true },
      { path: "locales/fr.json", content: "{}\n", inBase: false },
    ])).toEqual([
      { action: "update", file_path: "locales/ko.json", content: "{}\n", encoding: "text" },
      { action: "create", file_path: "locales/fr.json", content: "{}\n", encoding: "text" },
    ]);
  });

  it("경로는 본문(JSON) 값이라 인코딩하지 않는다 — 공백·유니코드·`%`가 왕복 동일하다", () => {
    const paths = ["locales/zh Hant.json", "locales/한국어.json", "locales/100%.json", "group/sub group/ko.json"];
    const actions = buildCommitActions(paths.map((path) => ({ path, content: "x", inBase: true })));
    expect(actions.map((action) => action.file_path)).toEqual(paths);
    expect(JSON.parse(JSON.stringify(actions)).map((action: { file_path: string }) => action.file_path)).toEqual(paths);
  });

  it.each(["", "/abs.json", "a//b.json", "a/../b.json", "./a.json", "a\\b.json", "a/\0.json", "a/"])("비정상 경로 %j는 조립 전에 던진다 — 리포 밖이나 다른 파일을 쓰지 않는다", (path) => {
    expect(() => buildCommitActions([{ path, content: "x", inBase: false }])).toThrow();
  });

  it("같은 경로가 둘이면 던진다 — 한 커밋에서 같은 파일을 두 번 쓰면 GitLab이 400을 주거나 나중 것이 이긴다", () => {
    expect(() => buildCommitActions([{ path: "a.json", content: "1", inBase: true }, { path: "a.json", content: "2", inBase: true }])).toThrow();
  });

  it("빈 변경은 던진다 — `actions: []`는 400이고 `allow_empty`는 수렴하지 않는 빈 커밋이다(W0 실측). 호출부는 2층에서 이미 멈춘다", () => {
    expect(() => buildCommitActions([])).toThrow();
  });
});

describe("parseTreePage · nextKeysetQuery — 트리는 keyset으로 끝까지", () => {
  it("항목 넷을 그대로 옮긴다 — blob·tree·gitlink 모두 mode를 보존한다(비정규 경로를 빼면 신규 파일로 덮는다)", () => {
    expect(parseTreePage([
      { id: "a".repeat(40), name: "locales", type: "tree", path: "locales", mode: "040000" },
      { id: "b".repeat(40), name: "en.json", type: "blob", path: "locales/en.json", mode: "100644" },
      { id: "c".repeat(40), name: "link", type: "blob", path: "link", mode: "120000" },
      { id: "d".repeat(40), name: "vendor", type: "commit", path: "vendor", mode: "160000" },
    ])).toEqual([
      { path: "locales", sha: "a".repeat(40), mode: "040000", type: "tree" },
      { path: "locales/en.json", sha: "b".repeat(40), mode: "100644", type: "blob" },
      { path: "link", sha: "c".repeat(40), mode: "120000", type: "blob" },
      { path: "vendor", sha: "d".repeat(40), mode: "160000", type: "commit" },
    ]);
  });

  it("모양이 다른 페이지는 null이다 — 빈 목록으로 접으면 base의 파일을 '없다'로 읽는다", () => {
    expect(parseTreePage({ message: "404" })).toBeNull();
    expect(parseTreePage([{ id: "x", path: "a" }])).toBeNull();
  });

  const TREE = `/projects/${REPO}/repository/tree`;
  it("Link rel=next의 질의를 돌려주고, next가 없으면 null(끝)이다", () => {
    const link = `<https://gitlab.com/api/v4/projects/${REPO}/repository/tree?id=${REPO}&page_token=tok&pagination=keyset&per_page=100&recursive=true&ref=abc>; rel="next"`;
    expect(nextKeysetQuery(link, TREE)).toEqual({ id: REPO, page_token: "tok", pagination: "keyset", per_page: "100", recursive: "true", ref: "abc" });
    expect(nextKeysetQuery(`<https://gitlab.com/api/v4${TREE}?page=1>; rel="first"`, TREE)).toBeNull();
    expect(nextKeysetQuery(null, TREE)).toBeNull();
  });

  it("⚠️ 다른 호스트·다른 경로의 next는 따라가지 않고 던진다 — 링크가 토큰을 실어 남의 주소로 가지 않는다", () => {
    expect(() => nextKeysetQuery(`<https://evil.example/api/v4${TREE}?page_token=t>; rel="next"`, TREE)).toThrow();
    expect(() => nextKeysetQuery(`<https://gitlab.com/api/v4/projects/1/repository/tree?page_token=t>; rel="next"`, TREE)).toThrow();
  });
});

describe("parseBranchHead · decodeBlob · isLfsPointer — 원격 파일 판정", () => {
  it("브랜치 head의 SHA와 커밋 시각(ISO UTC로 정규화) — 첫 적재가 이 시각을 `stale-commit` 판정에 쓴다", () => {
    expect(parseBranchHead({ name: "main", commit: { id: "c".repeat(40), committed_date: "2026-10-12T08:47:45.000+00:00" } }))
      .toEqual({ sha: "c".repeat(40), committedAt: "2026-10-12T08:47:45.000Z" });
    expect(parseBranchHead({ name: "main", commit: { id: "c".repeat(40), committed_date: "2026-10-12T17:47:45.000+09:00" } })?.committedAt).toBe("2026-10-12T08:47:45.000Z");
    expect(parseBranchHead({ name: "main" })).toBeNull();
  });

  it("blob은 base64 → UTF-8이다 — 한글이 깨지지 않는다", () => {
    expect(decodeBlob({ size: 9, encoding: "base64", content: Buffer.from("안녕\n").toString("base64"), sha: "s" })).toBe("안녕\n");
    expect(decodeBlob({ encoding: "text", content: "x" })).toBeNull();
  });

  it("LFS 포인터를 알아본다 — 포인터를 파싱하거나 Publish가 덮어쓰면 안 된다", () => {
    expect(isLfsPointer("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n")).toBe(true);
    expect(isLfsPointer('{\n  "version": "https://git-lfs.github.com/spec/v1"\n}\n')).toBe(false);
  });
});

describe("planBlobSizes — GraphQL `blobs`(100경로씩)의 크기", () => {
  const snapshot = { status: "ok" as const, headSha: "h", headCommittedAt: "2026-10-12T00:00:00Z", files: [
    { path: "en.json", sha: blobSha("{}") }, { path: "ko.json", sha: blobSha("{\"a\":1}") },
  ] };
  const data = (nodes: unknown[], id = `gid://gitlab/Project/${REPO}`, hasNextPage = false) => ({ projects: { nodes: [{ id, repository: { blobs: { pageInfo: { hasNextPage }, nodes } } }] } });

  it("⚠️ `size`는 문자열로 온다 — 숫자로 바꾼다", () => {
    expect(planBlobSizes(data([{ path: "en.json", size: "89", lfsOid: null, oid: blobSha("{}") }]), REPO, snapshot, ["en.json"]))
      .toEqual({ status: "ok", sizes: new Map([["en.json", 89]]) });
  });

  it.each(["9007199254740993", "-1", "1.5", "abc", ""])("안전 정수가 아닌 size(%j)는 unavailable이다 — 예산이 보는 값을 거짓으로 만들지 않는다", (size) => {
    expect(planBlobSizes(data([{ path: "en.json", size, lfsOid: null, oid: blobSha("{}") }]), REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
  });

  it("⚠️ 응답 project.id가 저장된 gid와 다르면 unavailable이다(불변 id 검증)", () => {
    expect(planBlobSizes(data([], "gid://gitlab/Project/1"), REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
    expect(planBlobSizes({ projects: { nodes: [] } }, REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
  });

  it("oid가 스냅샷의 blob id와 다르면 unavailable이다 — 다른 ref의 크기를 예산에 쓰지 않는다", () => {
    expect(planBlobSizes(data([{ path: "en.json", size: "2", lfsOid: null, oid: "f".repeat(40) }]), REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
  });

  it("다음 페이지가 있으면 unavailable이다 — 잘린 목록을 완전한 것으로 읽지 않는다", () => {
    expect(planBlobSizes(data([], undefined, true), REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
  });

  it("lfsOid가 있으면 그 경로를 lfs로 거부한다", () => {
    expect(planBlobSizes(data([{ path: "ko.json", size: "130", lfsOid: "abc", oid: blobSha("{\"a\":1}") }]), REPO, snapshot, ["ko.json"])).toEqual({ status: "lfs", path: "ko.json" });
  });

  it("없는 경로는 지도에서 빠진다 — 0으로 세지 않는다(예산이 '크기를 모른다'로 거부한다)", () => {
    expect(planBlobSizes(data([]), REPO, snapshot, ["en.json"])).toEqual({ status: "ok", sizes: new Map() });
  });

  it("묻지 않은 경로가 오면 unavailable이다", () => {
    expect(planBlobSizes(data([{ path: "ko.json", size: "2", lfsOid: null, oid: blobSha("{\"a\":1}") }]), REPO, snapshot, ["en.json"])).toEqual({ status: "unavailable" });
  });
});

describe("selectOwnMergeRequest — 자기 프로젝트의 열린 MR만", () => {
  const mr = (over: Record<string, unknown> = {}) => ({
    iid: 7, web_url: "https://gitlab.com/g/sub/app/-/merge_requests/7", title: "t", target_branch: "main", source_branch: "malmoi-i18n/sync-app",
    source_project_id: Number(REPO), target_project_id: Number(REPO), state: "opened", ...over,
  });

  it("source·target project id가 둘 다 저장된 id인 MR을 고른다 — number는 iid다", () => {
    expect(selectOwnMergeRequest([mr()], REPO, "malmoi-i18n/sync-app")).toEqual({ url: "https://gitlab.com/g/sub/app/-/merge_requests/7", number: 7, title: "t", base: "main" });
  });

  it("⚠️ 동명 fork MR(source_project_id가 다르다)은 재사용·닫기·보호 대상이 아니다", () => {
    expect(selectOwnMergeRequest([mr({ iid: 9, source_project_id: 1 })], REPO, "malmoi-i18n/sync-app")).toBeNull();
    expect(selectOwnMergeRequest([mr({ iid: 9, source_project_id: 1 }), mr()], REPO, "malmoi-i18n/sync-app")?.number).toBe(7);
  });

  it("다른 source 브랜치·열리지 않은 MR은 고르지 않는다(필터가 조용히 무시돼도)", () => {
    expect(selectOwnMergeRequest([mr({ source_branch: "feature" }), mr({ state: "closed" })], REPO, "malmoi-i18n/sync-app")).toBeNull();
  });

  it("⚠️ 모양이 다른 응답은 던진다 — '없음'으로 접으면 열린 MR 게이트가 열린다", () => {
    expect(() => selectOwnMergeRequest({ message: "403" }, REPO, "b")).toThrow();
    expect(() => selectOwnMergeRequest([{ iid: "x" }], REPO, "b")).toThrow();
  });
});

describe("planCompare — base 드리프트(straight=true)", () => {
  it("ahead = commits 또는 diffs가 있다 · rename은 이전 이름을 싣는다", () => {
    expect(planCompare({ commits: [{ id: "c" }], diffs: [{ old_path: "a.json", new_path: "b.json", renamed_file: true }, { old_path: "c.json", new_path: "c.json", renamed_file: false }], compare_timeout: false }))
      .toEqual({ ahead: true, files: [{ filename: "b.json", previous_filename: "a.json" }, { filename: "c.json" }] });
    expect(planCompare({ commits: [], diffs: [{ old_path: "c.json", new_path: "c.json", renamed_file: false }], compare_timeout: false }).ahead).toBe(true);
    expect(planCompare({ commits: [], diffs: [], compare_timeout: false })).toEqual({ ahead: false, files: [] });
  });

  it("⚠️ compare_timeout: true는 '변경 없음'이 아니라 조회 실패다 — 던진다", () => {
    expect(() => planCompare({ commits: [], diffs: [], compare_timeout: true })).toThrow();
    expect(() => planCompare({ message: "x" })).toThrow();
  });
});

describe("planGitLabHealth — 연결 건강성 (design §2 톤 표)", () => {
  const stored = { owner: "g/sub", name: "app" };
  const ok = { status: "ok" as const, repositoryId: REPO, owner: "g/sub", name: "app", defaultBranch: "main", archived: false };

  it("정상 → ok · 대소문자만 다른 이름도 ok", () => {
    expect(planGitLabHealth(stored, ok)).toEqual({ status: "ok" });
    expect(planGitLabHealth(stored, { ...ok, owner: "G/Sub" })).toEqual({ status: "ok" });
  });

  it("경로가 바뀌었으면(같은 id) repo-moved — 쓰기는 id로 가므로 끊김이 아니다", () => {
    expect(planGitLabHealth(stored, { ...ok, owner: "g/other" })).toEqual({ status: "repo-moved", fullName: "g/other/app" });
  });

  it("⚠️ 재인가·접근 상실·보관·sha1 아님은 connection-unusable(Disconnected) — 일시 장애로 접지 않는다", () => {
    for (const status of ["reconnect", "forbidden", "unsupported"] as const) expect(planGitLabHealth(stored, { status }), status).toEqual({ status: "connection-unusable" });
    expect(planGitLabHealth(stored, { ...ok, archived: true })).toEqual({ status: "connection-unusable" });
  });

  it("⚠️ 일시 장애(5xx·429·네트워크)는 unknown이다 — 끊김으로 접지 않는다", () => {
    expect(planGitLabHealth(stored, { status: "unavailable" })).toEqual({ status: "unknown" });
  });
});
