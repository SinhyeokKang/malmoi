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
      <TranslationsHeader slug="demo" totalCount={2} query={query} chipQuery={query}
        namespaces={[{ namespace: "a", pending: 1, total: 1 }, { namespace: "b", pending: 1, total: 1 }]}
        locales={[{ code: "en", orphaned: false }]} selected={["en"]} fallback={["en"]}
        unpublished={0} lastSentLabel={null} lastPrUrl={null} dismissKey="never" baseLocale="en" declaredBaseLocale="en">
        <p>Translations</p>
      </TranslationsHeader>
    </Suspense>;
  }
  navigation.push.mockReset();
  const { container } = await render(<Harness />);
  const select = find<HTMLSelectElement>(container, "select");
  const search = find<HTMLInputElement>(container, 'input[type="search"]');
  const searchChip = find<HTMLButtonElement>(container, `button[aria-label="${m.translations.chips.remove(m.translations.chips.search("hello"))}"]`);
  const clear = find<HTMLButtonElement>(container, `button[aria-label="${m.translations.filters.clear}"]`);
  await act(async () => {
    if (source === "namespace") {
      select.value = "b";
      select.dispatchEvent(new Event("change", { bubbles: true }));
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
  expect(select.value).toBe(source === "namespace" ? "b" : source === "clear" ? "*" : "a");
  expect(search.value).toBe(source === "namespace" ? "hello" : "");
  if (source === "namespace") {
    expect(searchChip.disabled).toBe(false);
    expect(clear.disabled).toBe(false);
    await act(async () => searchChip.click());
    expect(navigation.push).toHaveBeenLastCalledWith("/projects/demo/translations?ns=b");
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
      <TranslationFilters slug="demo" query={{ ns: "a" }} chipQuery={{}} namespaces={[{ namespace: "a", pending: 1, total: 1 }, { namespace: "b", pending: 1, total: 1 }]} locales={[{ code: "en", orphaned: false }]} selected={["en"]} fallback={["en"]} />
    </Suspense>;
  }
  navigation.push.mockClear();
  const { container } = await render(<Harness />);
  const select = find<HTMLSelectElement>(container, "select");
  await act(async () => { select.value = "b"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select.disabled).toBe(true);
  expect(find<HTMLButtonElement>(container, "button").disabled).toBe(true);
  expect(find<HTMLInputElement>(container, "input").disabled).toBe(true);
  await act(async () => { ready = true; complete(); await waiting; });
  expect(find<HTMLSelectElement>(container, "select").disabled).toBe(false);
});

import { ProjectSearch } from "@/components/projects/search-input";
import { input, key } from "./helpers/dom";

for (const name of ["projects", "translations"] as const) {
  it(`${name} 검색은 조합 확정 Enter를 무시하고 일반 Enter만 제출한다`, async () => {
    navigation.push.mockReset();
    const ui = name === "projects" ? <ProjectSearch filter="active" q="" /> :
      <TranslationFilters slug="demo" query={{ ns: "a" }} chipQuery={{}} namespaces={[]} locales={[]} selected={[]} fallback={[]} />;
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
