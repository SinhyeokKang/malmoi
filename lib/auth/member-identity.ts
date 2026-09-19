import { m } from "@/lib/i18n";

/**
 * 멤버 행·대기 초대 행의 **두 줄 배치**와 아바타 씨앗 (DESIGN §6.65).
 *
 * ⚠️ **두 카드가 같은 함수를 지난다.** 배치를 각자 조립하면 같은 사람이 두 카드에서 다르게 보이고,
 * 이름이 없는 갈래가 한쪽에만 생긴다. `PendingInvitation`에는 `name`이 없으므로 호출부가
 * `name: null`을 박는다 (`invitedByName`은 초대한 **다른** 사람이다).
 *
 * ⚠️ **`m.members.you` 표식은 여기 밖이다** — 자기 자신인가는 아래 갈래 넷과 직교라 행 껍데기가 든다.
 *
 * ⚠️ **잎이다** — `lib/i18n` 하나만 문다. 클라이언트가 값으로 읽으므로
 * `components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재돼 있다.
 */
export type MemberIdentity = {
  /** 1행. 이름 → 마스킹 주소 → 자리 채움 순으로 내려온다. */
  primary: string;
  /** 2행. 1행이 이미 주소를 썼거나 쓸 것이 없으면 `null`이다 — 같은 값을 두 줄에 쓰지 않는다. */
  secondary: string | null;
  /** 1행이 사람에게서 온 값이 아니라 **자리 채움 문구**인가. 호출부가 그때만 muted로 그린다. */
  unnamed: boolean;
  /**
   * 아바타 이니셜의 씨앗. **`primary`와 갈라 둔다.**
   *
   * ⚠️ `components/ui/entity-card.tsx`가 이미 밟은 함정이다: 1행이 마스킹 주소면 이니셜이
   * `o***@…` → `o`가 되어 셸 아바타(표시 이름에서 온 `s`)와 **다른 글자·다른 색**이 된다 —
   * 같은 계정이 화면마다 다른 사람처럼 보이면 아바타가 사람을 가리키지 못하고 소음이 된다.
   *
   * `null`이면 이니셜 없는 **중립 원**이다 — 자리 채움 문구의 첫 글자(`N`·`C`)도 사람을 안 가리킨다.
   */
  avatarSeed: string | null;
};

export function planMemberIdentity(member: {
  name: string | null;
  emailLabel: string | null;
  readable: boolean;
}): MemberIdentity {
  /**
   * ⚠️ **못 읽음이 가장 먼저다.** 복호화가 실패한 행은 `name`·`emailLabel`에 그럴듯한 값이 남아 있을
   * 수 있는데(로더가 폴백 라벨을 넣는다) 그것을 그리면 **"빈 값"과 "못 읽음"이 구별되지 않는다.**
   * 판정은 이 불리언 하나이고 라벨 문자열을 비교하지 않는다.
   */
  if (!member.readable) {
    return { primary: m.members.unreadableLabel, secondary: null, unnamed: true, avatarSeed: null };
  }

  // 공백뿐인 이름은 이름이 아니다 — `Avatar`가 `"?"`로 떨어뜨리고 색도 빈 문자열에서 뽑힌다.
  const name = member.name?.trim() ?? "";
  if (name !== "") {
    return { primary: name, secondary: member.emailLabel, unnamed: false, avatarSeed: name };
  }

  if (member.emailLabel !== null) {
    return { primary: member.emailLabel, secondary: null, unnamed: false, avatarSeed: null };
  }

  return { primary: m.members.unnamed, secondary: null, unnamed: true, avatarSeed: null };
}
