import { observeLocaleFiles, type LocaleObservation } from "@/lib/pull/locales";

/**
 * **base 트리에서 본 소스의 로케일** (locale-add design §1 "존재 판정은 같은 함수"). 같은 SHA라 적재를 건너뛰는 야간 방문과 야간 적재의 만료가 넘기는
 * 관측이다. 판정은 Publish 스냅샷 전 만료와 **같은 함수**(`observeLocaleFiles`)다(R-B2 Y4) — 여기는 저장된 소스 행을 그 입력으로 넘기는 이름일 뿐이다.
 * 트리 항목은 mode를 들어야 한다(리더 스냅샷·`GitClient.getTree` 둘 다 싣는다) — 모르면 관측할 수 없다.
 */
export function observeSurfaceLocales(
  tree: readonly { path: string; mode?: string }[],
  surface: { adapterName: string | null; pathTemplate: string | null },
): LocaleObservation {
  return observeLocaleFiles(tree, surface);
}
