import { DEFAULT_TRANSLATION_QUERY, translationsHref } from "@/lib/translations/query";

/** Client-owned result shape; the server reads this module only as a type. */
export type KeyHit = {
  id: string;
  key: string;
  namespace: string;
  sourceText: string;
  surfaceSlug: string;
  slug: string;
  name: string;
  inKey: boolean;
  localeCode: string | null;
  value: string | null;
};

export function keyResultHref(hit: KeyHit): string {
  return translationsHref(hit.slug, hit.surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns: hit.namespace, key: hit.id, keySurface: hit.surfaceSlug });
}
