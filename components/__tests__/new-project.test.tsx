// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { isAccessLost } from "@/components/onboarding/failure";
import { NewProject } from "@/components/onboarding/new-project";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { RepoOption } from "@/lib/onboarding/types";

import userEvent from "@testing-library/user-event";

import { find, input, render } from "./helpers/dom";

/**
 * ⚠️ **`testTimeout`을 이 파일에서만 올린다** (2026-09-13 실측). `user-event`가 포인터 이벤트 사이에
 * **실시간 지연**을 끼우는데, 스위트 전체가 병렬로 돌 때 워커 경합으로 그 큐가 밀린다 — 단독 실행은
 * green이고 전체 실행에서 **실행마다 다른 2~10개**가 red였다.
 *
 * ⚠️ **`delay: null`로는 못 고친다** — 그러면 이벤트가 `act` 밖에서 동기로 몰려 35개가 죽는다(실측).
 * 지연 자체가 Radix가 여는 순서의 일부다.
 *
 *
 * ⚠️ **로컬에서 dev 서버·브라우저가 함께 돌면 더 밀린다** (2026-09-13 관찰) — 이 완화 뒤에도 그 상태의
 * 한 번이 red였고, 그것들을 안 띄운 3회는 연속 green이었다. CI는 그 부하가 없다.
 *
 * ⚠️ **전역으로 올리지 않는다** — 흔들리는 것은 Radix를 누르는 몇 파일인데 순수 함수 3,000개까지
 * 20초 천장을 가지면, 무한 루프로 퇴행한 모듈 하나가 로컬 게이트에서 5초가 아니라 20초를 태운다.
 */
vi.setConfig({ testTimeout: 20_000 });

const user = userEvent.setup();

const mocks = vi.hoisted(() => ({
  listRepoBranches: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(),
  createProject: vi.fn(), confirmManualFormat: vi.fn(), runFirstIngest: vi.fn(),
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("@/app/(edit)/projects/actions", () => mocks);
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

const repos: RepoOption[] = ["web", "mobile"].map((repo) => ({
  owner: "acme", repo, fullName: `acme/${repo}`, suggestedSlug: `acme-${repo}`, pushedAt: null,
}));
const candidate = (path = "i18n/{locale}.json"): CandidateSummary => ({
  adapter: "json-catalog", label: "JSON", pathTemplate: path, locales: ["en", "fr", "ko", "de", "ja"],
  outputPaths: [path.replace("{locale}", "en")],
  baseLocale: "en", keys: { status: "counted", count: 2 },
  samples: [{ locale: "en", rows: [{ key: "hello", value: path }], total: 2 }],
});
const button = (name: string) => {
  const found = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
};
const field = (id: string) => find<HTMLInputElement>(document.body, `#${id}`);
async function click(element: HTMLElement) { await act(async () => element.click()); }
/**
 * ⚠️ **Radix Select는 값을 대입해 못 바꾼다** — 트리거를 열고 옵션을 눌러야 한다 (2026-09-13 리워크).
 * 옵션은 **보이는 텍스트**로 찾는다: DOM에 value가 남지 않기 때문이다.
 */
async function select(trigger: string, optionText: string) {
  await act(async () => { await user.click(find(document.body, trigger)); });
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim().startsWith(optionText));
  if (!option) throw new Error(`Missing option: ${optionText}`);
  await act(async () => { await user.click(option); });
}
async function mount(closeMode: "back" | "list" = "list") {
  await render(<NewProject repos={repos} listError={undefined} installUrl={null} now="2026-09-13T00:00:00Z"
    initialError={undefined} backQuery={{ q: "format" }} closeMode={closeMode} adapters={[
      { adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "i18n/{locale}.json" },
      { adapter: "yaml-catalog", layout: "per-locale", label: "YAML", example: "i18n/{locale}.yaml" },
    ]} />);
}
async function files(manual = false) {
  if (manual) mocks.detectRepoFormats.mockResolvedValue({ ok: false, error: "no-candidates" });
  await mount();
  await click(find(document.body, '[role="radio"]'));
  await click(button("Next"));
}
async function manualReady() {
  await files(true);
  await input(field("manual-path"), "i18n/{locale}.json");
  await input(field("manual-base"), "en");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  expect(button("Next").disabled).toBe(false);
}
async function naming() {
  await files();
  await click(button("Next"));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRepoBranches.mockResolvedValue({ ok: true, names: ["main", "develop"], defaultBranch: "main", truncated: false });
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate(), candidate("other/{locale}.json")] });
  mocks.loadCandidateSample.mockResolvedValue({ ok: true, rows: [{ key: "hello", value: "Hello" }], total: 3 });
  mocks.confirmManualFormat.mockImplementation(async (input) => ({ ok: true, candidate: {
    ...candidate(input.pathTemplate), adapter: input.adapter, baseLocale: input.baseLocale, confirmation: "test-confirmation",
    samples: [{ locale: input.baseLocale, rows: [{ key: "hello", value: "Hello" }], total: 3 }],
  } }));
  mocks.createProject.mockResolvedValue({ ok: false, error: "unavailable" });
});

it("수동 경로를 바꾸면 이전 매칭으로 Next를 열지 않는다", async () => {
  await manualReady();
  await input(field("manual-path"), "missing/{locale}.json");
  expect(button("Next").disabled).toBe(true);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  expect(mocks.confirmManualFormat).toHaveBeenLastCalledWith(expect.objectContaining({ pathTemplate: "missing/{locale}.json" }));
});

it("수동 어댑터만 바꿔도 디바운스가 새 검증을 요청한다", async () => {
  await manualReady();
  await select("#manual-format", "YAML");
  expect(button("Next").disabled).toBe(true);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  expect(mocks.confirmManualFormat).toHaveBeenLastCalledWith(expect.objectContaining({ adapter: "yaml-catalog" }));
});

it("수동 기준 언어를 지우면 이전 매칭도 무효다", async () => {
  await manualReady();
  await input(field("manual-base"), "");
  expect(button("Next").disabled).toBe(true);
});

it("리포 응답이 역전돼도 최신 리포의 브랜치를 유지한다", async () => {
  const old = deferred<unknown>();
  mocks.listRepoBranches.mockImplementationOnce(() => old.promise);
  await mount();
  await click(find(document.body, '[role="radio"]'));
  await click(document.body.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  await act(async () => old.resolve({ ok: true, names: ["old"], defaultBranch: "old", truncated: false }));
  expect(field("repo-branch").textContent).toBe("main");
});

it("브랜치를 조회하는 동안 Next가 이전 브랜치로 진행하지 않는다", async () => {
  mocks.listRepoBranches.mockReturnValueOnce(new Promise(() => {}));
  await mount();
  await click(find(document.body, '[role="radio"]'));
  expect(button("Next").disabled).toBe(true);
});

it("Back 뒤 다른 브랜치 탐지보다 늦게 끝난 탐지는 버린다", async () => {
  const old = deferred<unknown>();
  mocks.detectRepoFormats.mockReturnValueOnce(old.promise);
  await files();
  await click(button("Back"));
  await select("#repo-branch", "develop");
  await click(button("Next"));
  await act(async () => old.resolve({ ok: true, candidates: [candidate("stale/{locale}.json")] }));
  expect(document.body.textContent).not.toContain("stale/{locale}.json");
});

it("후보를 바꿨다 돌아와도 옛 미리보기 응답이 새 샘플을 덮지 않는다", async () => {
  const old = deferred<unknown>(); mocks.loadCandidateSample.mockReturnValueOnce(old.promise);
  await files(); await select('[role="combobox"]', "fr");
  await click(find(document.body, '[aria-label="Preview other/{locale}.json"]'));
  await click(find(document.body, '[aria-label="Preview i18n/{locale}.json"]'));
  await select('[role="combobox"]', "fr");
  await act(async () => old.resolve({ ok: true, rows: [{ key: "hello", value: "STALE" }], total: 1 }));
  expect(document.body.textContent).not.toContain("STALE"); expect(document.body.textContent).toContain("Hello");
});
it("미체크 후보의 상세는 이름·주소·선택 언어를 바꾸지 않는다", async () => {
  await naming(); await input(field("project-name"), "Custom"); await input(field("project-slug"), "custom");
  await click(document.body.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  await click(button("Back")); await click(find(document.body, '[aria-label="Preview other/{locale}.json"]'));
  await click(button("Next"));
  expect(field("project-name").value).toBe("Custom"); expect(field("project-slug").value).toBe("custom");
  expect(document.body.querySelectorAll('[role="radio"]')[1]?.getAttribute("aria-checked")).toBe("true");
});

it("리포 변경도 이전 이름·주소를 새 리포에 가져오지 않는다", async () => {
  await files();
  await click(button("Next"));
  await input(field("project-name"), "Custom");
  await input(field("project-slug"), "custom");
  await click(button("Back"));
  await click(button("Back"));
  await click(document.body.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  await click(button("Next"));
  await click(button("Next"));
  expect(field("project-name").value).toBe("mobile");
  expect(field("project-slug").value).toBe("acme-mobile");
});

it("리포 검색어는 ②에서 Back으로 돌아와도 남는다", async () => {
  await mount();
  await input(find(document.body, 'input[placeholder="Find a repository by name"]'), "web");
  await click(find(document.body, '[role="radio"]'));
  await click(button("Next"));
  await click(button("Back"));
  expect(find<HTMLInputElement>(document.body, 'input[placeholder="Find a repository by name"]').value).toBe("web");
});

it("미리보기의 세션 만료는 ②에 머물고 Next를 잠근다", async () => {
  mocks.loadCandidateSample.mockResolvedValue({ ok: false, error: "unauthorized" });
  await files();
  await select('[role="combobox"]', "fr");
  expect(button("Next").disabled).toBe(true);
  expect(document.body.textContent).toContain("Sign in again");
  expect(mocks.router.replace).not.toHaveBeenCalled();
  expect(mocks.router.refresh).not.toHaveBeenCalled();
});

it("createProject 실패는 ③의 입력값을 유지한다", async () => {
  await files();
  await click(button("Next"));
  await input(field("project-name"), "Custom");
  await click(button("Create project"));
  expect(field("project-name").value).toBe("Custom");
  expect(document.body.textContent).toContain("Step 3 of 4");
  expect(mocks.runFirstIngest).not.toHaveBeenCalled();
});

it("세션 만료 후 Back을 눌러도 차단 상태를 지우지 않는다", async () => {
  mocks.createProject.mockResolvedValue({ ok: false, error: "unauthorized" });
  await files();
  await click(button("Next"));
  await click(button("Create project"));
  expect(button("Create project").disabled).toBe(true);
  await click(button("Back"));
  expect(button("Next").disabled).toBe(true);
  expect(document.body.textContent).toContain("Sign in again");
});

it("④는 모든 적재가 끝난 결과와 토큰을 보존하고 추가 적재를 호출하지 않는다", async () => {
  mocks.createProject.mockResolvedValue({ ok: true, slug: "acme-web", pushToken: "test-token", baseBranch: "main", count: 2, surfaces: [], yaml: "server-workflow" });
  await naming();
  await click(button("Create project"));
  expect(document.body.textContent).toContain("test-token");
  expect(document.body.textContent).toContain("Imported 2 keys.");
  expect(document.body.textContent).toContain("server-workflow");
  expect(button("Start translating").disabled).toBe(false);
  expect(mocks.runFirstIngest).not.toHaveBeenCalled();
  expect(mocks.router.refresh).not.toHaveBeenCalled();
});

it("lazy 샘플을 받으면 언어 옵션과 다음 단계의 키 수도 갱신된다", async () => {
  await files();
  await select('[role="combobox"]', "fr");
  expect(find(document.body, '[role="combobox"]').textContent).toContain("3 keys");
  await click(button("Next"));
  // ③의 기준 언어가 ①②와 같은 **행 형**이 되면서 배지가 `<li>` 안으로 들어갔다 (2026-09-13).
  const french = [...document.body.querySelectorAll('[role="radio"]')].find((el) => el.closest("li")?.textContent?.includes("fr"));
  expect(french?.closest("li")?.textContent).toContain("Most keys");
});

it("목록 조회만 실패하면 응답의 defaultBranch로 계속 진행한다", async () => {
  mocks.listRepoBranches.mockResolvedValue({ ok: false, error: "unavailable", defaultBranch: "develop" });
  await mount();
  await click(find(document.body, '[role="radio"]'));
  expect(document.body.textContent).toContain("develop");
  await click(button("Next"));
  expect(mocks.detectRepoFormats).toHaveBeenCalledWith({ owner: "acme", repo: "web", ref: "develop" });
});

it("생성 요청이 던져도 ③에 머물고 입력을 보존한다", async () => {
  mocks.createProject.mockRejectedValue(new Error("Network unavailable"));
  await files();
  await click(button("Next"));
  await input(field("project-name"), "Custom");
  await expect(click(button("Create project"))).resolves.toBeUndefined();
  expect(field("project-name").value).toBe("Custom");
  expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
});

it("생성 중 Back으로 이동했다가 실패가 다른 단계에 표시되지 않는다", async () => {
  const pending = deferred<unknown>();
  mocks.createProject.mockReturnValueOnce(pending.promise);
  await files();
  await click(button("Next"));
  await click(button("Create project"));
  expect(button("Back").disabled).toBe(true);
  await act(async () => pending.resolve({ ok: false, error: "unavailable" }));
  expect(field("project-name").value).toBe("web");
  expect(button("Back").disabled).toBe(false);
});

it.each(["reauthorize", "repo-not-installed", "forbidden"])("미리보기 인가 거부 %s도 Next를 막는다", async (error) => {
  mocks.loadCandidateSample.mockResolvedValue({ ok: false, error });
  await files();
  await select('[role="combobox"]', "fr");
  expect(button("Next").disabled).toBe(true);
});

it("검색 결과에서 선택한 리포가 사라지면 Next를 막는다", async () => {
  await mount();
  await click(find(document.body, '[role="radio"]'));
  await input(find(document.body, 'input[placeholder="Find a repository by name"]'), "absent");
  expect(button("Next").disabled).toBe(true);
});

it("생성 중 입력을 바꿔 이전 제출의 거부를 새 입력에 붙이지 않는다", async () => {
  const pending = deferred<unknown>();
  mocks.createProject.mockReturnValueOnce(pending.promise);
  await files();
  await click(button("Next"));
  await click(button("Create project"));
  expect(field("project-slug").matches(":disabled")).toBe(true);
  await act(async () => pending.resolve({ ok: false, error: "slug-taken" }));
  expect(field("project-slug").matches(":disabled")).toBe(false);
});

it("응답 유실은 미생성을 단정하지 않고 목록 확인을 안내한다", async () => {
  mocks.createProject.mockRejectedValue(new Error("response lost"));
  await naming();
  await click(button("Create project"));
  expect(document.body.textContent).not.toContain("nothing has been created");
  expect(document.body.textContent).toContain("Check your project list");
  expect(mocks.createProject).toHaveBeenCalledTimes(1);
});

it("인가 거부 판정은 일시 장애·입력 오류와 구별된다", () => {
  for (const error of ["unauthorized", "reauthorize", "forbidden", "not-found", "not-connected", "repo-not-installed", "installation-forbidden", "repo-forbidden"]) expect(isAccessLost(error)).toBe(true);
  for (const error of ["unavailable", "manual-no-match", "invalid-branch", "slug-taken", ""]) expect(isAccessLost(error)).toBe(false);
});

it("수동 지정 후 브랜치를 바꾸면 재검증한 기준 언어로 진행한다", async () => {
  await manualReady();
  await click(button("Back"));
  await select("#repo-branch", "develop");
  await click(button("Next"));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  await click(button("Next"));
  expect(find(document.body, '[role="radio"]').getAttribute("aria-checked")).toBe("true");
});

it("리포 접근 거부 뒤 다른 리포를 고르면 그 리포의 인가로 진행한다", async () => {
  mocks.listRepoBranches.mockResolvedValueOnce({ ok: false, error: "repo-not-installed" });
  await mount();
  await click(find(document.body, '[role="radio"]'));
  expect(button("Next").disabled).toBe(true);
  await click(document.body.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  expect(button("Next").disabled).toBe(false);
});

/**
 * ⚠️ **후보 0개에도 표 껍데기가 서 있다** (핸드오프 3a). 경로를 쳐서 매칭되는 순간 빈 박스가 통째로
 * 툴바+헤더+행으로 갈리면 화면이 튄다 — 로딩에 헤더를 세워 두는 것과 같은 규칙이고, 그 규칙이
 * 화면에만 있으면 다음 리팩터가 조용히 지운다.
 */
/**
 * ⚠️ **`RadioGroup`을 `asChild`로 `<ul>`에 얹으면 리스트가 죽는다** (2026-09-13 실측). Radix가 그
 * 태그의 role을 덮어써 `<li>`가 고아 listitem이 되고 "list, N items" 안내가 사라진다 — 화면에도
 * 값에도 안 나타나는 회귀라 구조로 고정한다.
 */
it("리포 목록이 radiogroup이 되면서 리스트 시맨틱을 잃지 않는다", async () => {
  await mount();
  const group = find(document.body, '[role="radiogroup"]');
  expect(group.tagName).toBe("DIV");
  expect(group.querySelector("ul")).not.toBeNull();
  expect(find(document.body, '[role="radio"]').closest("ul")).not.toBeNull();
  expect(group.getAttribute("aria-label")).not.toBeNull();
});

it("후보 0개에도 미리보기 표의 헤더가 서 있다", async () => {
  await files(true);
  expect(document.body.querySelectorAll("th")).toHaveLength(2);
  expect(document.body.textContent).toContain("Nothing to preview yet");
  /*
    ⚠️ **설명이 "지금 할 일"을 말한다** — 확인할 키가 하나도 없는 화면이 "Check the keys before you
    continue"를 말하면 사용자가 없는 것을 찾는다 (2026-09-13 실물 관측).
  */
  expect(document.body.textContent).toContain("Set the path and it will check");
  expect(document.body.textContent).not.toContain("Check the keys before you continue");
  /*
    ⚠️ **툴바가 통째로 없다** — 고를 로케일도 읽을 파일도 없는데 트랙 자리를 남기면 탐지 중 화면과
    픽셀 단위로 같아져 "로딩이 멈췄다"로 읽힌다. **클래스가 아니라 구조로 센다**: 회색 블록을 다른
    클래스로 바꿔 되살리면 클래스 단언은 green인 채 결함만 돌아온다.
  */
  expect(document.body.querySelector(".bg-canvas")).toBeNull();
  expect(document.body.querySelector('[role="radiogroup"]')).toBeNull();
  expect(document.body.querySelector("#preview-language")).toBeNull();
});

it("수동 후보의 lazy 샘플도 옵션의 키 수를 갱신한다", async () => {
  await manualReady();
  // 수동 지정 폼이 서 있어 콤보박스가 둘이다 — 언어 쪽은 `#manual-format`이 아닌 것이다.
  const language = '[role="combobox"]:not(#manual-format)';
  await select(language, "fr");
  expect(find(document.body, language).textContent).toContain("3 keys");
});

/**
 * ⚠️ **탐지 중 우측이 "Nothing to preview yet"을 보이면 안 된다** (bugshot-qa 2026-09-13 실측).
 * 그 문구는 **예외 E**(후보 0개)의 것이라, 탐지가 도는 동안 띄우면 "이 리포엔 로케일 파일이 없다"를
 * 먼저 말해 놓고 몇 초 뒤 후보를 내놓는다. design §4는 그 자리에 **표 헤더 실물 + 행 스켈레톤**을
 * 요구한다 — 다 차고 나서 레이아웃이 움직이지 않아야 한다.
 */
it("탐지 중에는 후보 0개 문구를 띄우지 않는다", async () => {
  const gate = deferred<unknown>();
  mocks.detectRepoFormats.mockReturnValue(gate.promise);
  await mount();
  await click(find(document.body, '[role="radio"]'));
  await click(button("Next"));

  const body = find<HTMLElement>(document.body, "[data-onboarding-body]");
  expect(body.textContent).not.toContain("Nothing to preview yet");
  expect(body.textContent).toContain("Key");
  expect(body.textContent).toContain("Value");

  await act(async () => { gate.resolve({ ok: true, candidates: [candidate()] }); });
});

/**
 * ⚠️ **"Base language"가 두 번 읽히면 안 된다** (bugshot-qa 2026-09-13 실측). `sr-only` legend와
 * 보이는 `<p>`가 같은 문장을 들고 있어 스크린리더가 그룹 이름을 두 번 말했다.
 */
it("③의 기준 언어 그룹 이름이 한 번만 있다", async () => {
  await naming();

  const found = [...document.body.querySelectorAll("*")].filter(
    (node) => node.children.length === 0 && node.textContent?.trim() === "Base language",
  );
  expect(found).toHaveLength(1);
});

/**
 * ③의 기준 언어는 **열까지 펼치고 열하나부터 접는다** (2026-09-13 사용자). ②(넷)와 경계가 다른
 * 근거는 `lib/onboarding/locale-picker.ts`가 든다 — 라디오는 감싸므로 줄만 늘고, 이 자리는
 * **되돌릴 수 없는 결정**이라 보이는 편이 낫다. 그 위는 57로케일 리포에서 실제로 스크롤이 됐다.
 */
const manyLocales = (n: number): string[] => Array.from({ length: n }, (_, i) => `l${String(i).padStart(2, "0")}`);

it("기준 언어가 열까지는 라디오 그대로다 — 적은 목록에 한 겹 더 누르게 하지 않는다", async () => {
  const locales = manyLocales(10);
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [{ ...candidate(), locales, baseLocale: locales[0] }] });
  await files();
  await click(button("Next"));

  expect(document.body.querySelector("#project-base-locale")).toBeNull();
  expect(document.body.querySelectorAll('[role="radio"]')).toHaveLength(10);
});

it("열하나부터 목록으로 접힌다", async () => {
  const locales = manyLocales(11);
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [{ ...candidate(), locales, baseLocale: locales[0] }] });
  await files();
  await click(button("Next"));

  expect(document.body.querySelectorAll('[role="radio"]')).toHaveLength(0);
  const picker = find(document.body, "#project-base-locale");
  expect(picker.textContent).toContain("l00");
  await act(async () => { await user.click(picker); });
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(11);
});

/**
 * ⚠️ **컨트롤이 하나면 `fieldset`이 아니다.** 접힌 갈래에서 `legend`와 `Select`의 접근 이름이 둘 다
 * "Base language"라 스크린리더가 "Base language 그룹, Base language 콤보박스"로 읽는다 — 2026-09-13에
 * 고친 sr-only legend 중복과 같은 부류다. 묶을 것이 없으면 그냥 라벨 하나다.
 */
it("접힌 갈래는 그룹 이름을 한 번만 말한다", async () => {
  const locales = manyLocales(11);
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [{ ...candidate(), locales, baseLocale: locales[0] }] });
  await files();
  await click(button("Next"));

  const named = [...document.body.querySelectorAll("*")].filter(
    (node) => node.children.length === 0 && node.textContent?.trim() === "Base language",
  );
  expect(named).toHaveLength(1);
  // ⚠️ **`legend`가 있는 `fieldset`만 본다** — 제출 중 입력을 잠그는 `fieldset disabled`는 접근
  // 이름을 만들지 않으므로 이 검사의 대상이 아니다.
  expect(document.body.querySelector("fieldset > legend")).toBeNull();
  // Radix 트리거는 `<button>`이라 `labels`가 없다 — 그 id를 가리키는 `<label>`을 직접 센다.
  expect(document.body.querySelectorAll('label[for="project-base-locale"]')).toHaveLength(1);
});

/** 접혀도 키 수와 배지는 **아는 언어에만** 붙는다 (결정 ⑥⑦) — 배지 자리가 옵션 라벨로 간다. */
it("접힌 목록의 옵션이 키 수와 `Most keys`를 든다", async () => {
  const locales = manyLocales(11);
  mocks.detectRepoFormats.mockResolvedValue({
    ok: true,
    candidates: [{
      ...candidate(), locales, baseLocale: locales[0],
      samples: [
        { locale: "l00", rows: [], total: 9 },
        { locale: "l01", rows: [], total: 4 },
      ],
    }],
  });
  await files();
  await click(button("Next"));

  await act(async () => { await user.click(find(document.body, "#project-base-locale")); });
  const label = (value: string) =>
    [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim()).find((t) => t === value || t?.startsWith(`${value} `));
  expect(label("l00")).toBe("l00 · 9 keys · Most keys");
  expect(label("l01")).toBe("l01 · 4 keys");
  expect(label("l05")).toBe("l05");
});


it.each(["back", "list"] as const)("호출부가 정한 닫기 경로를 따른다: %s", async (closeMode) => {
  await mount(closeMode);
  await click(find(document.body, 'button[aria-label="Close"]'));
  if (closeMode === "back") {
    expect(mocks.router.back).toHaveBeenCalledOnce();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  } else {
    expect(mocks.router.replace).toHaveBeenCalledWith("/projects?q=format");
    expect(mocks.router.back).not.toHaveBeenCalled();
  }
});

/**
 * ⚠️ **모달의 빈 상태가 본문 세로 중앙이다** (2026-09-13 사용자 실물 · 핸드오프 1·3a). 껍데기가
 * `min-h`로 세로를 잡아 놓아서, 빈 상태를 그냥 반환하면 칩·제목·설명이 **헤더 바로 아래 한 덩어리**로
 * 뜨고 그 아래 600px이 통째로 빈다. `EmptyState`는 수직 중앙을 하지 않는다(DESIGN §6.4) — **`flex-1`은
 * 호출부가 든다**는 그 계약을 지키는 자리가 여기다.
 *
 * ⚠️ **클래스로 센다.** 이 축은 jsdom이 레이아웃을 계산하지 않아 실측이 불가능하고, 화면에만 있으면
 * 다음 리팩터가 조용히 지운다.
 */
/** `EmptyState` 루트 — 제목 `p.text-lg`의 부모다 (모달 헤더 제목은 `text-xl`이라 겹치지 않는다). */
function emptyWrapper(): HTMLElement {
  const root = find<HTMLElement>(document.body, "p.text-lg").parentElement;
  if (root?.parentElement == null) throw new Error("Missing EmptyState wrapper");
  return root.parentElement;
}
function expectCentered(wrapper: HTMLElement) {
  for (const cls of ["flex-1", "items-center", "justify-center"]) expect(wrapper.className).toContain(cls);
}

it("① 계정 미연결 빈 상태가 본문 세로 중앙에 선다", async () => {
  await render(<NewProject repos={undefined} listError="not-connected" installUrl={null} now="2026-09-13T00:00:00Z"
    initialError={undefined} backQuery={{}} closeMode="list" adapters={[]} />);

  expect(document.body.textContent).toContain("Connect your GitHub account");
  expectCentered(emptyWrapper());
});

it("① 설치에 리포가 없는 빈 상태도 같은 자리다", async () => {
  await render(<NewProject repos={undefined} listError="no-installations" installUrl={null} now="2026-09-13T00:00:00Z"
    initialError={undefined} backQuery={{}} closeMode="list" adapters={[]} />);

  expectCentered(emptyWrapper());
});

it("① 검색 0건도 세로 중앙이다 — 검색 필드는 위에 남는다", async () => {
  await mount();
  await input(find<HTMLInputElement>(document.body, 'input[aria-label="Find a repository by name"]'), "zzz");

  expect(document.body.textContent).toContain('No repository matches "zzz".');
  expectCentered(emptyWrapper());
});

/**
 * ⚠️ **②의 빈 상태는 표 헤더 **아래** 남은 높이의 중앙이다** (핸드오프 3a). 헤더는 그대로 서고
 * 본문 자리만 비므로, 중앙을 잡는 것은 스크롤 컨테이너여야 한다 — 바깥 박스가 잡으면 헤더까지
 * 포함한 중앙이 되어 블록이 위로 밀린다.
 */
it("② 후보 0개 미리보기의 빈 상태가 표 헤더 아래 중앙에 선다", async () => {
  await files(true);

  const wrapper = emptyWrapper();
  expectCentered(wrapper);
  expect(wrapper.parentElement?.className).toContain("overflow-auto");
  expect(wrapper.parentElement?.querySelector("thead")).not.toBeNull();
});

/**
 * ⚠️ **②의 빈 상태가 제목 + 설명 둘 다 든다** (시안 3a). 2026-09-13까지 **제목 한 줄뿐**이었고 —
 * `preview.none`이 처음 들어올 때부터 그랬다 — 우측이 "지금 뭘 해야 하나"를 아무도 말하지 않았다.
 * ⚠️ **겹치던 뒷문장을 좌측 수동 지정 힌트에서 뺐다**: 같은 문장을 한 화면에 두 번 두지 않는다.
 */
it("② 후보 0개 빈 상태가 설명을 든다 — 그 문장이 좌측 힌트와 겹치지 않는다", async () => {
  await files(true);
  const body = find<HTMLElement>(document.body, "[data-onboarding-body]");
  const text = body.textContent ?? "";

  expect(text).toContain("Set a path and malmoi will show the keys it finds.");
  expect(text).toContain("Setting a path clears the selection above.");
  // 뒷문장은 우측에만 있다 — 좌측 힌트가 그것을 다시 들면 두 번 나온다.
  expect(text.split("If no file matches, the project isn't created.")).toHaveLength(2);
});

it("생성 거부는 경로와 실패 수를 보이고 생성 완료 전에는 ③에 머문다", async () => {
  const pending = deferred<unknown>(); mocks.createProject.mockReturnValueOnce(pending.promise);
  await naming(); await input(field("project-name"), "Keep me"); await click(button("Create project"));
  expect(document.body.textContent).toContain("Step 3 of 4");
  expect(document.body.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => pending.resolve({ ok: false, error: "ingest-failed", surface: { pathTemplate: "i18n/{locale}.json", failed: 2, errors: [] } }));
  expect(field("project-name").value).toBe("Keep me");
  expect(document.body.textContent).toContain("Nothing was created");
  expect(document.body.textContent).toContain("2");
  expect(document.body.textContent).toContain("i18n/{locale}.json");
});

const include = (path: string) => find<HTMLElement>(document.body, `[role="checkbox"][aria-label="Include ${path}"]`);
it("체크와 상세는 형제이며 리스트 시맨틱과 독립 동작을 보존한다", async () => {
  await files();
  const checkbox = include("i18n/{locale}.json");
  const preview = find<HTMLElement>(document.body, '[aria-label="Preview i18n/{locale}.json"]');
  expect(checkbox.parentElement).toBe(preview.parentElement);
  expect(checkbox.closest("label")).toBeNull();
  const list = checkbox.closest("ul"); expect(list).not.toBeNull();
  expect(list?.getAttribute("role")).toBeNull();
  expect(list?.getAttribute("aria-label")).toBe("Locale file candidates");
  expect(document.body.querySelector('button button, label button button')).toBeNull();
  await click(include("other/{locale}.json"));
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(preview.closest("li")?.className).toContain("bg-muted");
  await click(checkbox); await click(include("other/{locale}.json"));
  expect(button("Next").disabled).toBe(true);
  await click(find(document.body, '[aria-label="Preview other/{locale}.json"]'));
  expect(button("Next").disabled).toBe(true);
});
it("출력 충돌은 체크 시 경고하고 해제하면 Next가 열린다", async () => {
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate(), { ...candidate("other/{locale}.json"), outputPaths: ["i18n/en.json"] }] });
  await files(); await click(include("other/{locale}.json"));
  expect(button("Next").disabled).toBe(true);
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("i18n/en.json");
  await click(include("other/{locale}.json")); expect(button("Next").disabled).toBe(false);
});
it("각 표면의 언어를 제출하고 체크 해제·재선택에서 보존한다", async () => {
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [
    { ...candidate(), locales: ["en", "ko"] }, { ...candidate("other/{locale}.json"), locales: ["en", "fr"] },
  ] });
  await files(); await click(include("other/{locale}.json")); await click(button("Next"));
  const groups = document.body.querySelectorAll('[role="radiogroup"]');
  expect(groups).toHaveLength(2);
  expect(groups[0]?.getAttribute("aria-labelledby")).not.toBe(groups[1]?.getAttribute("aria-labelledby"));
  await click(groups[0]!.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  await click(groups[1]!.querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
  await click(button("Back")); await click(include("other/{locale}.json")); await click(include("other/{locale}.json"));
  await click(button("Next")); await click(button("Create project"));
  expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ surfaces: [
    expect.objectContaining({ pathTemplate: "i18n/{locale}.json", baseLocale: "ko" }),
    expect.objectContaining({ pathTemplate: "other/{locale}.json", baseLocale: "fr" }),
  ] }));
});
it("새 탐지는 체크와 각 언어 선택을 초기화한다", async () => {
  await files(); await click(include("other/{locale}.json")); await click(button("Back"));
  await select("#repo-branch", "develop"); await click(button("Next"));
  expect(include("i18n/{locale}.json").getAttribute("aria-checked")).toBe("true");
  expect(include("other/{locale}.json").getAttribute("aria-checked")).toBe("false");
  await click(button("Next")); await click(button("Create project"));
  expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ surfaces: [expect.objectContaining({ baseLocale: "en" })] }));
});
it("선택 언어가 후보 목록 밖이면 생성할 수 없다", async () => {
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [{ ...candidate(), baseLocale: "xx" }] });
  await files(); await click(button("Next")); expect(button("Create project").disabled).toBe(true);
});
it("수동 지정은 이전 탐지 체크를 섞지 않고 선택 언어를 보존한다", async () => {
  await files(); await click(include("other/{locale}.json"));
  await click(button("Set manually"));
  await input(field("manual-path"), "manual/{locale}.json"); await input(field("manual-base"), "ko");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  await click(button("Next")); await click(button("Create project"));
  expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ manual: true, surfaces: [
    { adapter: "json-catalog", pathTemplate: "manual/{locale}.json", baseLocale: "ko" },
  ] }));
});
