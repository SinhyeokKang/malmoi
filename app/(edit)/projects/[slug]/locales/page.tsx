import { Globe } from "lucide-react";
import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { BaseLocaleForm } from "@/components/locales/base-locale-form";
import { CopyButton } from "@/components/onboarding/copy-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { canPerform } from "@/lib/auth/permission";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { loadLocaleCounts } from "@/lib/keys/query";
import { localeProgress } from "@/lib/keys/view";
import { basePending } from "@/lib/onboarding/base-pending";
import { baseLocaleLine } from "@/lib/onboarding/workflow";
import { routes } from "@/lib/routes";

/**
 * 로케일 목록 + 기준 언어 (6b-5 — SAAS §7.7 결정 4).
 *
 * ⚠️ **이 화면이 생긴 이유는 orphaned 로케일이다.** 지금까지 로케일은 **번역 표의 열로만** 존재해서,
 * 파일이 사라진 로케일이 왜 그렇게 됐고 어떻게 되살리는지 말할 자리가 어디에도 없었다 —
 * ARCHITECTURE §5.5.16이 그 상태를 정의해 놓고 화면이 없었다.
 *
 * ⚠️ **게이트가 `translation:write`다, `project:settings`가 아니다.** EDITOR도 목록을 본다 — "왜 열이
 * 사라졌나"는 번역자에게 필요한 정보이고, 설정 뒤에 두면 그 사람이 아예 못 들어온다. **컨트롤(기준
 * 언어 폼 · 대기 Alert)만 역할로 갈리고 판정은 Action**이 `project:settings`로 한다 (6b-2 관용구).
 *
 * ⚠️ **최상단에서 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과 페이지를 병렬로
 * 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB).
 *
 * ⚠️ **`?e=` 슬롯이 없다** — 보내는 자리가 0이다. `requireProjectAccess`의 거부는 `/projects?e=`로
 * 가고 저장 실패는 폼 안의 Alert다. 읽는 쪽만 두면 도달 불가 코드이고, 그것을 두지 않는 것이 이
 * 리포의 규칙이다 (멤버 화면과 같은 판단).
 */
export default async function LocalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId, role, archived } = await requireProjectAccess({ slug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;

  const prisma = getPrisma();
  const [project, counts] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        baseLocale: true,
        // 대기 Alert와 폼 필드가 읽는다 — pull은 이 컬럼을 모른다 (design §3.13).
        declaredBaseLocale: true,
        // ⚠️ **살아 있는 것만 보지 않는다** — orphaned 행을 **보여주는 것**이 이 화면의 요지다.
        locales: { select: { code: true, isBase: true, orphaned: true } },
      },
    }),
    loadLocaleCounts(prisma, projectId),
  ]);
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  const rows = localeProgress({ locales: project.locales, total: counts.total, cells: counts.cells });
  // 셀렉트에는 살아 있는 것만 — 감추는 것은 편의이고 방어는 Action이다.
  const selectable = rows.filter((r) => !r.orphaned).map((r) => r.code);
  const canManage = canPerform(role, "project:settings");
  const pendingLine =
    canManage && project.declaredBaseLocale !== null && basePending(project)
      ? baseLocaleLine(project.declaredBaseLocale)
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
      {/* breadcrumb은 셸이 안 든다 — 레이아웃이 페이지 props를 못 받는다 (CLAUDE.md). */}
      <div className="space-y-3">
        <Breadcrumb
          items={[{ label: project.name, href: routes.project(slug) }, { label: m.locales.title }]}
        />
        <h1 className="text-base font-medium">{m.locales.title}</h1>
        {/* 설명은 제목 아래 한 줄이다 — 표 Card에 제목을 또 달면 같은 낱말이 연달아 나온다. */}
        <p className="text-muted-foreground text-xs">{m.locales.description}</p>
      </div>

      {/*
        ⚠️ **표는 Card 밖이다** (멤버 화면과 같은 관용구). Card 본문의 `p-4`와 셀의 `px-4`가 겹쳐
        표만 16px 더 들여쓰였다 — 실측으로 확인했다. 행 구분은 `Td`의 `border-t`가 든다.
      */}
      {rows.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={m.locales.empty.title}
            description={m.locales.empty.description}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{m.locales.columns.code}</Th>
                <Th>{m.locales.columns.progress}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.code}>
                  <Td>
                    <span className="flex flex-wrap items-baseline gap-2">
                      {/* 로케일 코드는 파일명 그대로가 진실이라 식별자다 — mono (DESIGN §4.1) */}
                      <span className="text-mono">{row.code}</span>
                      {row.isBase && <Badge>{m.locales.base}</Badge>}
                      {/* orphaned는 "삭제됨"이 아니라 되돌릴 수 있는 상태다 — 배경 없는 danger (§6.2) */}
                      {row.orphaned && <Badge variant="danger">{m.locales.orphaned.badge}</Badge>}
                    </span>
                    {/*
                      ⚠️ **사유와 되살리는 방법을 둘 다 말한다.** 배지만 달면 "왜"와 "어떻게"가 없고,
                      그 둘이 이 화면이 존재하는 이유다 (ARCHITECTURE §5.5.16).
                    */}
                    {row.orphaned && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {m.locales.orphaned.reason(row.code)} {m.locales.orphaned.restore}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <span className="text-sm">
                      {m.locales.progress(row.percent, row.translated, row.total)}
                    </span>
                    {/* 검토 필요는 번역된 것이 아니다 — 따로 보인다 (`localeProgress`) */}
                    {row.needsReview > 0 && (
                      <p className="mt-1">
                        <Badge variant="warning">{m.locales.needsReview(row.needsReview)}</Badge>
                      </p>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

      {/*
        ⚠️ **Card에 제목·설명을 달지 않는다** — `FormGroup`이 이미 라벨과 help를 들고, 둘을 다 두면
        같은 문장이 화면에 두 번 나온다(실물로 확인했다). Card는 경계선만 든다.
      */}
      {canManage && (
        <Card>
          <BaseLocaleForm
            slug={slug}
            baseLocale={project.baseLocale}
            declaredBaseLocale={project.declaredBaseLocale}
            locales={selectable}
          />
          {/*
            ⚠️ **고칠 줄을 이 화면에서 직접 보인다** (§7.7 결정 4의 경계). 설정 화면으로 링크하면
            "고치려면 두 화면을 오간다"가 되고, 자리를 합친 이유가 사라진다. 워크플로 YAML 전체는
            설정에 남는다 — 여기 필요한 것은 한 줄이다.
          */}
          {pendingLine !== null && (
            <Alert variant="warning" title={m.locales.pending.title}>
              <p>{m.locales.pending.body(<span className="text-mono">.github/workflows/l10n.yml</span>)}</p>
              {/* ⚠️ 여러 줄일 수 있는 코드는 값 칩이 아니라 `<pre>`다 (DESIGN §6.4). */}
              <pre className="text-mono bg-muted mt-2 overflow-x-auto rounded-md p-3">{pendingLine}</pre>
              <p className="mt-2">
                <CopyButton value={pendingLine} label={m.locales.pending.copy} />
              </p>
            </Alert>
          )}
        </Card>
      )}
    </main>
  );
}
