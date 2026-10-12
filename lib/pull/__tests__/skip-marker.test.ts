import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PR_TITLE, SKIP_MARKER, buildCommitPayload, withSkipMarker } from "../payload";

/**
 * **루프 마커가 머지 방식과 무관하게 `head_commit.message`에 남는가.** 가드 셋(action·워크플로 YAML·ACTIONS.md)은
 * 전부 `head_commit.message`의 **부분 문자열**만 본다(GitLab 가드 둘은 `CI_COMMIT_MESSAGE` — 아래 GitLab 절). 마커가 커밋 메시지에만 있던 동안 "Create a merge commit"으로
 * 머지하면 그 메시지가 `Merge pull request #N from …\n\n<PR 제목>`이라 마커가 없고, push가 DB를 Publish 시점 값으로
 * 덮어 그 뒤 편집이 사라졌다 (launch-readiness L1.2, 2026-09-17). 그래서 마커는 **PR 제목에도** 든다.
 *
 * 판정 코드는 bash(`*"[skip-malmoi-i18n]"*`)와 GH expression(`contains()`)이라 TS 순수 함수가 없다 — 여기서는
 * **생산자(우리가 만드는 커밋 메시지·PR 제목)를 GitHub이 만드는 머지 커밋 메시지 모양 다섯에 넣어** 같은 부분
 * 문자열 판정으로 대조하고, 소비자 셋이 같은 리터럴을 들고 있는지 텍스트로 센다(`sync-branch-consumers.test.ts` 형).
 */

const root = new URL("../../../", import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");

/**
 * GitHub이 각 머지 방식에서 base에 얹는 커밋의 메시지. 우리가 정하는 것은 `title`·`commitMessage`뿐이다.
 * 항등에 가까운 항목도 함수로 둔 것은 **다섯 모양이 한 표에 나란히 서게** 하려는 것이다 — 어느 입력이
 * 어느 방식에서 그대로 실리는지가 이 표의 내용이다.
 */
const mergedMessage = {
  mergeCommit: (title: string) => `Merge pull request #7 from o/malmoi-i18n/sync-web\n\n${title}`,
  /** 리포 설정 "Default message" — 커밋이 하나뿐인 스냅샷 브랜치라 그 커밋 메시지가 그대로 실린다. */
  squashDefault: (commitMessage: string) => commitMessage,
  /** 리포 설정 "Default to pull request title". */
  squashPrTitle: (title: string) => `${title} (#7)`,
  rebase: (commitMessage: string) => commitMessage,
};

describe("루프 마커 — 머지 방식 다섯", () => {
  const commitMessage = buildCommitPayload("tree", "base", "2 files").message;

  it("merge commit — PR 제목이 둘째 문단이라 제목의 마커가 잡힌다", () => {
    expect(mergedMessage.mergeCommit(PR_TITLE)).toContain(SKIP_MARKER);
  });

  it("squash(기본 메시지) — 스냅샷 커밋 메시지의 마커가 잡힌다", () => {
    expect(mergedMessage.squashDefault(commitMessage)).toContain(SKIP_MARKER);
  });

  it("squash(PR 제목) — 제목의 마커가 잡힌다", () => {
    expect(mergedMessage.squashPrTitle(PR_TITLE)).toContain(SKIP_MARKER);
  });

  it("rebase — 커밋 메시지의 마커가 잡힌다", () => {
    expect(mergedMessage.rebase(commitMessage)).toContain(SKIP_MARKER);
  });

  it("사람 커밋에는 마커가 없다 — 가드가 run으로 판정한다 (짝)", () => {
    expect(mergedMessage.mergeCommit("feat: add checkout strings")).not.toContain(SKIP_MARKER);
    expect("feat: add checkout strings").not.toContain(SKIP_MARKER);
  });
});

/**
 * **GitLab이 MR 머지에서 base에 얹는 커밋 메시지** (gitlab-repositories D1). GitLab 가드(생성 job의 `rules` · `push.sh`)는
 * `CI_COMMIT_MESSAGE`(커밋 메시지 전문)의 부분 문자열을 본다. 우리가 정하는 것은 MR 제목(`PR_TITLE` — 같은 생산자)과 스냅샷
 * 커밋 메시지뿐이고, ⚠️ **merge·squash 메시지 템플릿은 프로젝트마다 바꿀 수 있다**(POSTMORTEM 2026-09-17) — 마커를 실을 자리가
 * 없는 사용자 템플릿에서는 가드가 못 잡고, 그때 남는 방어선은 서버의 미전달·열린 MR·`publish-raced` 보류다.
 */
const gitlabMergedMessage = {
  /** 기본 merge commit 템플릿 `Merge branch '%{source_branch}' into '%{target_branch}'\n\n%{title}\n\n%{issues}\n\nSee merge request %{reference}`. */
  mergeCommit: (title: string) => `Merge branch 'malmoi-i18n/sync-web' into 'main'\n\n${title}\n\nSee merge request group/sub/app!7`,
  /** 기본 squash 템플릿 `%{title}`. */
  squashDefault: (title: string) => title,
  /** 사용자 squash 템플릿 — 첫 커밋 메시지를 싣는 꼴(`%{first_commit}`)과 둘 다 싣지 않는 꼴. */
  squashFirstCommit: (commitMessage: string) => `${commitMessage}\n\nSee merge request group/sub/app!7`,
  squashReferenceOnly: () => "chore: translations (group/sub/app!7)",
  /** fast-forward — 스냅샷 커밋이 그대로 base에 올라간다. */
  fastForward: (commitMessage: string) => commitMessage,
};

describe("루프 마커 — GitLab 머지 방식", () => {
  const commitMessage = buildCommitPayload("tree", "base", "2 files").message;

  it("merge commit(기본 템플릿) — MR 제목이 둘째 문단이라 제목의 마커가 잡힌다", () => {
    expect(gitlabMergedMessage.mergeCommit(PR_TITLE)).toContain(SKIP_MARKER);
  });

  it("squash(기본 템플릿 `%{title}`) — MR 제목의 마커가 잡힌다", () => {
    expect(gitlabMergedMessage.squashDefault(PR_TITLE)).toContain(SKIP_MARKER);
  });

  it("squash(사용자 템플릿 `%{first_commit}`) — 스냅샷 커밋 메시지의 마커가 잡힌다", () => {
    expect(gitlabMergedMessage.squashFirstCommit(commitMessage)).toContain(SKIP_MARKER);
  });

  it("squash(제목·커밋을 싣지 않는 사용자 템플릿) — 마커가 없다: 가드의 알려진 구멍이고 docs/ACTIONS.md가 적는다", () => {
    expect(gitlabMergedMessage.squashReferenceOnly()).not.toContain(SKIP_MARKER);
    expect(read("docs/ACTIONS.md")).toMatch(/%\{title\}/);
  });

  it("fast-forward — 커밋 메시지의 마커가 잡힌다", () => {
    expect(gitlabMergedMessage.fastForward(commitMessage)).toContain(SKIP_MARKER);
  });
});

describe("withSkipMarker — 재사용 PR 제목에 마커를 되돌린다", () => {
  it("마커가 있으면 그대로다 — 사람이 고친 제목도 마커만 남았으면 유지 (PATCH 0회의 근거)", () => {
    const title = `Translations for 2.0 ${SKIP_MARKER}`;
    expect(withSkipMarker(title)).toBe(title);
    expect(withSkipMarker(PR_TITLE)).toBe(PR_TITLE);
  });

  it("마커가 없으면 원래 제목 뒤에 덧붙인다 — 제목을 우리 것으로 덮지 않는다", () => {
    expect(withSkipMarker("Translations for 2.0")).toBe(`Translations for 2.0 ${SKIP_MARKER}`);
  });

  it("덧붙이면 GitHub 제목 상한(256자)을 넘는 경우에만 기본 제목으로 폴백한다 — 422로 pull이 죽지 않게", () => {
    const longest = "x".repeat(256 - SKIP_MARKER.length - 1);
    expect(withSkipMarker(longest)).toBe(`${longest} ${SKIP_MARKER}`);
    expect(withSkipMarker(`${longest}y`)).toBe(PR_TITLE);
  });
});

describe("루프 마커 — 소비자 넷이 같은 리터럴을 든다", () => {
  it("composite action의 가드가 head_commit.message에서 그 리터럴을 찾는다", () => {
    const yml = read(".github/actions/malmoi-i18n-push/action.yml");
    expect(yml).toContain(`*"${SKIP_MARKER}"*`);
    expect(yml).toContain("github.event.head_commit.message");
  });

  it("복사용 워크플로 템플릿의 if:가 같은 리터럴을 contains()로 본다", () => {
    const src = read("lib/onboarding/workflow.ts");
    expect(src).toContain(`contains(github.event.head_commit.message, '${SKIP_MARKER}')`);
  });

  it("ACTIONS.md의 예시 워크플로가 같은 조건이고, 머지 방식이 자유임을 말한다", () => {
    const doc = read("docs/ACTIONS.md");
    expect(doc).toContain(`contains(github.event.head_commit.message, '${SKIP_MARKER}')`);
    expect(doc).toMatch(/merge commit/i);
  });

  it("GitLab — 생성 job의 rules가 정규식으로, push.sh가 셸 패턴으로 같은 리터럴을 본다(두 겹)", () => {
    const src = read("lib/onboarding/gitlab-ci.ts");
    expect(src).toContain("SKIP_MARKER");
    expect(src).toContain("$CI_COMMIT_MESSAGE !~");
    const sh = read(".gitlab/malmoi-i18n-push/push.sh");
    expect(sh).toContain(`*"${SKIP_MARKER}"*`);
    expect(sh).toContain("CI_COMMIT_MESSAGE");
  });
});
