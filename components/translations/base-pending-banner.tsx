import { Alert } from "@/components/ui/alert";
import { m } from "@/lib/i18n";
import { basePending } from "@/lib/onboarding/base-pending";

/**
 * 기준 로케일 변경 대기 배너 (6b-3 — design §3.13). **"먼저 보내라"만 말한다.**
 *
 * base가 실제로 바뀌는 순간은 다음 CI push이고, 그 push는 strict라 리포 값으로 번역을 덮는다
 * (ARCHITECTURE §0 불변식 2). 편집자가 손실을 줄일 수 있는 유일한 수단이 그 전에 Publish하는 것이라 배너가
 * 그것만 말한다.
 *
 * ⚠️ **검토 표시를 예고하지 않는다** — `planPush`가 base 교체 push에서 `needsReview` 전파를
 * 건너뛰므로(design §3.13) 그 일이 안 일어난다. 둘을 말하면 무엇을 해야 하는지가 흐려진다.
 *
 * ⚠️ **닫기가 없다.** 편집 손실 배너는 건수가 0이면 사라지지만 이쪽은 사용자가 할 일이 남아
 * 있는 동안 계속 참이다 — 닫히면 "보내기 전에 알려 준다"는 목적 자체가 사라진다.
 *
 * ⚠️ **조건을 여기서 다시 쓰지 않고 `basePending`을 부른다** — 설정 화면의 Alert가 같은 함수를
 * 읽는다. 두 벌이면 하나가 낡고, 그때 한 화면에서만 경고가 사라진다.
 */
export function BasePendingBanner({
  baseLocale,
  declaredBaseLocale,
}: {
  baseLocale: string | null;
  declaredBaseLocale: string | null;
}) {
  if (!basePending({ baseLocale, declaredBaseLocale }) || declaredBaseLocale === null) return null;
  return <Alert variant="warning">{m.translations.banner.basePending(declaredBaseLocale)}</Alert>;
}
