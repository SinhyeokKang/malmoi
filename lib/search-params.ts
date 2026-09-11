/** Next의 반복 쿼리는 배열이다. 페이지 경계에서 첫 값으로 정규화한다. */
export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
