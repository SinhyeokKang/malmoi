"use client";

import { ExternalLink, Send } from "lucide-react";
import { useTransition } from "react";

import { triggerPullAction } from "@/app/(edit)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { pullMessage, type PullOutcome } from "@/lib/pull/message";

/**
 * Publish — 편집한 값을 리포로 되돌려보낸다 (design §3.4).
 *
 * **토스트를 쓰지 않는다.** 저장 상태가 셀 인라인이므로 이 화면의 토스트는 0개인 것이 규칙이다 —
 * 피드백 방식이 둘로 갈리면 사용자가 어디를 봐야 할지 모른다.
 *
 * **no-op에도 반드시 뭔가 보인다.** 편집이 없는 날이 기본 경로라(MVP §3.3 1.5) 성공 직후 한 번 더
 * 누르면 반드시 그 경로이고, 무반응이면 편집자가 고장으로 읽는다.
 *
 * ⚠️ **버튼과 결과가 갈라져 있다.** 결과 `Alert`는 툴바 아래 고정 자리(배너 밑)이고 버튼은 툴바
 * 오른쪽이다 — 두 자리를 한 컴포넌트가 그릴 수 없으므로 **상태는 헤더가 든다**. 헤더는 페이지의
 * 무조건 렌더 자리에 있어 `router.refresh()`가 그 컴포넌트를 언마운트하지 않는다
 * (POSTMORTEM 2026-09-07 — 성공이 자기 표시기를 지우는 구조였다).
 */
export function PublishButton({
  slug,
  count,
  onResult,
}: {
  slug: string;
  /** 미배포 건수 — 라벨이 든다. 0이면 숫자가 붙지 않는다. */
  count: number;
  onResult: (outcome: PullOutcome) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="primary"
      onClick={() =>
        startTransition(async () => {
          onResult(await triggerPullAction(slug));
        })
      }
      // pending 중 연타를 막는다 — 두 실행이 병렬이면 둘 다 열린 PR을 못 보고
      // 각자 생성을 시도해 GitHub이 422로 거부한다.
      loading={pending}
    >
      <Send aria-hidden />
      {m.translations.publish.button(count)}
    </Button>
  );
}

/**
 * 결과 다섯 → `Alert` 넷 (design §3.4).
 *
 * ⚠️ **tone을 variant로 그대로 넘긴다.** `PublishTone`과 `Alert`의 variant가 같은 네 이름인 것이
 * `lib/pull/message.ts`의 결정이고, 여기서 매핑 표를 또 들면 두 벌이 갈린다.
 *
 * ⚠️ **`outcome`을 상태로 든다** — `PullMessage`만 들면 `warnings`가 사라져 "어느 파일인지"를
 * 못 편다. 건수만 말하는 경고는 비개발자가 행동할 수 없다 (SAAS 불변식 9).
 */
export function PublishResult({ outcome }: { outcome: PullOutcome }) {
  const message = pullMessage(outcome);
  const warnings = outcome.status === "failed" ? [] : (outcome.warnings ?? []);

  return (
    <Alert
      variant={message.tone}
      actions={
        message.href === undefined ? undefined : (
          <a
            href={message.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-baseline gap-1 text-blue-600"
          >
            {message.linkLabel}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )
      }
    >
      <p>{message.text}</p>
      {warnings.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs">{m.translations.publish.dropped}</summary>
          {/* ⚠️ **여기 오는 문자열은 서버가 합친 것이다** — `lib/pull/run.ts`가 `경로: 문장`으로 만들고
              문장은 사전(`m.adapterErrors`)에서 온다 (6b-1). 뒤에 붙는 파서 원문이 **여러 줄일 수 있어**
              `whitespace-pre-wrap`이 필요하다: YAML 파서가 캐럿 다이어그램을 넣는데 기본 `white-space`가
              그 개행을 공백으로 접어 캐럿이 가리킬 열을 잃는다 */}
          <ul className="mt-1 space-y-0.5">
            {warnings.map((warning, index) => (
              <li key={`${index} ${warning}`} className="text-xs whitespace-pre-wrap">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Alert>
  );
}
