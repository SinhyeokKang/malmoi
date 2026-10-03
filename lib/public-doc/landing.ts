/** Public document heading coordinates are relative to its own scroller, never offsetParent. */
export function documentTop(node: HTMLElement, scroller: HTMLElement): number {
  return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/** 검색 portal의 클릭은 문서 스크롤러를 지나지 않는다 — 착지한 절로 목차 고정도 옮긴다. */
export const DOCUMENT_HEADING_LANDED = "public-doc-heading-landed";

/** Shared by the real TOC and same-document search results. Missing targets retain native navigation. */
export function landDocumentHeading(id: string): HTMLElement | null {
  const target = document.getElementById(id);
  const scroller = target?.closest<HTMLElement>("[data-public-scroller]");
  if (!target || !scroller) return null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The 48 offset matches the heading scroll margin; focusing must preserve the smooth scroll.
  scroller.scrollTo({ top: documentTop(target, scroller) - 48, behavior: reduced ? "auto" : "smooth" });
  history.replaceState(null, "", `#${id}`);
  scroller.dispatchEvent(new CustomEvent(DOCUMENT_HEADING_LANDED, { detail: id }));
  target.focus({ preventScroll: true });
  return target;
}
