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
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface Center {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address: string | null;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface Programme {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface ProgrammeCenter {
  id: string;
  programme_id: string;
  center_id: string;
  programme_name: string | null;
  center_name: string | null;
  updated_at: number | null;
}

// --- Sessions ---

export interface SessionTemplate {
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

export interface Session {
  id: string;
  session_template_id: string;
  programme_center_id: string;
  date: string;
  notes: string | null;
  created_by: string | null;
  meta: Record<string, unknown> | null;
  template_name: string | null;
  programme_name: string | null;
  center_name: string | null;
  facilitators: Facilitator[];
  updated_at: number | null;
}

export interface Attendance {
  id: string;
  session_id: string;
  beneficiary_id: string;
  status: string;
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

export type EntityType =
  | "centre"
  | "programme"
  | "session_template"
  | "facilitator"
  | "beneficiary";

export type MetaFieldSchemas = Partial<Record<EntityType, MetaFieldDefinition[]>>;

// --- Beneficiaries ---

export interface Beneficiary {
  id: string;
  organization_id: string;
  case_number: string;
  name: string;
  meta: Record<string, unknown> | null;
  updated_at: number | null;
}

export interface Enrollment {
  id: string;
  beneficiary_id: string;
  programme_center_id: string;
  admission_date: string;
  release_date: string | null;
  meta: Record<string, unknown> | null;
  beneficiary_name: string | null;
  programme_name: string | null;
  center_name: string | null;
  updated_at: number | null;
}

