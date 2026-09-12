// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { isAccessLost } from "@/components/onboarding/failure";
import { NewProject } from "@/components/onboarding/new-project";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { RepoOption } from "@/lib/onboarding/types";

import { find, input, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({
  listRepoBranches: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(),
  createProject: vi.fn(), confirmManualFormat: vi.fn(), runFirstIngest: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("@/app/(edit)/projects/actions", () => mocks);
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

const repos: RepoOption[] = ["web", "mobile"].map((repo) => ({
  owner: "acme", repo, fullName: `acme/${repo}`, suggestedSlug: `acme-${repo}`, pushedAt: null,
}));
const candidate = (path = "i18n/{locale}.json"): CandidateSummary => ({
  adapter: "json-catalog", label: "JSON", pathTemplate: path, locales: ["en", "fr", "ko", "de", "ja"],
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
async function select(id: string, value: string) {
  await act(async () => {
    const el = find<HTMLSelectElement>(document.body, id);
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function mount() {
  await render(<NewProject repos={repos} listError={undefined} installUrl={null} now="2026-09-13T00:00:00Z"
    initialError={undefined} backQuery={{}} adapters={[
      { adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "i18n/{locale}.json" },
      { adapter: "yaml-catalog", layout: "per-locale", label: "YAML", example: "i18n/{locale}.yaml" },
    ]} />);
}
async function files(manual = false) {
  if (manual) mocks.detectRepoFormats.mockResolvedValue({ ok: false, error: "no-candidates" });
  await mount();
  await click(find(document.body, 'input[name="repo"]'));
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
  await select("#manual-format", "yaml-catalog");
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
  await click(find(document.body, 'input[name="repo"]'));
  await click(document.body.querySelectorAll<HTMLInputElement>('input[name="repo"]')[1]!);
  await act(async () => old.resolve({ ok: true, names: ["old"], defaultBranch: "old", truncated: false }));
  expect(field("repo-branch").value).toBe("main");
});

it("브랜치를 조회하는 동안 Next가 이전 브랜치로 진행하지 않는다", async () => {
  mocks.listRepoBranches.mockReturnValueOnce(new Promise(() => {}));
  await mount();
  await click(find(document.body, 'input[name="repo"]'));
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
  const old = deferred<unknown>();
  mocks.loadCandidateSample.mockReturnValueOnce(old.promise);
  await files();
  await select('select[aria-label="Language"]', "fr");
  await click(document.body.querySelectorAll<HTMLInputElement>('input[name="candidate"]')[1]!);
  await click(find(document.body, 'input[name="candidate"]'));
  await select('select[aria-label="Language"]', "fr");
  await act(async () => old.resolve({ ok: true, rows: [{ key: "hello", value: "STALE" }], total: 1 }));
  expect(document.body.textContent).not.toContain("STALE");
  expect(document.body.textContent).toContain("Hello");
});

it("후보 변경은 이름·주소·기준 언어를 초기화한다", async () => {
  await files();
  await click(button("Next"));
  await input(field("project-name"), "Custom");
  await input(field("project-slug"), "custom");
  await select("#project-base-locale", "fr");
  await click(button("Back"));
  await click(document.body.querySelectorAll<HTMLInputElement>('input[name="candidate"]')[1]!);
  await click(button("Next"));
  expect(field("project-name").value).toBe("web");
  expect(field("project-slug").value).toBe("acme-web");
  expect(find<HTMLSelectElement>(document.body, "#project-base-locale").value).toBe("en");
});

it("리포 변경도 이전 이름·주소를 새 리포에 가져오지 않는다", async () => {
  await files();
  await click(button("Next"));
  await input(field("project-name"), "Custom");
  await input(field("project-slug"), "custom");
  await click(button("Back"));
  await click(button("Back"));
  await click(document.body.querySelectorAll<HTMLInputElement>('input[name="repo"]')[1]!);
  await click(button("Next"));
  await click(button("Next"));
  expect(field("project-name").value).toBe("mobile");
  expect(field("project-slug").value).toBe("acme-mobile");
});

it("리포 검색어는 ②에서 Back으로 돌아와도 남는다", async () => {
  await mount();
  await input(find(document.body, 'input[placeholder="Find a repository by name"]'), "web");
  await click(find(document.body, 'input[name="repo"]'));
  await click(button("Next"));
  await click(button("Back"));
  expect(find<HTMLInputElement>(document.body, 'input[placeholder="Find a repository by name"]').value).toBe("web");
});

it("미리보기의 세션 만료는 ②에 머물고 Next를 잠근다", async () => {
  mocks.loadCandidateSample.mockResolvedValue({ ok: false, error: "unauthorized" });
  await files();
  await select('select[aria-label="Language"]', "fr");
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

it("④의 적재 세션 만료는 토큰을 보존하고 이동을 막는다", async () => {
  mocks.createProject.mockResolvedValue({ ok: true, slug: "acme-web", pushToken: "test-token", baseBranch: "main" });
  mocks.runFirstIngest.mockResolvedValue({ ok: false, error: "unauthorized" });
  await files();
  await click(button("Next"));
  await click(button("Create project"));
  expect(document.body.textContent).toContain("test-token");
  expect(button("Start translating").disabled).toBe(true);
  expect(mocks.router.refresh).not.toHaveBeenCalled();
});

it("lazy 샘플을 받으면 언어 옵션과 다음 단계의 키 수도 갱신된다", async () => {
  await files();
  await select('select[aria-label="Language"]', "fr");
  expect(find<HTMLOptionElement>(document.body, 'option[value="fr"]').textContent).toContain("3 keys");
  await click(button("Next"));
  const picker = find<HTMLSelectElement>(document.body, "#project-base-locale");
  expect([...picker.options].find((o) => o.value === "fr")?.textContent).toContain("3 keys");
  // 키 수를 아는 둘 중 많은 쪽이 배지를 든다 — 모르는 언어에는 안 붙는다 (결정 ⑥⑦).
  expect([...picker.options].find((o) => o.value === "fr")?.textContent).toContain("Most keys");
});

it("목록 조회만 실패하면 응답의 defaultBranch로 계속 진행한다", async () => {
  mocks.listRepoBranches.mockResolvedValue({ ok: false, error: "unavailable", defaultBranch: "develop" });
  await mount();
  await click(find(document.body, 'input[name="repo"]'));
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
  await select('select[aria-label="Language"]', "fr");
  expect(button("Next").disabled).toBe(true);
});

it("검색 결과에서 선택한 리포가 사라지면 Next를 막는다", async () => {
  await mount();
  await click(find(document.body, 'input[name="repo"]'));
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

it("생성 후 세션 만료 문구는 프로젝트가 없다고 말하지 않는다", async () => {
  mocks.createProject.mockResolvedValue({ ok: true, slug: "acme-web", pushToken: "test-token", baseBranch: "main" });
  mocks.runFirstIngest.mockResolvedValue({ ok: false, error: "unauthorized" });
  await files();
  await click(button("Next"));
  await click(button("Create project"));
  expect(document.body.textContent).not.toContain("nothing has been created");
  expect(document.body.textContent).toContain("Sign in again");
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
  expect(find<HTMLSelectElement>(document.body, "#project-base-locale").value).toBe("en");
});

it("리포 접근 거부 뒤 다른 리포를 고르면 그 리포의 인가로 진행한다", async () => {
  mocks.listRepoBranches.mockResolvedValueOnce({ ok: false, error: "repo-not-installed" });
  await mount();
  await click(find(document.body, 'input[name="repo"]'));
  expect(button("Next").disabled).toBe(true);
  await click(document.body.querySelectorAll<HTMLInputElement>('input[name="repo"]')[1]!);
  expect(button("Next").disabled).toBe(false);
});

it("수동 후보의 lazy 샘플도 옵션의 키 수를 갱신한다", async () => {
  await manualReady();
  await select('select[aria-label="Language"]', "fr");
  expect(find<HTMLOptionElement>(document.body, 'option[value="fr"]').textContent).toContain("3 keys");
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
  await click(find(document.body, 'input[name="repo"]'));
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
 * ③의 기준 언어도 ②와 **같은 경계**로 접힌다 (2026-09-13 실물 관측). 57로케일 리포에서 ②는
 * `Select`인데 ③이 라디오 57개를 펼쳤고, **되돌릴 수 없는 결정**을 그 스크롤에서 고르게 했다.
 */
it("기준 언어가 다섯 이상이면 목록으로 접힌다", async () => {
  await files();
  await click(button("Next"));

  expect(document.body.querySelectorAll('input[name="baseLocale"]')).toHaveLength(0);
  const picker = find<HTMLSelectElement>(document.body, "#project-base-locale");
  expect(picker.options).toHaveLength(5);
  expect(picker.value).toBe("en");
});

it("접힌 목록에서도 `Most keys`가 보인다 — 배지 자리가 옵션 라벨로 간다", async () => {
  await files();
  // 아는 언어가 하나뿐이면 비교할 것이 없어 배지가 안 선다 — 하나를 더 받아 둘로 만든다.
  await select('select[aria-label="Language"]', "fr");
  await click(button("Next"));

  const picker = find<HTMLSelectElement>(document.body, "#project-base-locale");
  expect([...picker.options].find((o) => o.value === "fr")?.textContent).toContain("Most keys");
  // 키 수를 모르는 언어에는 배지도 키 수도 안 붙는다 (결정 ⑥⑦).
  expect([...picker.options].find((o) => o.value === "ko")?.textContent?.trim()).toBe("ko");
});

it("넷 이하면 라디오 그대로다 — 적은 목록까지 한 겹 더 누르게 하지 않는다", async () => {
  mocks.detectRepoFormats.mockResolvedValue({
    ok: true,
    candidates: [{ ...candidate(), locales: ["en", "fr", "ko"] }],
  });
  await files();
  await click(button("Next"));

  expect(document.body.querySelector("#project-base-locale")).toBeNull();
  expect(document.body.querySelectorAll('input[name="baseLocale"]')).toHaveLength(3);
});
