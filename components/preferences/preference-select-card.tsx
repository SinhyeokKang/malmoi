"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { useLandAfter } from "@/components/ui/focus";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * 닫힌 트리거가 받는 키 — **화이트리스트다**(ui-locales design §5.2). 여는 키(Enter·Space·위아래)와 Tab만 통과한다.
 * ⚠️ Radix의 typeahead 판정(`key.length === 1` 등)을 복제하지 않는다 — 라이브러리 내부 규칙이라 버전이 올라가면 조용히 어긋나고
 * (`member-list.tsx`의 같은 경고), 즉시 적용이라 새는 키 하나가 앱 전체 설정을 바꾼다. 수정자 조합(Cmd+R 등)은 브라우저 단축키라 통과시킨다.
 */
const CLOSED_TRIGGER_KEYS: ReadonlySet<string> = new Set(["Enter", " ", "ArrowUp", "ArrowDown", "Tab"]);

function passesClosedTrigger(event: KeyboardEvent): boolean {
  return CLOSED_TRIGGER_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey;
}

/** Action이 돌려주는 코드 — `ok` 밖은 전부 실패로 그린다. */
type ApplyResult = "ok" | "invalid" | "failed";

/**
 * `/preferences`의 **즉시 적용 Select 카드** — Language·Time zone·Theme 세 카드가 같은 조립을 쓴다(user-timezone design §6 — 두 번째 소비자가 생겨 뽑았다).
 *
 * ⚠️ **고르는 즉시 적용한다(저장 버튼 없음)** — 그래서 닫힌 트리거의 typeahead를 막는다. Tab으로 지나가다 글자 하나를 치면 앱 전체가
 * 바뀐다(POSTMORTEM 2026-09-19의 두 번째 경로). 닫힌 트리거는 Enter·Space·위아래 방향키·Tab(과 수정자 조합)만 받는다.
 * ⚠️ **진행 중은 Root `disabled`가 아니라 `RoleSelect` 가드다**(`components/members/member-list.tsx`) — 꺼지면 포커스가 `body`로 빠진다.
 * 트리거는 고른 값을 먼저 보이고(낙관적), 실패하면 원래 값으로 돌아가며 카드 `notice`에 Alert가 선다. 같은 값이면 요청하지 않는다.
 * 옵션의 `textValue`는 **열린 목록**의 글자 이동이 보는 글자다(없으면 라벨) — 닫힌 트리거 차단과 별개다.
 * `after`는 도움말 아래 줄 — 낙관 값(`shown`)을 받아 같이 움직이고 실패면 같이 돌아간다(Time zone 미리보기).
 * ⚠️ 라벨 열이 없다 — 카드 제목이 이름이라 `aria-labelledby`로 그 제목을, 설명은 `aria-describedby`로 도움말을 가리킨다.
 */
export function PreferenceSelectCard<T extends string>({
  title,
  description,
  help,
  failed: failedText,
  current,
  items,
  parse,
  apply,
  after,
}: {
  title: string;
  description: string;
  help: string;
  failed: string;
  current: T;
  items: readonly { value: T; label: ReactNode; textValue?: string }[];
  parse: (raw: string) => T | null;
  apply: (value: T) => Promise<ApplyResult>;
  after?: (shown: T) => ReactNode;
}) {
  const [chosen, setChosen] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  useLandAfter(pending, () => trigger.current);
  const titleId = useId();
  const helpId = useId();
  const shown = chosen ?? current;

  function choose(raw: string) {
    const next = parse(raw);
    if (next === null || pending || next === shown) return;
    setChosen(next);
    setFailed(false);
    startTransition(async () => {
      // ⚠️ 던져도 낙관 값을 되돌리고 카드 Alert로 말한다 — try가 없으면 transition 예외가 error boundary로 간다(R10 🔴1 · audit #24).
      let result: ApplyResult | null;
      try { result = await apply(next); } catch { result = null; }
      // await 뒤의 갱신도 전환에 싣는다 — 바로 반영하면 새 값의 트리가 오기 전에 트리거가 옛 값으로 한 번 깜빡인다.
      startTransition(() => {
        setChosen(null);
        setFailed(result !== "ok");
      });
    });
  }

  return (
    <Card
      title={title}
      titleId={titleId}
      description={description}
      notice={failed ? <Alert inset variant="danger">{failedText}</Alert> : undefined}
    >
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <Select value={shown} onValueChange={choose}>
          <SelectTrigger
            ref={trigger}
            width={320}
            aria-labelledby={titleId}
            aria-describedby={helpId}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onPointerDown={pending ? (event) => event.preventDefault() : undefined}
            onClick={pending ? (event) => event.preventDefault() : undefined}
            onKeyDown={(event) => {
              // 잠긴 동안은 Tab만 통과시킨다 — 포커스는 남되 나머지는 전부 이 컨트롤의 동작이다(`RoleSelect`와 같다).
              if (pending ? event.key !== "Tab" : !passesClosedTrigger(event)) event.preventDefault();
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value} textValue={item.textValue}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={helpId} className="text-muted-foreground text-xs">{help}</p>
        {after?.(shown)}
      </div>
    </Card>
  );
}
