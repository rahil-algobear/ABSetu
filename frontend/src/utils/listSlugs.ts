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

/**
 * Minimal shape a slug source must provide. Both FilterDefinition (filter modal)
 * and ListColumnConfig (visible list columns) satisfy it — letting us slugify
 * fields that are sort-only as well as filter-only.
 */
export interface SlugSource {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// URL prefixes that mirror the backend's real-key shape (dim:..., meta:...).
// Static columns (no colon in their real key) stay bare. "field" rather than
// "meta" so the URL matches frontend vocabulary, not DB schema names.
const DIM_PREFIX = "dim";
const FIELD_PREFIX = "field";

/**
 * Compute the URL slug for a real key, prefixing by source type so
 * dimensions, user-defined fields, and static columns can never collide.
 *
 *   dim:abc-uuid     + "Centre"   -> "dim-centre"
 *   meta:3bg7_centre + "Centre"   -> "field-centre"
 *   created_at       + "Created"  -> "created"
 */
function slugForKey(realKey: string, label: string): string {
  const base = slugify(label);
  if (realKey.startsWith("dim:")) return `${DIM_PREFIX}-${base}`;
  if (realKey.startsWith("meta:")) return `${FIELD_PREFIX}-${base}`;
  return base;
}

/**
 * Build slug mappings from one or more source lists. Earlier sources take
 * precedence on key collisions, so pass the richer source (e.g. filter defs
 * with options) first.
 */
export function buildSlugMappings(...sources: SlugSource[][]): SlugMappings {
  const keySlugToReal = new Map<string, string>();
  const keyRealToSlug = new Map<string, string>();
  const valueSlugToReal = new Map<string, Map<string, string>>();
  const valueRealToSlug = new Map<string, Map<string, string>>();
  const seenRealKeys = new Set<string>();

  for (const list of sources) {
    for (const def of list) {
      if (seenRealKeys.has(def.key)) continue;
      seenRealKeys.add(def.key);

      const ks = slugForKey(def.key, def.label);
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
