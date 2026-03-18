// --- Auth ---

export interface UserRegisterData {
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
}

export interface UserLoginData {
  country_code: string;
  mobile_number: string;
}

export interface OTPVerifyData {
  country_code: string;
  mobile_number: string;
  otp_code: string;
}

export interface LoginResponse {
  message: string;
}

export interface VerifyOTPResponse {
  access_token: string;
  refresh_token: string;
  refresh_token_expires_in_days: number;
}

export interface UserProfileResponse {
  id: string;
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
  is_verified: boolean;
  updated_at: number | null;
  organization_id: string | null;
  role_id: string | null;
  role_name: string | null;
  permissions: string[];
}

export interface ApiError extends Error {
  detail?: string;
}

// --- Organization ---

export interface Organization {
  id: string;
  name: string;
  code: string;
  case_number_format: string;
  logo_url: string | null;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

// --- Dimensions ---

export interface Dimension {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  sort_order: number;
  is_system: string | null;
  updated_at: number | null;
}

export interface DimensionValue {
  id: string;
  organization_id: string;
  dimension_id: string;
  name: string;
  code: string;
  sort_order: number;
  meta: Record<string, unknown> | null;
  dimension_name: string | null;
  dimension_key: string | null;
  updated_at: number | null;
}

export interface DimensionValueLink {
  id: string;
  organization_id: string;
  dimension_value_id_1: string;
  dimension_value_id_2: string;
  value_1_name: string | null;
  value_1_code: string | null;
  value_1_dimension_key: string | null;
  value_2_name: string | null;
  value_2_code: string | null;
  value_2_dimension_key: string | null;
  updated_at: number | null;
}

// --- Entity Types & Entities ---

export interface EntityType {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  config: Record<string, unknown> | null;
  sort_order: number;
  updated_at: number | null;
}

export interface DimensionTagInfo {
  dimension_key: string;
  dimension_name: string;
  value_id: string;
  value_name: string;
  value_code: string;
}

export interface Entity {
  id: string;
  organization_id: string;
  entity_type_id: string;
  case_number: string | null;
  name: string;
  meta: Record<string, unknown> | null;
  entity_type_name: string | null;
  entity_type_key: string | null;
  entity_type_config: Record<string, unknown> | null;
  tags: DimensionTagInfo[];
  updated_at: number | null;
}

// --- Activity Categories & Types ---

export interface ActivityCategory {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  sections: Record<string, unknown>[] | null;
  sort_order: number;
  updated_at: number | null;
}

export interface ActivityType {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  category_name: string | null;
  updated_at: number | null;
}

export interface Activity {
  id: string;
  organization_id: string;
  activity_type_id: string;
  date: string;
  notes: string | null;
  created_by: string | null;
  meta: Record<string, unknown> | null;
  type_name: string | null;
  category_name: string | null;
  tags: DimensionTagInfo[];
  updated_at: number | null;
}

export interface ActivityParticipant {
  id: string;
  activity_id: string;
  participant_type: string; // "entity" or "user"
  participant_id: string;
  section_key: string;
  status: string | null;
  meta: Record<string, unknown> | null;
  participant_name: string | null;
  updated_at: number | null;
}

// --- Meta Field Definitions ---

export type MetaFieldType = "text" | "number" | "date" | "select" | "multiselect" | "boolean";

export interface MetaFieldDefinition {
  key: string;
  label: string;
  type: MetaFieldType;
  required?: boolean;
  options?: string[]; // for select/multiselect
  default?: string | number | boolean | string[];
}

export type MetaEntityType = string; // dynamic key for meta field schemas: "entity:{key}" | "enrollment" | "activity" | etc.

export type MetaFieldSchemas = Partial<Record<string, MetaFieldDefinition[]>>;

// --- Roles & Permissions ---

export interface Permission {
  id: string;
  key: string;
  description: string | null;
  updated_at: number | null;
}

export interface Role {
  id: string;
  organization_id: string;
  name: string;
  is_default: boolean;
  is_system: boolean;
  permissions: Permission[];
  user_count: number;
  updated_at: number | null;
}

export interface UserListItem {
  id: string;
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
  is_verified: boolean;
  role_id: string | null;
  role_name: string | null;
  dimension_value_ids: string[];
  updated_at: number | null;
}

export interface UserAccess {
  dimension_value_ids: string[];
}

// --- Enrollments ---

export interface Enrollment {
  id: string;
  organization_id: string;
  entity_id: string;
  admission_date: string;
  release_date: string | null;
  meta: Record<string, unknown> | null;
  entity_name: string | null;
  tags: DimensionTagInfo[];
  updated_at: number | null;
}
