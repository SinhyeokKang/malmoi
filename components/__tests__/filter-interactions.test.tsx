// @vitest-environment jsdom
import { act, Suspense, useState } from "react";
import { expect, it, vi } from "vitest";
import { find, render } from "./helpers/dom";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { TranslationFilters } from "@/components/translations/filters";
import { TranslationsHeader } from "@/components/translations/header";
import { m } from "@/lib/i18n";

vi.mock("@/app/(edit)/actions", () => ({ saveTranslation: vi.fn(), triggerPullAction: vi.fn() }));

it.each(["namespace", "search chip", "clear"])("%s navigation locks both toolbar and chips until the new query arrives", async (source) => {
  let complete = () => {};
  let ready = false;
  const waiting = new Promise<void>((resolve) => { complete = resolve; });
  function Pending({ active }: { active: boolean }) { if (active && !ready) throw waiting; return null; }
  function Harness() {
    const [destination, setDestination] = useState<string | null>(null);
    navigation.push.mockImplementation((href: string) => setDestination(href));
    const params = new URL(destination ?? "/?ns=a&q=hello", "http://localhost").searchParams;
    const query = { ns: params.get("ns") ?? undefined, q: params.get("q") ?? undefined };
    return <Suspense fallback={<p>Loading</p>}>
      <Pending active={destination !== null} />
      <TranslationsHeader surfaceSlug="default" surfaces={[]} slug="demo" totalCount={2} query={query} chipQuery={query}
        namespaces={[{ namespace: "a", pending: 1, total: 1 }, { namespace: "b", pending: 1, total: 1 }]}
        locales={[{ code: "en", orphaned: false }]} selected={["en"]} fallback={["en"]}
        unpublished={0} lastSentLabel={null} lastPrUrl={null} dismissKey="never" baseLocale="en" declaredBaseLocale="en">
        <p>Translations</p>
      </TranslationsHeader>
    </Suspense>;
  }
  navigation.push.mockReset();
  const { container } = await render(<Harness />);
  const select = find<HTMLButtonElement>(container, '[role="combobox"]');
  const search = find<HTMLInputElement>(container, 'input[type="search"]');
  const searchChip = find<HTMLButtonElement>(container, `button[aria-label="${m.translations.chips.remove(m.translations.chips.search("hello"))}"]`);
  const clear = find<HTMLButtonElement>(container, `button[aria-label="${m.translations.filters.clear}"]`);
  await act(async () => {
    if (source === "namespace") {
      await pickNamespace(select, "b");
    } else (source === "search chip" ? searchChip : clear).click();
  });
  expect(select.disabled).toBe(true);
  expect(search.disabled).toBe(true);
  expect(searchChip.disabled).toBe(true);
  expect(clear.disabled).toBe(true);
  await act(async () => { searchChip.click(); clear.click(); });
  expect(navigation.push).toHaveBeenCalledTimes(1);
  await act(async () => { ready = true; complete(); await waiting; });
  expect(select.disabled).toBe(false);
  expect(search.disabled).toBe(false);
  // Radix 트리거는 값을 속성이 아니라 **표시 텍스트**로 든다 — 네임스페이스 옵션은 코드로 시작한다.
  const shownNamespace = source === "namespace" ? "b" : source === "clear" ? m.translations.allNamespaces : "a";
  // 트리거 안의 첫 span은 접근 이름용 `sr-only`다 — 값은 그 다음 span(`SelectValue`)이 든다.
  const shown = select.querySelector("span:not(.sr-only)")?.textContent?.trim() ?? "";
  expect(shown.startsWith(shownNamespace)).toBe(true);
  expect(search.value).toBe(source === "namespace" ? "hello" : "");
  if (source === "namespace") {
    expect(searchChip.disabled).toBe(false);
    expect(clear.disabled).toBe(false);
    await act(async () => searchChip.click());
    expect(navigation.push).toHaveBeenLastCalledWith("/projects/demo/surfaces/default/translations?ns=b");
  }
});

it("필터 이동이 끝나기 전에는 다음 필터가 이전 URL 상태로 제출되지 않는다", async () => {
  let complete = () => {};
  const waiting = new Promise<void>((resolve) => { complete = resolve; });
  let ready = false;
  function Pending({ active }: { active: boolean }) { if (active && !ready) throw waiting; return null; }
  function Harness() {
    const [active, setActive] = useState(false);
    navigation.push.mockImplementation(() => { setActive(true); });
    return <Suspense fallback={<p>Loading</p>}>
      <Pending active={active} />
      <TranslationFilters surfaceSlug="default" surfaces={[]} slug="demo" query={{ ns: "a" }} chipQuery={{}} namespaces={[{ namespace: "a", pending: 1, total: 1 }, { namespace: "b", pending: 1, total: 1 }]} locales={[{ code: "en", orphaned: false }]} selected={["en"]} fallback={["en"]} />
    </Suspense>;
  }
  navigation.push.mockClear();
  const { container } = await render(<Harness />);
  const select = find<HTMLButtonElement>(container, '[role="combobox"]');
  await act(async () => { await pickNamespace(select, "b"); });
  expect(select.disabled).toBe(true);
  expect(find<HTMLButtonElement>(container, 'button:not([role="combobox"])').disabled).toBe(true);
  expect(find<HTMLInputElement>(container, "input").disabled).toBe(true);
  await act(async () => { ready = true; complete(); await waiting; });
  expect(find<HTMLButtonElement>(container, '[role="combobox"]').disabled).toBe(false);
});

import { ProjectSearch } from "@/components/projects/search-input";
import userEvent from "@testing-library/user-event";

import { input, key } from "./helpers/dom";

/**
 * ⚠️ **Radix Select는 값을 대입해 못 바꾼다** (2026-09-13 리워크) — 트리거를 열고 옵션을 누른다.
 */
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
async function pickNamespace(trigger: HTMLElement, namespace: string) {
  await user.click(trigger);
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim().startsWith(namespace));
  if (!option) throw new Error(`Missing option: ${namespace}`);
  await user.click(option);
}

for (const name of ["projects", "translations"] as const) {
  it(`${name} 검색은 조합 확정 Enter를 무시하고 일반 Enter만 제출한다`, async () => {
    navigation.push.mockReset();
    const ui = name === "projects" ? <ProjectSearch q="" /> :
      <TranslationFilters surfaceSlug="default" surfaces={[]} slug="demo" query={{ ns: "a" }} chipQuery={{}} namespaces={[]} locales={[]} selected={[]} fallback={[]} />;
    const { container } = await render(ui);
    const search = find<HTMLInputElement>(container, 'input[type="search"]');
    await input(search, "한글");
    await key(search, "Enter", { isComposing: true });
    expect(navigation.push).not.toHaveBeenCalled();
    await key(search, "Enter", { keyCode: 229 });
    expect(navigation.push).not.toHaveBeenCalled();
    await key(search, "Enter");
    expect(navigation.push).toHaveBeenCalledTimes(1);
    const href = navigation.push.mock.calls[0]?.[0] as string;
    expect(new URL(href, "http://localhost").searchParams.get("q")).toBe("한글");
  });
}
