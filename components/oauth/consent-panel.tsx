"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { authorizeOAuthRequest, checkOAuthRequest, denyOAuthRequest, switchOAuthAccount, type CheckRequestResult, type ConsentActionResult } from "@/app/oauth/authorize/actions";
import { chosenProjectIds, GRANT_ORDER, initialGrantFields, TokenGrantFields, type GrantFieldsValue, type ScopeProject } from "@/components/mcp/token-grant-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EntityCard } from "@/components/ui/entity-card";
import { useLandAfter } from "@/components/ui/focus";
import { m } from "@/lib/i18n";
import type { TokenGrant } from "@/lib/mcp/grant";
import { cn } from "@/lib/utils";

import { AppCard } from "./app-card";

/**
 * `/oauth/authorize` **동의 단계**의 계정·앱·폼·행동 줄 (mcp-oauth 핸드오프 `1c`–`1j` · `1t`·`1u` · §7.1 · §8). 480 컬럼 · `<main>` 안 스크롤은 페이지가 든다. 행동 줄은 폼 끝 인라인이다
 * (고정 바 없음 — 폼을 다 지나야 Authorize에 닿는 것이 의도다: 읽고 누른다).
 *
 * ⚠️ **폼은 토큰 발급 모달의 필드 그대로다**(`TokenGrantFields`, 권한 한 열) — 동의 전용 문장은 폼 **밖** 한 문단이다(핸드오프 §7.6).
 * ⚠️ **결과를 셋으로 가른다**(design §6.1): 명시 거부는 입력을 보존한 채 행동 줄 위 danger Alert(같은 버튼이 재시도), 호출이 끊긴 것은 **결과 미확인**이라
 * 성공으로도 실패로도 말하지 않고 `Check request` 하나만 남긴다(다시 누르면 두 번째 제출이 된다). 성공은 Action의 redirect다(화면 없음).
 * ⚠️ 미확인은 이 세션에만 산다(핸드오프 §9) — 서버는 사용자가 응답을 받았는지 모른다.
 */

export type ConsentAccount = { email: string; avatarName: string; image: string | null; secondary: string | null };

export function ConsentPanel({
  requestId,
  app,
  returnTo,
  account,
  projects,
  initial,
  replacesOn,
}: {
  requestId: string;
  app: { name: string; ident: string };
  /** 검증된 콜백의 host — 행동 줄의 `You'll return to …`. */
  returnTo: string;
  account: ConsentAccount;
  /** 현재 멤버십(보관 제외). */
  projects: readonly ScopeProject[];
  /** 재동의면 기존 연결의 grant·범위(범위는 이미 멤버십 교집합) — 토큰 회전과 같은 채움. */
  initial: { grants: readonly TokenGrant[]; scope: "all" | "projects"; projectIds: readonly string[] };
  /** 같은 클라이언트의 기존 연결이 있으면 그 연결일(`utcDay`) — 대체 경고(`1d`). */
  replacesOn: string | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<GrantFieldsValue>(() => initialGrantFields(initial, projects));
  const [acting, setActing] = useState<"authorize" | "deny" | "check" | null>(null);
  const [failure, setFailure] = useState<"authorize" | "deny" | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [, startTransition] = useTransition();
  const authorizeRef = useRef<HTMLButtonElement | null>(null);
  const denyRef = useRef<HTMLButtonElement | null>(null);
  const checkRef = useRef<HTMLButtonElement | null>(null);
  const pressed = useRef<"authorize" | "deny">("authorize");
  /** `Check request`가 대기로 판정한 뒤 Authorize가 다시 마운트되면 거기로 착지한다(핸드오프 §8). */
  const landOnAuthorize = useRef(false);
  const id = useId();
  const errorId = `${id}-error`;
  const footId = `${id}-foot`;

  const chosenIds = chosenProjectIds(fields, projects);
  const emptyChoice = fields.scope === "projects" && chosenIds.length === 0;
  const busy = acting !== null;
  const locked = busy || unconfirmed;

  // 명시 거부 뒤 포커스는 누른 버튼에 남는다 — 진행 중 `disabled`가 포커스를 `body`로 떨어뜨리므로 커밋 뒤 되돌린다(토큰 모달과 같다).
  useLandAfter(acting === "authorize" || acting === "deny", () => (pressed.current === "deny" ? denyRef.current : authorizeRef.current));
  useEffect(() => {
    if (unconfirmed) checkRef.current?.focus();
    else if (landOnAuthorize.current) {
      landOnAuthorize.current = false;
      authorizeRef.current?.focus();
    }
  }, [unconfirmed]);

  function submit(kind: "authorize" | "deny") {
    if (busy || unconfirmed || (kind === "authorize" && emptyChoice)) return;
    pressed.current = kind;
    setFailure(null);
    setActing(kind);
    startTransition(async () => {
      // `undefined`는 값 없이 끝난 호출이다 — redirect가 reject 대신 resolve로 올 때다. 콜백으로 떠나는 중이니 진행 표시를 그대로 둔다.
      let result: ConsentActionResult | null | undefined;
      try {
        result =
          kind === "authorize"
            ? await authorizeOAuthRequest({
                requestId,
                expiresInDays: fields.expires,
                grants: GRANT_ORDER.filter((g) => fields.grants.has(g)),
                scope: fields.scope === "all" ? { kind: "all" } : { kind: "projects", projectIds: chosenIds },
              })
            : await denyOAuthRequest(requestId);
      } catch (thrown) {
        // ⚠️ **redirect는 되던진다** — 콜백·종료 화면·로그인 화면으로 가는 신호이고, 삼키면 "결과 미확인"이 거짓으로 선다.
        unstable_rethrow(thrown);
        // 호출이 끊기면 서버가 처리했는지 모른다 — 다시 누르게 하면 두 번째 제출이 된다(`1j`).
        result = null;
      }
      if (result === undefined) return;
      setActing(null);
      if (result === null) setUnconfirmed(true);
      else setFailure(kind);
    });
  }

  function check() {
    if (busy) return;
    setActing("check");
    startTransition(async () => {
      let result: CheckRequestResult | null | undefined;
      try {
        result = await checkOAuthRequest(requestId);
      } catch (thrown) {
        unstable_rethrow(thrown);
        result = null;
      }
      setActing(null);
      if (result?.status === "pending") {
        // 대기 — 폼으로 돌아간다. 선택은 그대로이고 Alert를 치운다(핸드오프 §8).
        landOnAuthorize.current = true;
        setUnconfirmed(false);
        return;
      }
      // 처리됨·만료 — 서버가 그 요청의 종료 화면(`1n`·`1m`)을 그린다. 조회가 또 끊기면 미확인에 머문다.
      if (result?.status === "ended") router.refresh();
      else checkRef.current?.focus();
    });
  }

  const footnote = unconfirmed ? "" : emptyChoice ? m.mcpConnector.form.chooseOne : m.oauthAuthorize.returnTo(returnTo);

  // 로고·제목·스크롤 영역은 페이지(서버)가 든다 — 정적 SVG import가 클라이언트 그래프에 들어오지 않게(`client-graph.test.ts`).
  return (
    <>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <EntityCard
          name={account.email}
          avatarName={account.avatarName}
          image={account.image}
          description={account.secondary ?? undefined}
          action={
            // 계정을 바꾸는 것은 **같은 요청**의 로그인 화면으로 가는 것이다(`1s`) — 제출 중에는 막는다(요청이 반쯤 처리된 채 계정이 바뀌지 않게).
            <form action={() => switchOAuthAccount(requestId)}>
              <Button type="submit" variant="link" disabled={locked} className="h-auto p-0 text-xs">
                {m.oauthAuthorize.notYou}
              </Button>
            </form>
          }
        />
        <AppCard name={app.name} ident={app.ident} />
      </div>

      {replacesOn !== null && (
        <Alert variant="warning" className="w-full">
          {m.oauthAuthorize.replaces(replacesOn)}
        </Alert>
      )}

      <fieldset disabled={locked} data-consent-form className={cn("flex w-full min-w-0 flex-col gap-3 pt-2", locked && "opacity-50")}>
        <div className="flex flex-col gap-6">
          <TokenGrantFields value={fields} onChange={setFields} projects={projects} disabled={locked} columns={1} />
        </div>
        <p className="text-muted-foreground text-xs leading-prose">{m.oauthAuthorize.consentNote}</p>
      </fieldset>

      <div className="flex w-full flex-col gap-3 pt-2">
        {failure !== null && (
          <div id={errorId}>
            <Alert variant="danger">{failure === "deny" ? m.oauthAuthorize.denyFailed : m.oauthAuthorize.failed}</Alert>
          </div>
        )}
        {unconfirmed && (
          <Alert variant="warning" live="status">
            {m.oauthAuthorize.unconfirmed}
          </Alert>
        )}
        <div className="flex items-center gap-3">
          <p id={footId} data-consent-status className="text-muted-foreground min-w-0 flex-1 text-xs leading-body">
            {footnote}
          </p>
          {unconfirmed ? (
            <Button ref={checkRef} variant="primary" size="lg" loading={acting === "check"} onClick={check}>
              {m.oauthAuthorize.checkRequest}
            </Button>
          ) : (
            <div className="flex shrink-0 gap-2">
              <Button
                ref={denyRef}
                size="lg"
                loading={acting === "deny"}
                disabled={acting === "authorize"}
                aria-describedby={failure === "deny" ? errorId : undefined}
                onClick={() => submit("deny")}
              >
                {m.oauthAuthorize.deny}
              </Button>
              <Button
                ref={authorizeRef}
                variant="primary"
                size="lg"
                loading={acting === "authorize"}
                disabled={acting === "deny"}
                // 선택 0은 `aria-disabled` + 상태 슬롯의 사유다 — 포커스를 받고 이유를 읽힌다(사유 없는 disabled 0건 — §6.65).
                aria-disabled={emptyChoice || undefined}
                aria-describedby={failure === "authorize" ? errorId : emptyChoice ? footId : undefined}
                onClick={() => submit("authorize")}
              >
                {m.oauthAuthorize.authorize}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
