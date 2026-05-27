// --- Common ---

export interface PaginatedResponse<T> {
  count: number;
  data: T[];
}

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
  updated_at: string | null;
  organization_id: string | null;
  role_id: string | null;
  role_name: string | null;
  permissions: string[];
  dimension_value_ids: string[];
}

export interface ApiError extends Error {
  detail?: string;
}

// --- Organization ---

export interface Organization {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  meta: Record<string, unknown> | null;
  updated_at: string | null;
}

// --- Dimensions ---

export interface Dimension {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  sort_order: number;
  controls_access: boolean;
  updated_at: string | null;
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
  updated_at: string | null;
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
  updated_at: string | null;
}

// --- Entity Types & Entities ---

export interface EntityType {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  config: Record<string, unknown> | null;
  sort_order: number;
  can_enroll: boolean;
  updated_at: string | null;
}

export interface DimensionInfo {
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
  code: string | null;
  created_by: string | null;
  created_by_name: string | null;
  meta: Record<string, unknown> | null;
  entity_type_name: string | null;
  entity_type_key: string | null;
  entity_type_config: Record<string, unknown> | null;
  entity_type_can_enroll: boolean;
  dimensions: DimensionInfo[];
  created_at: string | null;
  updated_at: string | null;
  enrollment_count: number;
  activity_count: number;
}

// --- Activity Types ---

export interface ActivityType {
  id: string;
  organization_id: string;
  name: string;
  key: string;
  sort_order: number;
  updated_at: string | null;
}

export interface Activity {
  id: string;
  organization_id: string;
  activity_type_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  meta: Record<string, unknown> | null;
  activity_type_name: string | null;
  dimensions: DimensionInfo[];
  participant_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ActivityParticipant {
  id: string;
  activity_id: string;
  participant_type: string; // "entity" or "user"
  participant_id: string;
  section_key: string;
  status: string | null;
  meta: Record<string, unknown> | null;
  updated_at: string | null;
}

// --- Meta Field Definitions ---

export type MetaFieldType =
  | "text" | "number" | "date" | "datetime"
  | "select" | "multiselect" | "boolean"
  | "dimension" | "entity_list" | "user_list";

export type MetaFieldDisplayType =
  | "input" | "dropdown" | "radio" | "checklist" | "textarea"
  | "date" | "datetime" | "search_select" | "multi_select";
export type MetaFieldStage = "create" | "record" | "both";

export interface MetaFieldDefinition {
  key: string;
  label: string;
  type: MetaFieldType;
  system?: boolean;
  required?: boolean;
  options?: string[]; // for select/multiselect
  default?: string | number | boolean | string[];

  // Form presentation
  display_type?: MetaFieldDisplayType | null;
  stage?: MetaFieldStage;
  visible?: boolean;
  sort_order?: number;

  // For type="dimension"
  dimension_id?: string | null;
  // For type="entity_list"
  entity_type_id?: string | null;
  // For title generation config, status capture config, etc.
  config?: Record<string, unknown>;
}

export interface MetaFieldSchemaScope {
  type: string;
  entity_type_id?: string | null;
  dimension_id?: string | null;
  activity_type_id?: string | null;
  dimension_value_id?: string | null;
}

export interface MetaFieldSchemaItem {
  scope: MetaFieldSchemaScope;
  fields: MetaFieldDefinition[];
}

// --- List Configuration ---

export interface ListColumnConfig {
  key: string;
  label: string;
  field_type: string; // MetaFieldType for field-backed columns, "static" for built-in
  visible: boolean;
  filterable: boolean;
  sortable: boolean;
  searchable: boolean;
  sort_order: number;
  dimension_key?: string;
  filter_supported?: boolean;
  search_supported?: boolean;
}

export interface ListConfigSettings {
  columns: ListColumnConfig[];
  available_columns: ListColumnConfig[];
}

// --- Roles & Permissions ---

export interface Permission {
  id: string;
  key: string;
  description: string | null;
  updated_at: string | null;
}

export interface Role {
  id: string;
  organization_id: string;
  name: string;
  is_default: boolean;
  is_system: boolean;
  permissions: Permission[];
  user_count: number;
  updated_at: string | null;
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
  updated_at: string | null;
}

export interface UserAccess {
  dimension_value_ids: string[];
}

// --- Dashboard ---

export interface CountByItem {
  label: string;
  count: number;
}

export interface TimeSeriesPoint {
  period: string; // YYYY-MM
  count: number;
}

export interface RecentActivity {
  id: string;
  date: string;
  type_name: string | null;
  participant_count: number;
}

export interface DashboardFilters {
  dimension_value_ids?: string[];
  activity_type_id?: string;
}

export interface DashboardStats {
  total_entities: number;
  total_activities: number;
  total_enrollments: number;
  active_enrollments: number;
  total_users: number;
  entities_by_type: CountByItem[];
  activities_by_type: CountByItem[];
  activities_by_dimension: Record<string, CountByItem[]>;
  activities_over_time: TimeSeriesPoint[];
  enrollments_over_time: TimeSeriesPoint[];
  recent_activities: RecentActivity[];
}

// --- Enrollments ---

export interface Enrollment {
  id: string;
  organization_id: string;
  entity_id: string;
  meta: Record<string, unknown> | null;
  is_active: boolean;
  dimensions: DimensionInfo[];
  updated_at: string | null;
}
