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

export interface ActivityTypeAccess {
  activity_type_id: string;
  dimension_value_ids: string[];
}

// --- Activities ---

export interface ActivityType {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface Facilitator {
  id: string;
  organization_id: string;
  name: string;
  contact: string | null;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface DimensionTagInfo {
  dimension_key: string;
  dimension_name: string;
  value_id: string;
  value_name: string;
  value_code: string;
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
  facilitators: Facilitator[];
  tags: DimensionTagInfo[];
  updated_at: number | null;
}

export interface Participation {
  id: string;
  activity_id: string;
  beneficiary_id: string;
  status: string;
  meta: Record<string, unknown> | null;
  beneficiary_name: string | null;
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
}

export type EntityType = string; // dynamic: "activity_type" | "facilitator" | "beneficiary" | "enrollment" | "activity" | "participation" | "dimension:{key}"

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

// --- Beneficiaries ---

export interface Beneficiary {
  id: string;
  organization_id: string;
  case_number: string;
  name: string;
  meta: Record<string, unknown> | null;
  tags: DimensionTagInfo[];
  updated_at: number | null;
}

export interface Enrollment {
  id: string;
  organization_id: string;
  beneficiary_id: string;
  admission_date: string;
  release_date: string | null;
  meta: Record<string, unknown> | null;
  beneficiary_name: string | null;
  tags: DimensionTagInfo[];
  updated_at: number | null;
}
