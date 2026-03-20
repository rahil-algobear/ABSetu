import { Dimension } from "@/types";

const LABELS: Record<string, string> = {
  entity: "Entity",
  activity: "Activity",
  activity_type: "Activity Type",
  enrollment: "Enrollment",
};

const PLURALS: Record<string, string> = {
  entity: "Entities",
  activity: "Activities",
  activity_type: "Activity Types",
  enrollment: "Enrollments",
};

/** Simple vocabulary helper — returns display labels for domain concepts. */
export function useVocabulary() {
  const v = (key: string) => LABELS[key] ?? key;
  const vPlural = (key: string) => PLURALS[key] ?? key;
  const vDim = (dim: Dimension) => dim.name;

  return { v, vPlural, vDim };
}
