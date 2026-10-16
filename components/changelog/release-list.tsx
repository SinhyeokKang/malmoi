"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { nextVisible, visibleToInclude } from "@/lib/changelog/reveal";
import { landDocumentHeading } from "@/lib/public-doc/landing";

/** 목록 밖의 `RevealItem`은 숨기지 않는다. */
const VisibleContext = createContext(Number.POSITIVE_INFINITY);

/** 렌더 뒤에 할 일 — 대상이 `hidden`을 벗은 뒤라야 브라우저가 스크롤·포커스를 받는다. */
type Pending = { kind: "focus"; index: number } | { kind: "land"; id: string };

/** 해시의 태그. ⚠️ 깨진 퍼센트 인코딩(`#%E0`)은 `decodeURIComponent`가 던진다 — `PublicScroller`의 `hashTarget`과 같은 규칙이다. */
function hashId(hash: string): string | null {
  if (hash.length <= 1) return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
}

/**
 * `/changelog`의 10개 단위 드러내기 (changelog-pagination design §4). 서버가 전 항목을 렌더해 `RevealItem`으로 감싸 넘기고, 여기는 숨김만 푼다 —
 * 추가 요청이 없고, 본문(`react-markdown`)은 서버 컴포넌트로 남아 이 번들에 오지 않는다.
 *
 * ⚠️ **스크롤로 드러나지 않는다** — 버튼만이다(2026-10-16 사용자 — 자동 드러내기는 계속 내리는 사람에게 스크롤 길이를 줄이지 못한다).
 * 누르면 새로 드러난 첫 버전 `h1`로 포커스를 옮긴다. 마지막 묶음이면 버튼이 사라지므로 이 이동이 포커스가 body로 빠지는 것을 막는다.
 *
 * ⚠️ **끝 문장(`trailing`)은 다 드러난 뒤에만 버튼 자리에 선다** — 숨은 판이 남은 동안 "옛 판은 GitHub에 있다"가 버튼과 엇갈리는 말을 한다.
 *
 * ⚠️ **진입 해시는 마운트 때 한 번만 본다**(`hashchange`는 듣지 않는다 — `PublicScroller`와 같다). 숨은 판이면 그 묶음까지 펴고 렌더 뒤
 * `landDocumentHeading`으로 착지·포커스한다. 브라우저의 기본 해시 스크롤도 `PublicScroller`의 포커스도 `hidden` 요소에는 닿지 않기 때문이다.
 * 이미 보이는 판은 `PublicScroller`가 지금처럼 처리하므로 여기서는 아무것도 하지 않는다.
 * ⚠️ **jsdom은 이 차이를 못 본다** — 숨은 요소에도 포커스를 준다. 테스트는 브라우저 흉내 스텁을 쓴다(`release-list.test.tsx`).
 */
export function ReleaseList({ total, showOlder, trailing, children }: { total: number; showOlder: string; trailing: ReactNode; children: ReactNode }) {
  // 초기값에 해시를 쓰지 않는다 — 서버 렌더와 첫 클라이언트 렌더가 같아야 한다.
  const [visible, setVisible] = useState(() => nextVisible(0, total));
  const pending = useRef<Pending | null>(null);

  // ⚠️ **대상이 아직 `hidden` 안이면 할 일을 남겨 두고 다음 렌더를 기다린다** — 숨은 대상에는 브라우저가 스크롤·포커스를 주지 않는다.
  // 진입 해시 effect가 같은 플러시에서 착지를 심을 때(마운트, 그리고 `next dev` StrictMode의 effect 재실행)가 그 경우다.
  useEffect(() => {
    const task = pending.current;
    if (!task) return;
    const target = task.kind === "land" ? document.getElementById(task.id) : document.querySelector<HTMLElement>(`[data-reveal-index="${task.index}"] [id][tabindex="-1"]`);
    if (target?.closest("[hidden]")) return;
    pending.current = null;
    if (task.kind === "land") landDocumentHeading(task.id);
    else target?.focus();
  }, [visible]);

  useEffect(() => {
    const id = hashId(window.location.hash);
    const item = id === null ? null : document.getElementById(id)?.closest<HTMLElement>("[data-reveal-index]");
    if (!id || !item) return;
    const next = visibleToInclude(Number(item.dataset.revealIndex), visible, total);
    if (next === visible) return;
    pending.current = { kind: "land", id };
    setVisible(next);
    // 진입 때 한 번만이다 — `visible`·`total`은 첫 렌더의 값으로 읽는다.
  }, []);

  const showMore = () => {
    pending.current = { kind: "focus", index: visible };
    setVisible(nextVisible(visible, total));
  };

  return (
    <VisibleContext value={visible}>
      {children}
      {visible < total ? (
        <div className="flex justify-center pb-12">
          <Button type="button" variant="ghost" size="md" onClick={showMore}>
            {showOlder}
          </Button>
        </div>
      ) : (
        trailing
      )}
    </VisibleContext>
  );
}

/**
 * 항목 하나의 숨김 그릇. 순서의 출처는 `index` 하나다 — `ReleaseList`가 `Children`을 조작하지 않는다.
 * 이름 없는 `div`라 랜드마크가 아니다(POSTMORTEM 2026-09-15) — 이름은 안쪽 `section`의 `aria-labelledby`가 든다.
 */
export function RevealItem({ index, children }: { index: number; children: ReactNode }) {
  const visible = useContext(VisibleContext);
  return (
    <div data-reveal-index={index} hidden={index >= visible}>
      {children}
    </div>
  );
}
