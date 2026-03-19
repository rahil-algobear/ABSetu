"use client";

import { useQuery } from "@tanstack/react-query";
import { organizationApi } from "@/services/api";
import { useAuth } from "@/services/auth";

/**
 * Default vocabulary — generic terms used when no org-level override exists.
 */
const DEFAULTS: Record<string, string> = {
  activity: "Activity",
  activity_type: "Activity Type",
  entity: "Entity",
  entity_type: "Entity Type",
  participant: "Participant",
  enrollment: "Enrollment",
};

/**
 * Plural forms of defaults.
 */
const DEFAULTS_PLURAL: Record<string, string> = {
  activity: "Activities",
  activity_type: "Activity Types",
  entity: "Entities",
  entity_type: "Entity Types",
  participant: "Participants",
  enrollment: "Enrollments",
};

/**
 * Hook that returns vocabulary functions for org-specific terminology.
 *
 * Usage:
 *   const { v, vPlural } = useVocabulary();
 *   v("activity")       // → "Session"  (for Kshamata)
 *   vPlural("activity")  // → "Sessions" (for Kshamata)
 */
export function useVocabulary() {
  const { isAuthenticated } = useAuth();
  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: organizationApi.get,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  const vocab: Record<string, string> =
    (org?.meta as Record<string, unknown>)?.vocabulary as Record<string, string> ?? {};

  /** Get singular form: org override or default. */
  function v(key: string): string {
    return vocab[key] || DEFAULTS[key] || key;
  }

  /** Get plural form: naive pluralization of the vocab term. */
  function vPlural(key: string): string {
    const override = vocab[key];
    if (!override) {
      return DEFAULTS_PLURAL[key] || key;
    }
    // Naive pluralization
    if (override.endsWith("y") && !override.endsWith("ey")) {
      return override.slice(0, -1) + "ies";
    }
    if (override.endsWith("s") || override.endsWith("x") || override.endsWith("ch") || override.endsWith("sh")) {
      return override + "es";
    }
    return override + "s";
  }

  /** Get display name for a dimension: vocab override by key, else DB name. */
  function vDim(dim: { key: string; name: string }): string {
    return vocab[dim.key] || dim.name;
  }

  return { v, vPlural, vDim, vocab };
}
