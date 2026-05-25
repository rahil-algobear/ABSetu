import type { FilterDefinition } from "@/components/ui/filter-modal";

/**
 * Translates between backend column keys (e.g. "meta:3bg7_date") and
 * human-readable URL slugs (e.g. "session-date").
 *
 * Used by list pages so URL params like sort_by and filter_* are
 * shareable and bookmarkable instead of leaking internal key shapes.
 */

export interface SlugMappings {
  keySlugToReal: Map<string, string>;
  keyRealToSlug: Map<string, string>;
  valueSlugToReal: Map<string, Map<string, string>>;
  valueRealToSlug: Map<string, Map<string, string>>;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildSlugMappings(defs: FilterDefinition[]): SlugMappings {
  const keySlugToReal = new Map<string, string>();
  const keyRealToSlug = new Map<string, string>();
  const valueSlugToReal = new Map<string, Map<string, string>>();
  const valueRealToSlug = new Map<string, Map<string, string>>();

  for (const def of defs) {
    const ks = slugify(def.label);
    keySlugToReal.set(ks, def.key);
    keyRealToSlug.set(def.key, ks);

    if (def.options) {
      const vsToR = new Map<string, string>();
      const vrToS = new Map<string, string>();
      for (const opt of def.options) {
        const vs = slugify(opt.label);
        vsToR.set(vs, opt.value);
        vrToS.set(opt.value, vs);
      }
      valueSlugToReal.set(def.key, vsToR);
      valueRealToSlug.set(def.key, vrToS);
    }
  }

  return { keySlugToReal, keyRealToSlug, valueSlugToReal, valueRealToSlug };
}

/** Real internal key (e.g. "meta:3bg7_date") -> URL slug. Falls back to the input when no mapping exists. */
export function keyRealToSlug(key: string, m: SlugMappings | null): string {
  return m?.keyRealToSlug.get(key) ?? key;
}

/**
 * URL slug -> real internal key. Tries `knownRealKeys` first so URLs that
 * already use the raw key still resolve, then falls back to the slug map.
 * Returns null when neither matches — caller decides how to handle.
 */
export function keySlugToReal(
  slug: string,
  m: SlugMappings | null,
  knownRealKeys?: Set<string>,
): string | null {
  if (knownRealKeys?.has(slug)) return slug;
  return m?.keySlugToReal.get(slug) ?? null;
}

/** Real value -> URL slug. Falls back to the input when no mapping exists. */
export function valueRealToSlug(key: string, value: string, m: SlugMappings | null): string {
  return m?.valueRealToSlug.get(key)?.get(value) ?? value;
}

/** URL slug -> real value. Falls back to the input when no mapping exists. */
export function valueSlugToReal(key: string, slug: string, m: SlugMappings | null): string {
  return m?.valueSlugToReal.get(key)?.get(slug) ?? slug;
}
