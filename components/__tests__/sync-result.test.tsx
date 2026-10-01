// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { SyncResult, syncResultTitle } from "@/components/home/sync-result";
import type { RepositoryImportOutcome, SurfaceImportResult } from "@/lib/import/result";
import { planImportRefusal } from "@/lib/import/refusal";
import { STATE } from "@/lib/status/canon";
import { m } from "@/lib/i18n";
import { render } from "./helpers/dom";

const props = { slug: "acme", branch: "main" };
const row = (surfaceSlug: string, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult =>
  ({ surfaceSlug, status, reason, count: status === "imported" ? 4 : 0, failed: 0, unmanaged: 0, errors: [] });
const retryButton = (container: HTMLElement) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === m.common.retry) ?? null;
function alert(container: HTMLElement) { return container.querySelector('[role="status"], [role="alert"]'); }
/** `Alert`의 본문 블록 — 있으면 두 줄 형이고 없으면 한 줄 형이다. */
/**
 * 형을 **줄 수**로 센다 — 한 줄(제목만)인지 두 줄(제목 + 원인)인지. ⚠️ 클래스 문자열로 본문 블록을
 * 찾으면 `Alert`의 래퍼 클래스가 바뀌는 순간 셀렉터가 **항상 null**이 되어 이 파일의 방어가 공허하게
 * green이 된다.
 */
function lines(container: HTMLElement) {
  const root = container.querySelector('[role="status"], [role="alert"]');
  return root === null ? 0 : root.querySelectorAll("p").length;
}

/**
 * 시안 `4e` — **형이 둘이고 그것이 방어다.** 색만 다르면 `Synced …`라는 앞머리가 같아 스캔에서
 * 성공으로 읽힌다 (ARCHITECTURE §0 불변식 9).
 */
it("전부 성공은 한 줄이고 표면을 나열하지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [row("web", "imported", null), row("emails", "imported", null)] }} />);
  expect(alert(container)?.getAttribute("role")).toBe("status");
  expect(container.textContent).toContain("Synced 8 keys from main");
  expect(container.textContent).not.toContain("web");
  expect(lines(container)).toBe(1);
  // 닫기는 Sync Dialog 푸터의 [Close]가 든다(sync-lock S5) — 성공 Alert에는 버튼이 없다.
  expect(container.querySelectorAll("button")).toHaveLength(0);
});

it("정상 0키도 같은 한 줄 형에 들어간다 — '이미 같았다' 갈래를 만들지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [{ ...row("web", "imported", null), count: 0 }] }} />);
  expect(container.textContent).toContain("Synced 0 keys from main");
  expect(lines(container)).toBe(1);
});

it("keeps unreadable and unapplied surfaces distinct with original diagnostics", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [
    row("web", "imported", null), row("ci", "superseded", "superseded"), row("format", "failed", "invalid-format"),
    { ...row("broken", "failed", "parse-failed"), errors: [{ path: "locales/ko.json", code: "parse-failed" }] },
  ] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  // ⚠️ 사고가 붙는 헤드라인에는 브랜치가 없다 (시안 `4e`) — 절이 셋이 되면 사고가 뒤로 밀린다.
  expect(container.textContent).toContain("Synced 4 keys, but 1 source couldn't be read");
  expect(container.textContent).not.toContain("keys from main");
  expect(container.textContent).toContain("2 sources weren't replaced");
  // 표면 이름은 헤드라인이 아니라 **원인 줄**에 산다 (DESIGN §6.644) — 성공한 `web`은 서지 않는다.
  for (const text of ["ci", "format", "broken", "locales/ko.json"]) expect(container.textContent).toContain(text);
  expect(container.querySelector('[role="status"] [data-surface]')?.textContent).toBe("broken");
  expect(container.querySelector('[data-reason="superseded"]')).not.toBeNull();
  expect(container.querySelector('[data-error-code="parse-failed"]')).not.toBeNull();
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(true);
});

/**
 * 시안 `4e`에 없는 갈래 — **들어간 표면이 하나도 없다.** `Synced …, but …`을 쓰면 `but` 앞 절이
 * 거짓이 되어 실패가 부분 성공으로 읽힌다.
 */
it("전 표면 실패는 성공 절을 앞에 두지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [row("web", "failed", "parse-failed")] }} />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  // 동기화 실패의 문장은 하나다(DESIGN §2.4) — Home 배너 제목과 같다.
  expect(container.textContent).toContain("The last sync couldn't finish");
  expect(container.textContent).not.toContain("but");
  expect(container.textContent).toContain("web");
});

it("포맷 누락은 표면별 결과이고 재시도가 없다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [row("web", "failed", "invalid-format")] }} />);
  expect(container.textContent).not.toContain("couldn't be read");
  expect(container.textContent).toContain("This source has no valid file format.");
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Try again")).toBe(false);
});

/**
 * ⚠️ **`partial`의 `reason`은 서버에서 언제나 `null`이다** (`lib/import/run.ts`의 `finishSurface` —
 * 값이 서는 것은 `prepared.kind === "failed"`뿐이다). 전에 이 케이스가 `"partial-import"`를 넘겨
 * **서버가 만들지 않는 조합**을 재고 있었고, 그래서 아래 회귀가 통과했다.
 */
it("distinguishes partial file failures from whole-surface failures", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [{ ...row("web", "partial", null), count: 8, failed: 2,
    errors: [{ path: "locales/ja.yml", code: "parse-failed" }] }] }} />);
  expect(container.querySelector('[role="status"]')).not.toBeNull(); expect(container.textContent).toContain("2");
  expect(container.textContent).not.toContain("source couldn't be read");
  // ⚠️ 표면은 전부 들어갔지만 값이 버려졌다 — 브랜치를 붙이면 전부 성공한 헤드라인과 글자까지 같아진다.
  expect(container.querySelector("p")?.textContent).toBe("Synced 8 keys");
  expect(container.textContent).not.toContain("keys from main");
  expect(lines(container)).toBeGreaterThan(1);
});

/**
 * 2026-09-16 브라우저 실측(`i18n-format-check`의 `locales/ja.yml`을 깨뜨림)이 잡은 회귀 —
 * 결과가 `Synced 18 keys` 아래에 **`locales — The last import did not finish.`**를 세웠다.
 * 임포트는 끝났고 18키가 들어갔으므로 거짓이다. 원인은 원인 줄이 `reason ?? "import-failed"`로
 * 폴백하는데 `partial`만 `reason`이 `null`이라는 것 — **없는 사유를 만들어 내는 자리**였다.
 *
 * ⚠️ **파일 오류 줄은 남아야 한다** — 그것이 이 갈래의 진짜 원인이고, 지우면 어느 파일이
 * 버려졌는지가 화면에서 사라진다.
 */
it("파일 일부 실패는 없는 사유를 만들어 내지 않는다 — 원인 줄 대신 파일 줄만 선다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [
    { ...row("locales", "partial", null), count: 18, failed: 1, errors: [{ path: "locales/ja.yml", code: "parse-failed" }] },
  ] }} />);
  expect(container.textContent).toContain("Synced 18 keys");
  expect(container.textContent).not.toContain("The last sync couldn't finish");
  // 파일 줄은 그대로다 — 무엇이 버려졌는지를 말하는 유일한 문장이다.
  expect(container.querySelector('[data-error-code="parse-failed"]')?.textContent).toBe("locales/ja.yml: The file couldn't be parsed.");
  // 표면 이름은 파일 경로가 이미 들고 있다 — 원인 줄의 slug를 따로 세우지 않는다.
  expect(container.querySelector('[role="status"] [data-surface]')).toBeNull();
});

/**
 * ⚠️ **중복 키만으로도 `partial`이 된다** — `buildPushPayload`의 `duplicateKeys`는 어댑터 오류가
 * 아니라 `lastWins`가 흡수하므로 사유도 파일 오류도 없는 사고가 실재한다. 그 표면에 자리를
 * 만들면 빈 블록이 남는다.
 */
it("사유도 파일 오류도 없는 사고는 빈 자리를 남기지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 0, surfaces: [
    { ...row("web", "partial", null), count: 8, failed: 1 },
  ] }} />);
  expect(container.textContent).toContain("Synced 8 keys");
  expect(container.querySelector('[role="status"] [data-surface]')).toBeNull();
  /*
    ⚠️ **재는 대상이 있다는 것부터 단언한다** — 빈 노드를 `for`로 훑기만 하면 셀렉터가 0개를 잡는
    순간 루프가 한 번도 안 돌고 통과한다. 이 파일이 `lines()`에서 클래스 셀렉터를 버린 것과 같은
    함정이고, 구조 셀렉터로 되풀이할 수 있다.
  */
  const nodes = [...container.querySelectorAll('[role="status"] div')];
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes.filter(node => node.textContent === "")).toEqual([]);
});

/** ⚠️ 사유가 **있는** 갈래는 그 줄이 참이므로 그대로 선다 — 위 수정이 여기까지 걷어 가면 안 된다. */
it("superseded는 사유가 있으므로 원인 줄이 그대로 선다", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [
    { ...row("i18n", "imported", null), count: 9 }, row("locales", "superseded", "superseded"),
  ] }} />);
  expect(container.textContent).toContain("Synced 9 keys, but 1 source wasn't replaced");
  expect(container.querySelector('[data-reason="superseded"]')?.textContent).toContain("New repository data arrived while syncing");
  expect(container.querySelector('[role="status"] [data-surface]')?.textContent).toBe("locales");
});

/**
 * 시안 `4f` — 거부는 **"다시 누르면 되나"**로 갈린다. 닫아도 같은 버튼이 같은 거부를 반복하는
 * 갈래에는 닫기를 주지 않고, 고칠 자리가 있는 둘만 액션을 든다.
 */
it("거부는 tone·닫기·액션이 갈래마다 갈린다", async () => {
  const view = await render(<SyncResult {...props} outcome={null} />);
  expect(view.container.textContent).toBe("");

  await view.rerender(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "already-running" }} />);
  expect(view.container.textContent).toContain("A sync is already running");
  // `dismissible` 갈래는 Dialog 안에서 [Try again]이 선다 — 닫기는 푸터 [Close]다.
  expect(retryButton(view.container)).not.toBeNull();

  await view.rerender(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "not-ready" }} />);
  expect(retryButton(view.container)).toBeNull();
  expect(view.container.querySelector('a[href="/projects/acme/settings"]')?.textContent).toBe("Open settings");
  expect(alert(view.container)?.className).toContain("bg-amber-50");

  // 리포 id 미고정은 [Reconnect], 계정 미연결(ConnectError)은 리포가 멀쩡하므로 끊김을 말하지 않고 설정으로 보낸다(ux-drift-unify r1).
  await view.rerender(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "unpinned" }} />);
  expect(view.container.querySelector('a[href="/projects/acme/settings"]')?.textContent).toBe("Reconnect");
  expect(view.container.textContent).toContain("This repository is disconnected");
  // 1-Y14 — 끊김 거부는 Home 배너·목록 칩의 Disconnected와 같은 톤이다(호박). 미연결(설치 없음)은 readiness가 먼저 막는다(`not-ready`).
  expect(planImportRefusal("unpinned").tone).toBe(STATE.disconnected.tone);
  expect(alert(view.container)?.className).toContain("bg-amber-50");
  await view.rerender(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "not-connected" }} />);
  expect(view.container.querySelector('a[href="/account"]')?.textContent).toBe(m.repositorySync.openAccount);
  expect(view.container.textContent).toContain("Account");
  expect(view.container.textContent).not.toMatch(/disconnected/i);

  // ⚠️ 리포는 생성 시점 고정이라 [Reconnect]가 눌러도 실패할 버튼이다 (DESIGN §6.2).
  await view.rerender(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "repo-replaced" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.querySelector("a")).toBeNull();
  expect(retryButton(view.container)).toBeNull();

  await view.rerender(<SyncResult {...props} outcome={{ ok: false, error: "forbidden" }} />);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
  expect(view.container.textContent).not.toContain("forbidden");
});

/**
 * **승인 뒤 남은 편집은 성공 한 줄에 숨기지 않는다** (sync-edit-protection T9 · POSTMORTEM 2026-09-16 "부분 실패를 미완료로 표현").
 * 폐기를 승인했는데 편집이 남았다면(Dialog 뒤 저장 · 리포에 없는 셀) 리포 갱신은 계속 멈춰 있다 — 그 사실이 두 줄 형으로 선다.
 */
it("[C4][C10] 남은 편집이 있으면 두 줄 warning이고 브랜치 헤드라인을 쓰지 않는다 (0이면 한 줄 성공 대조는 첫 테스트)", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: true, remainingEdits: 2, surfaces: [row("web", "imported", null)] }} />);
  expect(container.textContent).toContain("2 unsent edits were kept");
  expect(container.textContent).not.toContain("from main");
  expect(lines(container)).toBe(2);
  expect(container.querySelector('[data-alert="warning"]')).not.toBeNull();
});

/**
 * **세션이 끝난 Sync 거부는 막다른 길이 아니다** (QA D2). 전엔 공용 접근 문장 *"Sign in again to save your work."*
 * (Sync엔 저장할 입력이 없다)에 닫기도 로그인도 없었다. Home과 번역 화면이 이 한 컴포넌트를 쓰므로 여기서 고정한다.
 * [Sign in]은 **새 탭**이다 — 같은 화면의 편집자 세션 Alert와 같은 형(이 탭의 draft·화면을 떠나지 않는다).
 */
it("unauthorized 거부는 Sync 문장 + 새 탭 [Sign in]을 들고 [Try again]은 없다", async () => {
  const { m } = await import("@/lib/i18n");
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "unauthorized" }} />);
  const text = container.textContent ?? "";
  expect(text).toContain(m.repositorySync.errors.unauthorized);
  expect(text).not.toContain("save your work");
  const signIn = [...container.querySelectorAll("a")].find(a => a.textContent?.trim() === m.repositorySync.signIn);
  expect(signIn?.getAttribute("href")).toBe("/signin");
  expect(signIn?.getAttribute("target")).toBe("_blank");
  expect(retryButton(container)).toBeNull();
});

/**
 * malmoi#85 — Sync의 `base-branch-missing`이 온보딩 문장("We can't read the default branch. Check that the repository has
 * commits.")을 빌렸다. 여기서 없는 것은 리포의 기본 브랜치가 아니라 **설정의 base branch**다 — 그 이름을 대고 고칠 자리
 * (Settings → Base branch)로 보낸다. OWNER는 설정 링크, EDITOR는 링크 없이 "ask a project owner"다.
 */
it("base branch가 사라지면 그 이름과 설정의 Base branch를 말한다 — OWNER는 설정 링크", async () => {
  const { container } = await render(<SyncResult slug="acme" branch="qa3-missing-branch" outcome={{ ok: false, error: "base-branch-missing" }} />);
  const text = container.textContent ?? "";
  expect(text).toContain("qa3-missing-branch");
  expect(text).toMatch(/base branch/i);
  expect(text).not.toMatch(/default branch|has commits/i);
  expect(container.querySelector('a[href="/projects/acme/settings"]')).not.toBeNull();
});

it("EDITOR에게는 설정 링크 대신 project owner를 부른다 (#85) — 짝: OWNER에게는 그 문장이 없다", async () => {
  const { container } = await render(<SyncResult slug="acme" branch="qa3-missing-branch" role="EDITOR" outcome={{ ok: false, error: "base-branch-missing" }} />);
  expect(container.querySelector('a[href="/projects/acme/settings"]')).toBeNull();
  expect(container.textContent).toMatch(/ask a project owner/i);
  expect(container.textContent).toContain("qa3-missing-branch");
  const owner = await render(<SyncResult slug="acme" branch="qa3-missing-branch" role="OWNER" outcome={{ ok: false, error: "base-branch-missing" }} />);
  expect(owner.container.textContent).not.toMatch(/ask a project owner/i);
});

/**
 * ⚠️ **reconfirm은 편집만의 결과가 아니다** (audit #3 후속) — 폐기 승인 지문이 리포 연결·기준 브랜치까지 들므로 설정 변경도 이 거부를 낸다.
 * "Translations changed"라고 말하면 편집이 없던 사람이 원인을 엉뚱한 곳에서 찾는다. 지운 것이 없다는 사실과 다시 열라는 지시는 남긴다.
 */
/*
 * ⚠️ **"The project changed"도 원인 하나를 단언한다** (malmoi#137) — 같은 거부가 새 미전달 편집·기준 브랜치 변경 등 지문의 어떤 변화에도
 * 서고, 지문 발급이 실패해 `approval: null`이 나간 갈래에서는 아무것도 안 바뀌었을 수도 있다. 아는 것만 말한다: 본 것이 지금도
 * 맞는지 확인하지 못했다 · 지운 것이 없다 · 다시 열어 확인한다.
 */
it("reconfirm은 원인을 가리지 않는 문장으로 말하고 지운 것이 없다고 알린다 (malmoi#137)", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error: "reconfirm" }} />);
  const text = alert(container)?.textContent ?? "";
  expect(text).toContain("Sync couldn't confirm that what you reviewed is still current");
  expect(text).not.toMatch(/changed/i);
  expect(text).toContain("nothing was discarded");
  expect(text).toContain("Open Sync again to review and confirm");
});

/**
 * **전 표면 superseded는 실패가 아니라 밀림이다** (ux-drift-unify 🔴 B) — Logs가 회색 Superseded로 말하는 실행을 Home이 호박으로 말했다.
 * 톤은 `summarizeImport`(= `TONES[summarizeImportEvent]`)에서 오고, 무색(`muted`)은 Alert의 `neutral`이다.
 */
it("전 표면 superseded는 neutral Alert다 — Logs와 같은 톤", async () => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: true, remainingEdits: 0, surfaces: [
    row("web", "superseded", "superseded"), row("emails", "superseded", "lease-lost"),
  ] }} />);
  expect(container.querySelector("[data-alert]")?.getAttribute("data-alert")).toBe("neutral");
  expect(alert(container)?.getAttribute("role")).toBe("status");
  // 낱말도 Logs와 같다 — 실패 문장("couldn't finish")을 빌리지 않고, 표면별 원인 줄이 보조 문장을 든다.
  expect(container.textContent).toContain("Superseded");
  expect(container.textContent).not.toMatch(/couldn['’]t finish/);
  expect(container.querySelector('[data-reason="superseded"]')?.textContent).toContain("New repository data arrived while syncing");
});

/**
 * sync-lock S5 — 결과가 Dialog 안으로 옮기며 거부에도 [Try again]이 선다. **닫을 수 있고 갈 곳이 없는 거부만**이다(`dismissible` · 액션 없음).
 * `unconfirmed`는 뺀다 — 서버가 끝냈을 수 있어 다시 돌리면 두 번 돈다(malmoi#132).
 */
it.each([
  ["reconfirm", true], ["already-running", true], ["unavailable", true], ["ingest-failed", true],
  ["unconfirmed", false], ["unauthorized", false], ["repo-replaced", false], ["not-ready", false],
] as const)("거부 %s의 [Try again]은 %s", async (error, shown) => {
  const { container } = await render(<SyncResult {...props} onRetry={vi.fn()} outcome={{ ok: false, error }} />);
  expect([...container.querySelectorAll("button")].some(b => b.textContent?.trim() === m.common.retry)).toBe(shown);
});

it("onRetry가 없으면 거부에도 [Try again]이 서지 않는다", async () => {
  const { container } = await render(<SyncResult {...props} outcome={{ ok: false, error: "reconfirm" }} />);
  expect(container.querySelector("button")).toBeNull();
});

/**
 * sync-lock R6 — Dialog 결과 단계는 **결과별 제목**을 단다(Publish 모달 §6.646과 같은 형). 제목은 결과의 **종류**이고 본문 Alert 헤드라인은
 * 그 **내용**이라 같은 말이 두 번 서지 않는다 — design §4 결과 갈래 표의 행 전부 + 거부 코드 전부.
 * ⚠️ **"didn't run"은 실행 전 거부만이다** (U 리뷰 r2) — `ingest-failed`는 lease를 잡고 표면 실패까지 기록한 뒤의 바깥 catch라 Logs엔
 * 실패한 Sync가 남는다. 단계를 모르는 실패는 Logs의 Failed 낱말이다.
 * ⚠️ **겹침은 부분 문자열이 아니라 낱말로 잰다** — 바꿔 말한 같은 문장("didn't run" · "didn't go through")은 부분 문자열 검사를 지난다.
 */
const surface = (status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"] = null): SurfaceImportResult =>
  ({ ...row("web", status, reason), count: status === "imported" || status === "partial" ? 4 : 0, failed: status === "partial" ? 1 : 0 });
const t = m.repositorySync.resultTitle;
const PAIRS: [string, RepositoryImportOutcome, string][] = [
  ["성공", { ok: true, remainingEdits: 0, surfaces: [surface("imported")] }, t.complete],
  ["남은 편집", { ok: true, remainingEdits: 2, surfaces: [surface("imported")] }, t.issues],
  ["부분", { ok: true, remainingEdits: 0, surfaces: [surface("partial")] }, t.issues],
  ["일부 표면 실패", { ok: true, remainingEdits: 0, surfaces: [surface("imported"), { ...surface("failed", "parse-failed"), surfaceSlug: "emails" }] }, t.issues],
  ["일부 표면 밀림", { ok: true, remainingEdits: 0, surfaces: [surface("imported"), { ...surface("superseded", "superseded"), surfaceSlug: "emails" }] }, t.issues],
  ["전 표면 실패", { ok: true, remainingEdits: 0, surfaces: [surface("failed", "parse-failed")] }, t.nothingReplaced],
  ["전 표면 밀림", { ok: true, remainingEdits: 0, surfaces: [surface("superseded", "superseded")] }, t.nothingReplaced],
  ...(["reconfirm", "already-running", "unauthorized", "invalid input", "not-ready", "no-surfaces", "unpinned", "repo-replaced", "forbidden", "not-found", "archived"] as const)
    .map(error => [error, { ok: false, error }, t.didntRun] as [string, RepositoryImportOutcome, string]),
  ...(["unavailable", "ingest-failed", "not-connected", "base-branch-missing", "reauthorize", "repo-not-installed"] as const)
    .map(error => [error, { ok: false, error }, t.failed] as [string, RepositoryImportOutcome, string]),
  ["unconfirmed", { ok: false, error: "unconfirmed" }, t.unknown],
];
const IGNORED = new Set(["sync", "synced", "the", "a", "is", "was", "were", "with"]);
const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(word => word !== "" && !IGNORED.has(word)));
it.each(PAIRS)("결과 제목 — %s", async (_, outcome, title) => {
  expect(syncResultTitle(outcome)).toBe(title);
  const { container } = await render(<SyncResult {...props} outcome={outcome} />);
  const headline = alert(container)?.querySelector("p.font-medium")?.textContent ?? "";
  expect(headline).not.toBe("");
  const shared = [...words(title)].filter(word => words(headline).has(word));
  expect(shared, `${title} ↔ ${headline}`).toEqual([]);
});
