import type { Prisma } from "@/generated/prisma/client";

/**
 * **방침이 이름을 대는 것과 DB가 실제로 담는 것을 묶는 등재부.** 로직이 0인 데이터 파일이고,
 * 게이트는 `pnpm typecheck`이 든다 — 모델이 하나 늘거나 개인정보 모델에 컬럼이 하나 붙으면
 * 아래 두 상수 중 하나가 **이름을 지목하며** red가 된다.
 *
 * ⚠️ **금지 패턴을 찾는 검사가 아니라 있어야 할 것을 세는 검사다** (POSTMORTEM 2026-09-03 🔁 재발) —
 * 전자는 본문이 바뀌면 조용히 거짓이 된다.
 *
 * ⚠️ **`import "server-only"`를 붙이지 않는다** — 테스트가 직접 import하는 순수 모듈이다. `import type`
 * 하나뿐이라 런타임 의존도 0이고, 그래서 `db:generate` 없이도 테스트가 돈다(타입만 필요하다).
 *
 * ⚠️ **정규식 스키마 파서를 만들지 않는다** — 리포의 세 번째 파서가 된다
 * (`prisma/__tests__/schema-contract.test.ts`에 이미 있다). Prisma가 생성한 `*ScalarFieldEnum`이
 * 관계 필드가 빠진 스칼라 유니온을 주므로 mapped type으로 전수를 강제한다.
 */

/**
 * 수집 항목을 **이름으로 말하는** 절만 든다. 절 일곱 중 `purposes`·`deletion`·`changes`는 항목을
 * 열거하지 않으므로 여기 없다 — 전체를 대조하면 그 셋이 무조건 "안 쓰인 절"로 잡힌다.
 */
export const DISCLOSURE_SECTIONS = ["collected", "third-parties", "retention", "cookies"] as const;
export type DisclosureSection = (typeof DISCLOSURE_SECTIONS)[number];

/** 사람을 기술하지 않는 값. 번역 작업 데이터와 행 부기가 여기 들어온다. */
export const NOT_PERSONAL = "not-personal";

type Classification = DisclosureSection | typeof NOT_PERSONAL;

/**
 * **모델 전수.** 손으로 든 허용목록이면 새 모델(`schema.prisma`가 §10으로 미뤄둔 `AuditEvent` 같은)이
 * 개인정보를 담아도 게이트가 침묵한다 — 그것이 bugshot이 웹스토어 심사에서 탈락한 경로와 같은 형이다.
 */
export const MODEL_CLASSES = {
  /** 리포 좌표와 기계 자격증명뿐이다 — 생성자 컬럼이 없고 소유는 `ProjectMember`로만 표현된다. */
  Project: "not-personal",
  TranslationSurface: "not-personal",
  Locale: "not-personal",
  StringKey: "not-personal",
  KeyRef: "not-personal",
  /** `updatedBy` 하나 때문에 personal이다 — 나머지 11은 번역 값과 그 좌표다. */
  Translation: "personal",
  SyncRun: "personal",
  User: "personal",
  Account: "personal",
  Session: "personal",
  /**
   * ⚠️ **`identifier`가 `String`이라 "개인정보 아님"으로 보이기 쉽다** — 실제 값은
   * `JSON.stringify([purpose, "v1", userId, provider, providerAccountId, …])`라 userId와 외부 계정
   * 식별자가 한 문자열 안에 있다 (`lib/login-link/policy.ts`·`lib/session-revocation/store.ts`).
   */
  VerificationToken: "personal",
  ProjectMember: "personal",
  ProjectInvitation: "personal",
} as const satisfies Record<Prisma.ModelName, "personal" | "not-personal">;

type PersonalModel = {
  [M in Prisma.ModelName]: (typeof MODEL_CLASSES)[M] extends "personal" ? M : never;
}[Prisma.ModelName];

/**
 * ⚠️ **`` `${M}ScalarFieldEnum` `` 으로 인덱싱할 수 없어 모델별로 명시한다** — `Prisma`는 네임스페이스라
 * 타입 인덱스 접근의 대상이 아니다. `extends Record<PersonalModel, string>`이 전수를 든다: 모델 하나가
 * `personal`로 바뀌면 여기에 줄이 없어 red다.
 */
interface ScalarFieldsOf extends Record<PersonalModel, string> {
  Translation: Prisma.TranslationScalarFieldEnum;
  SyncRun: Prisma.SyncRunScalarFieldEnum;
  User: Prisma.UserScalarFieldEnum;
  Account: Prisma.AccountScalarFieldEnum;
  Session: Prisma.SessionScalarFieldEnum;
  VerificationToken: Prisma.VerificationTokenScalarFieldEnum;
  ProjectMember: Prisma.ProjectMemberScalarFieldEnum;
  ProjectInvitation: Prisma.ProjectInvitationScalarFieldEnum;
}

type FieldPath = { [M in PersonalModel]: `${M}.${ScalarFieldsOf[M]}` }[PersonalModel];

/**
 * **개인정보 모델의 스칼라 전수 → 방침의 어느 절이 말하는가.** 빠뜨리면 "없는 키", 오타를 내면
 * "있을 수 없는 키"로 각각 red다.
 *
 * 절 배정 규칙: `collected`는 수집 항목 표가 이름을 대는 값 · `third-parties`는 GitHub·Google 때문에만
 * 존재하는 값 · `cookies`는 쿠키가 나르는 값 · `retention`은 보관 기간을 정하는 값이다.
 *
 * ⚠️ **입도가 방침의 표와 일부러 다르다** — 여기는 필드별 1:1이고 표는 여럿을 한 행으로 접는다.
 * 읽는 사람은 `Account.refresh_token`이 아니라 "GitHub·Google 연결"을 이해한다. 그래서 (B) 검사의
 * **대조 단위는 절 id이지 항목 라벨이 아니다.**
 */
export const CLASSIFIED: Record<FieldPath, Classification> = {
  "User.id": "collected",
  "User.name": "collected",
  "User.email": "collected",
  /** 초대 주소를 대조하는 HMAC 색인 — 원문에서 파생되므로 같이 밝힌다. */
  "User.emailLookup": "collected",
  "User.emailVerified": "collected",
  "User.image": "collected",
  "User.createdAt": "collected",

  "Account.userId": "collected",
  "Account.installRequestedAt": "collected",
  "Account.type": "third-parties",
  "Account.provider": "third-parties",
  "Account.providerAccountId": "third-parties",
  "Account.refresh_token": "third-parties",
  "Account.access_token": "third-parties",
  "Account.expires_at": "third-parties",
  "Account.token_type": "third-parties",
  "Account.scope": "third-parties",
  "Account.id_token": "third-parties",
  "Account.session_state": "third-parties",

  "Session.sessionToken": "cookies",
  "Session.userId": "cookies",
  "Session.expires": "retention",

  "VerificationToken.identifier": "collected",
  "VerificationToken.token": "collected",
  "VerificationToken.expires": "retention",

  "ProjectMember.projectId": NOT_PERSONAL,
  "ProjectMember.userId": "collected",
  "ProjectMember.role": "collected",
  "ProjectMember.createdAt": "collected",
  "ProjectMember.updatedAt": "collected",

  "ProjectInvitation.id": NOT_PERSONAL,
  "ProjectInvitation.projectId": NOT_PERSONAL,
  "ProjectInvitation.createdAt": NOT_PERSONAL,
  "ProjectInvitation.email": "collected",
  "ProjectInvitation.emailLookup": "collected",
  "ProjectInvitation.role": "collected",
  "ProjectInvitation.tokenHash": "collected",
  "ProjectInvitation.acceptedAt": "collected",
  "ProjectInvitation.invitedBy": "collected",
  "ProjectInvitation.expiresAt": "retention",

  /** 번역 값 자체는 프로젝트의 산출물이고 사람을 기술하지 않는다 — 저자 컬럼 하나만 갈린다. */
  "Translation.id": NOT_PERSONAL,
  "Translation.projectId": NOT_PERSONAL,
  "Translation.surfaceId": NOT_PERSONAL,
  "Translation.keyId": NOT_PERSONAL,
  "Translation.localeCode": NOT_PERSONAL,
  "Translation.value": NOT_PERSONAL,
  "Translation.description": NOT_PERSONAL,
  "Translation.placeholders": NOT_PERSONAL,
  "Translation.needsReview": NOT_PERSONAL,
  "Translation.pendingEditToken": NOT_PERSONAL,
  "Translation.updatedAt": NOT_PERSONAL,
  "Translation.updatedBy": "collected",

  "SyncRun.id": NOT_PERSONAL,
  "SyncRun.projectId": NOT_PERSONAL,
  "SyncRun.status": NOT_PERSONAL,
  "SyncRun.trigger": NOT_PERSONAL,
  "SyncRun.startedAt": NOT_PERSONAL,
  "SyncRun.finishedAt": NOT_PERSONAL,
  "SyncRun.errorCode": NOT_PERSONAL,
  "SyncRun.prUrl": NOT_PERSONAL,
  "SyncRun.changed": NOT_PERSONAL,
  "SyncRun.warnings": NOT_PERSONAL,
  "SyncRun.requestedBy": "collected",
};
