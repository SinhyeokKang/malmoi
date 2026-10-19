import { describe, expect, it } from "vitest";

import { SKIP_MARKER } from "@/lib/pull/payload";

import { openMergeRequestCheck, openMergeRequestLine, openMergeRequestsUrl, planGitlabCiPush } from "../gitlab-ci-input";

/**
 * **GitLab CI 입력 변환** (gitlab-repositories D1 — design §3 "CI 입력 변환"). 생성 `.gitlab-ci.yml`이 job `variables`로 넘긴 설정과
 * GitLab 예약 변수(`CI_*`)를 `push:local`의 인자로 옮긴다. action v3가 `with:`를 플래그로 옮기는 셸과 같은 일을 TS로 한다 —
 * 셸·YAML에서 조립하면 계약이 넓어져도 컴파일러가 못 본다(POSTMORTEM 2026-08-31).
 */

const base = {
  CI_PIPELINE_SOURCE: "push",
  CI_COMMIT_BRANCH: "main",
  CI_COMMIT_MESSAGE: "feat: add checkout strings\n",
  CI_PROJECT_DIR: "/builds/group/sub/app",
  MALMOI_I18N_BASE_BRANCH: "main",
  MALMOI_I18N_PROJECT: "order-check",
} as const;

describe("planGitlabCiPush — 스킵", () => {
  it("push 파이프라인이 아니면 건너뛴다 — MR·schedule·web 파이프라인은 base에 닿은 커밋이 아니다", () => {
    for (const source of ["merge_request_event", "schedule", "web", "trigger", undefined]) {
      expect(planGitlabCiPush({ ...base, CI_PIPELINE_SOURCE: source })).toEqual({ kind: "skip", reason: "not-push" });
    }
  });

  it("base가 아닌 브랜치는 건너뛴다 — 태그 파이프라인(`CI_COMMIT_BRANCH` 없음)도", () => {
    expect(planGitlabCiPush({ ...base, CI_COMMIT_BRANCH: "feature/x" })).toEqual({ kind: "skip", reason: "other-branch" });
    expect(planGitlabCiPush({ ...base, CI_COMMIT_BRANCH: undefined })).toEqual({ kind: "skip", reason: "other-branch" });
  });

  it("base 비교는 정확히 같은 문자열이다 — 접두·대소문자가 같아도 다른 브랜치다", () => {
    expect(planGitlabCiPush({ ...base, CI_COMMIT_BRANCH: "main-old" })).toEqual({ kind: "skip", reason: "other-branch" });
    expect(planGitlabCiPush({ ...base, CI_COMMIT_BRANCH: "Main" })).toEqual({ kind: "skip", reason: "other-branch" });
  });

  it("커밋 메시지에 마커가 있으면 건너뛴다 — 본문 어디에 있어도(merge commit은 둘째 문단이 MR 제목이다)", () => {
    const merge = `Merge branch 'malmoi-i18n/sync-order-check' into 'main'\n\nmalmoi-i18n: sync translations ${SKIP_MARKER}\n\nSee merge request group/app!7`;
    expect(planGitlabCiPush({ ...base, CI_COMMIT_MESSAGE: merge })).toEqual({ kind: "skip", reason: "marker" });
  });
});

describe("planGitlabCiPush — 실행 인자", () => {
  // `--repo-host gitlab` — CLI의 보류 경고가 merge request를 말한다(#259). 서버 계약은 그대로다.
  it("최소 설정 — action v3 기본값과 같다(api-url 프로덕션 · surface default · 대상은 체크아웃 루트)", () => {
    expect(planGitlabCiPush(base)).toEqual({
      kind: "run",
      projectSlug: "order-check",
      target: "/builds/group/sub/app",
      args: ["--url", "https://mal-moi.com", "--project", "order-check", "--surface", "default", "--repo-host", "gitlab"],
    });
  });

  it("설정된 입력이 action v3와 같은 순서의 플래그가 된다", () => {
    const plan = planGitlabCiPush({
      ...base,
      MALMOI_I18N_API_URL: "https://malmoi.example.com",
      MALMOI_I18N_SURFACE: "web",
      MALMOI_I18N_PATH_TEMPLATE: "web/{locale}.json",
      MALMOI_I18N_ADAPTER: "json-catalog",
      MALMOI_I18N_BASE: "en",
      MALMOI_I18N_WRAPPER: "next-intl#useTranslations()\n  next-intl/server#getTranslations()\n\n",
      MALMOI_I18N_TARGET: "/builds/group/sub/app/packages/web",
    });
    expect(plan).toEqual({
      kind: "run",
      projectSlug: "order-check",
      target: "/builds/group/sub/app/packages/web",
      args: [
        "--url", "https://malmoi.example.com",
        "--project", "order-check",
        "--surface", "web",
        "--repo-host", "gitlab",
        "--path-template", "web/{locale}.json",
        "--adapter", "json-catalog",
        "--base", "en",
        "--wrapper", "next-intl#useTranslations()",
        "--wrapper", "next-intl/server#getTranslations()",
      ],
    });
  });

  it("빈 문자열 변수는 없는 것과 같다 — GitLab은 정의된 빈 변수를 그대로 넘긴다", () => {
    const plan = planGitlabCiPush({ ...base, MALMOI_I18N_API_URL: "", MALMOI_I18N_SURFACE: "", MALMOI_I18N_ADAPTER: "", MALMOI_I18N_BASE: "", MALMOI_I18N_TARGET: "" });
    expect(plan).toMatchObject({ kind: "run", target: "/builds/group/sub/app", args: ["--url", "https://mal-moi.com", "--project", "order-check", "--surface", "default", "--repo-host", "gitlab"] });
  });
});

describe("planGitlabCiPush — 확정 어댑터를 그대로 넘긴다", () => {
  // 생성 job이 박은 이름을 러너가 거르지 않는다 — 검증은 CLI(`isAdapterName`)가 한다. 여기서 버리면 CI가 탐지 1순위를 보내 409다(POSTMORTEM 2026-09-14).
  it("arb-catalog", () => {
    const plan = planGitlabCiPush({ ...base, MALMOI_I18N_ADAPTER: "arb-catalog", MALMOI_I18N_PATH_TEMPLATE: "lib/l10n/app_{locale}.arb" });
    expect(plan).toMatchObject({ kind: "run", args: expect.arrayContaining(["--adapter", "arb-catalog", "--path-template", "lib/l10n/app_{locale}.arb"]) });
  });
});

describe("planGitlabCiPush — 설정 오류는 red", () => {
  it("프로젝트·base 브랜치가 없으면 invalid다 — 스킵으로 접으면 CI가 영영 조용히 green이다", () => {
    expect(planGitlabCiPush({ ...base, MALMOI_I18N_PROJECT: "" })).toMatchObject({ kind: "invalid" });
    expect(planGitlabCiPush({ ...base, MALMOI_I18N_BASE_BRANCH: undefined })).toMatchObject({ kind: "invalid" });
  });

  it("대상 디렉터리를 정할 수 없으면 invalid다", () => {
    expect(planGitlabCiPush({ ...base, CI_PROJECT_DIR: undefined })).toMatchObject({ kind: "invalid" });
  });
});

describe("openMergeRequestCheck — 열린 Malmoi MR 사전 경고(안내 전용)", () => {
  const mr = (over: Record<string, unknown> = {}) => ({
    web_url: "https://gitlab.com/group/sub/app/-/merge_requests/7",
    source_project_id: 42,
    target_project_id: 42,
    ...over,
  });

  it("같은 프로젝트에서 연 MR이 있으면 open이다", () => {
    expect(openMergeRequestCheck(200, JSON.stringify([mr()]), "42")).toEqual({ kind: "open", url: "https://gitlab.com/group/sub/app/-/merge_requests/7" });
  });

  it("동명 fork MR은 Malmoi MR이 아니다 — source와 target 프로젝트가 다르면 제외한다", () => {
    expect(openMergeRequestCheck(200, JSON.stringify([mr({ source_project_id: 99 })]), "42")).toEqual({ kind: "none" });
    expect(openMergeRequestCheck(200, JSON.stringify([mr({ source_project_id: 99 }), mr()]), "42")).toMatchObject({ kind: "open" });
  });

  it("빈 목록은 none이다", () => {
    expect(openMergeRequestCheck(200, "[]", "42")).toEqual({ kind: "none" });
  });

  it("조회 실패를 '없음'으로 읽지 않는다 — 4xx·5xx·JSON 아님·배열 아님", () => {
    expect(openMergeRequestCheck(401, "{}", "42")).toEqual({ kind: "failed" });
    expect(openMergeRequestCheck(403, "[]", "42")).toEqual({ kind: "failed" });
    expect(openMergeRequestCheck(500, "[]", "42")).toEqual({ kind: "failed" });
    expect(openMergeRequestCheck(200, "<html>", "42")).toEqual({ kind: "failed" });
    expect(openMergeRequestCheck(200, "{}", "42")).toEqual({ kind: "failed" });
  });

  it("URL이 http(s)가 아니면 싣지 않는다 — 로그 줄에 서버 문자열을 그대로 넣지 않는다", () => {
    expect(openMergeRequestCheck(200, JSON.stringify([mr({ web_url: "javascript:alert(1)\nfoo" })]), "42")).toEqual({ kind: "open", url: null });
  });
});

describe("openMergeRequestsUrl — 조회 주소", () => {
  const env = { CI_API_V4_URL: "https://gitlab.com/api/v4", CI_PROJECT_ID: "42" };

  it("자기 프로젝트의 열린 MR을 sync 브랜치로 거른다 — 브랜치 이름의 `/`는 인코딩한다", () => {
    expect(openMergeRequestsUrl(env, "order-check")).toEqual({
      url: "https://gitlab.com/api/v4/projects/42/merge_requests?state=opened&source_branch=malmoi-i18n%2Fsync-order-check",
      syncBranch: "malmoi-i18n/sync-order-check",
    });
  });

  it("주소를 만들 수 없으면 null이다 — 예약 변수가 없거나 slug가 브랜치 이름이 될 수 없다", () => {
    expect(openMergeRequestsUrl({ CI_PROJECT_ID: "42" }, "order-check")).toBeNull();
    expect(openMergeRequestsUrl({ CI_API_V4_URL: "https://gitlab.com/api/v4" }, "order-check")).toBeNull();
    expect(openMergeRequestsUrl(env, "bad slug")).toBeNull();
  });
});

describe("openMergeRequestLine", () => {
  it("open — 서버가 적재를 보류한다고 말한다(덮는다고 말하지 않는다)", () => {
    const line = openMergeRequestLine({ kind: "open", url: "https://gitlab.com/g/a/-/merge_requests/7" }, "malmoi-i18n/sync-order-check");
    expect(line).toContain("https://gitlab.com/g/a/-/merge_requests/7");
    expect(line).toMatch(/won't import/);
    expect(line).not.toMatch(/overwrite/);
  });

  it("failed는 조회 실패라고 말한다 — '없음'과 다른 문장", () => {
    expect(openMergeRequestLine({ kind: "failed" }, "malmoi-i18n/sync-x")).toMatch(/couldn't check/i);
    expect(openMergeRequestLine({ kind: "none" }, "malmoi-i18n/sync-x")).toContain("malmoi-i18n/sync-x");
  });
});
