import authAxios, { publicAxios } from './axios';
import {
  Activity,
  ActivityType,
  ActivityParticipant,
  DashboardFilters,
  DashboardStats,
  Dimension,
  DimensionValue,
  Enrollment,
  Entity,
  EntityType,
  ListColumnConfig,
  ListConfigSettings,
  LoginResponse,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
  OTPVerifyData,
  Organization,
  PaginatedResponse,
  Permission,
  Role,
  DimensionValueLink,
  UserAccess,
  UserListItem,
  UserLoginData,
  UserProfileResponse,
  UserRegisterData,
  VerifyOTPResponse,
} from '../types';

export const authApi = {
  register: async (data: UserRegisterData): Promise<LoginResponse> => {
    const response = await publicAxios.post<LoginResponse>('/auth/register', data);
    return response.data;
  },
  login: async (data: UserLoginData): Promise<LoginResponse> => {
    try {
      const response = await publicAxios.post<LoginResponse>('/auth/login', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        const apiError = new Error(error.response.data.message) as Error & { detail?: string };
        apiError.detail = error.response.data.message;
        throw apiError;
      }
      throw new Error('Failed to send OTP');
    }
  },
  verifyOTP: async (data: OTPVerifyData): Promise<VerifyOTPResponse> => {
    try {
      const response = await publicAxios.post<VerifyOTPResponse>('/auth/verify-otp', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Invalid OTP');
    }
  },
  refreshToken: async (refreshToken: string): Promise<VerifyOTPResponse> => {
    const response = await publicAxios.post<VerifyOTPResponse>('/auth/refresh-token', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
  getProfile: async (): Promise<UserProfileResponse> => {
    const response = await authAxios.get<UserProfileResponse>('/user/profile');
    return response.data;
  },
  logout: async (refreshToken: string) => {
    try {
      await publicAxios.post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      // Ignore server errors on logout
    }
    return { message: 'Logged out' };
  },
};

// --- Organization ---

export const organizationApi = {
  get: async (): Promise<Organization> => {
    const response = await authAxios.get<Organization>('/organization/');
    return response.data;
  },
  update: async (data: Partial<Organization>): Promise<Organization> => {
    const response = await authAxios.put<Organization>('/organization/', data);
    return response.data;
  },
};

// --- Meta Field Schemas ---

export interface MetaFieldScope {
  type: string; // "entity", "dimension", "enrollment", "activity", "participant"
  entity_type_id?: string | null;
  dimension_id?: string | null;
  activity_type_id?: string | null;
  dimension_value_id?: string | null;
}

export const metaFieldSchemaApi = {
  getAll: async (): Promise<MetaFieldSchemaItem[]> => {
    const response = await authAxios.get<MetaFieldSchemaItem[]>('/organization/meta-field-schemas');
    return response.data;
  },
  update: async (scope: MetaFieldScope, fields: MetaFieldDefinition[]): Promise<MetaFieldDefinition[]> => {
    const response = await authAxios.put<MetaFieldDefinition[]>(
      '/organization/meta-field-schemas',
      { scope, fields }
    );
    return response.data;
  },
};

// --- Dimensions ---

export const dimensionApi = {
  list: async (): Promise<Dimension[]> => {
    const response = await authAxios.get<Dimension[]>('/dimensions/');
    return response.data;
  },
  get: async (id: string): Promise<Dimension> => {
    const response = await authAxios.get<Dimension>(`/dimensions/${id}`);
    return response.data;
  },
  create: async (data: { name: string; key?: string; sort_order?: number; controls_access?: boolean }): Promise<Dimension> => {
    const response = await authAxios.post<Dimension>('/dimensions/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Dimension>): Promise<Dimension> => {
    const response = await authAxios.put<Dimension>(`/dimensions/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/dimensions/${id}`);
    return response.data;
  },
  // Dimension values — full list (admin/matrix UIs only). Do NOT use for
  // form dropdowns or filter pickers; use listAccessibleValues instead so
  // restricted users only see values they actually have access to.
  listValues: async (dimensionId: string): Promise<DimensionValue[]> => {
    const response = await authAxios.get<DimensionValue[]>(`/dimensions/${dimensionId}/values`);
    return response.data;
  },
  // Dimension values scoped to the caller's access. Use for any form
  // dropdown or filter where the user is picking a value to tag/filter on.
  listAccessibleValues: async (dimensionId: string): Promise<DimensionValue[]> => {
    const response = await authAxios.get<DimensionValue[]>(
      `/dimensions/${dimensionId}/values/accessible`
    );
    return response.data;
  },
  createValue: async (dimensionId: string, data: { name: string; sort_order?: number; meta?: Record<string, unknown> }): Promise<DimensionValue> => {
    const response = await authAxios.post<DimensionValue>(`/dimensions/${dimensionId}/values`, data);
    return response.data;
  },
  updateValue: async (dimensionId: string, valueId: string, data: Partial<DimensionValue>): Promise<DimensionValue> => {
    const response = await authAxios.put<DimensionValue>(`/dimensions/${dimensionId}/values/${valueId}`, data);
    return response.data;
  },
  deleteValue: async (dimensionId: string, valueId: string) => {
    const response = await authAxios.delete(`/dimensions/${dimensionId}/values/${valueId}`);
    return response.data;
  },
};

// --- Dimension Value Links ---

export const dimensionValueLinkApi = {
  list: async (dimensionId1?: string, dimensionId2?: string): Promise<DimensionValueLink[]> => {
    const params = new URLSearchParams();
    if (dimensionId1) params.set('dimension_id_1', dimensionId1);
    if (dimensionId2) params.set('dimension_id_2', dimensionId2);
    const response = await authAxios.get<DimensionValueLink[]>(`/dimension-value-links/?${params.toString()}`);
    return response.data;
  },
  create: async (data: { dimension_value_id_1: string; dimension_value_id_2: string }): Promise<DimensionValueLink> => {
    const response = await authAxios.post<DimensionValueLink>('/dimension-value-links/', data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/dimension-value-links/${id}`);
    return response.data;
  },
  bulkSync: async (data: { dimension_id_1: string; dimension_id_2: string; pairs: [string, string][] }): Promise<DimensionValueLink[]> => {
    const response = await authAxios.post<DimensionValueLink[]>('/dimension-value-links/bulk', data);
    return response.data;
  },
};

// --- Entity Types ---

export const entityTypeApi = {
  list: async (): Promise<EntityType[]> => {
    const response = await authAxios.get<EntityType[]>('/entity-types/');
    return response.data;
  },
  get: async (id: string): Promise<EntityType> => {
    const response = await authAxios.get<EntityType>(`/entity-types/${id}`);
    return response.data;
  },
  create: async (data: { name: string; key?: string; config?: Record<string, unknown>; sort_order?: number; can_enroll?: boolean; max_active_enrollments?: number | null }): Promise<EntityType> => {
    const response = await authAxios.post<EntityType>('/entity-types/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; config?: Record<string, unknown>; sort_order?: number; can_enroll?: boolean; max_active_enrollments?: number | null }): Promise<EntityType> => {
    const response = await authAxios.put<EntityType>(`/entity-types/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/entity-types/${id}`);
    return response.data;
  },
};

// --- Entities ---

export interface EntityListParams {
  search?: string;
  filters?: string;
  sort_by?: string;
  sort_order?: string;
  page?: number;
  limit?: number;
  entity_type_id?: string;
  with_enrollment_status_for_activity?: string;
  enrollment_status_filter?: "active_in_scope" | "no_active_in_scope";
  ids?: string;
}

export interface EntityFilterDefinition {
  key: string;
  label: string;
  type: "select" | "range" | "date_range" | "boolean" | "text";
  section?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface FilterResponse {
  filters: EntityFilterDefinition[];
  sortable_keys: string[];
  columns: ListColumnConfig[];
}

export const entityApi = {
  list: async (entityTypeId?: string): Promise<Entity[]> => {
    // High limit so the activity create page's SearchSelectParticipants
    // options list covers orgs with hundreds of beneficiaries. Phase 3.2
    // retires that flow; until then this is the patch.
    const params = new URLSearchParams({ limit: "1000" });
    if (entityTypeId) params.set("entity_type_id", entityTypeId);
    const response = await authAxios.get<PaginatedResponse<Entity>>(
      `/entities/?${params.toString()}`,
    );
    return response.data.data;
  },
  /** Fetch entities by ID. Transparently chunks the request so an
   *  activity with hundreds of participants (or any other big batch
   *  caller) doesn't trip the backend's per-request `ids` cap and,
   *  more importantly, doesn't blow URL-length limits on intermediate
   *  proxies. Chunks are fetched in parallel and re-merged. */
  listByIds: async (ids: string[]): Promise<Entity[]> => {
    if (ids.length === 0) return [];
    // 200 UUIDs ≈ 7.4 KB of URL, comfortably under the 8 KB header
    // limit most reverse proxies default to.
    const CHUNK_SIZE = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }
    const responses = await Promise.all(
      chunks.map((chunk) =>
        authAxios.get<PaginatedResponse<Entity>>(
          `/entities/?ids=${chunk.join(",")}`,
        ),
      ),
    );
    return responses.flatMap((r) => r.data.data);
  },
  listPaginated: async (params: EntityListParams): Promise<PaginatedResponse<Entity>> => {
    const response = await authAxios.get<PaginatedResponse<Entity>>('/entities/', { params });
    return response.data;
  },
  getFilters: async (entityTypeId?: string): Promise<FilterResponse> => {
    const params = entityTypeId ? { entity_type_id: entityTypeId } : {};
    const response = await authAxios.get<FilterResponse>('/entities/filters', { params });
    return response.data;
  },
  get: async (id: string): Promise<Entity> => {
    const response = await authAxios.get<Entity>(`/entities/${id}`);
    return response.data;
  },
  create: async (data: { entity_type_id: string; dimension_value_ids?: string[]; meta?: Record<string, unknown> }): Promise<Entity> => {
    const response = await authAxios.post<Entity>('/entities/', data);
    return response.data;
  },
  update: async (id: string, data: { meta?: Record<string, unknown> }): Promise<Entity> => {
    const response = await authAxios.put<Entity>(`/entities/${id}`, data);
    return response.data;
  },
  updateDimensions: async (id: string, dimensionValueIds: string[]): Promise<Entity> => {
    const response = await authAxios.put<Entity>(`/entities/${id}/dimensions`, dimensionValueIds);
    return response.data;
  },
};

// --- Activity Types ---

export const activityTypeApi = {
  list: async (): Promise<ActivityType[]> => {
    const response = await authAxios.get<ActivityType[]>('/activity-types/');
    return response.data;
  },
  get: async (id: string): Promise<ActivityType> => {
    const response = await authAxios.get<ActivityType>(`/activity-types/${id}`);
    return response.data;
  },
  create: async (data: { name: string; sort_order?: number }): Promise<ActivityType> => {
    const response = await authAxios.post<ActivityType>('/activity-types/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; sort_order?: number }): Promise<ActivityType> => {
    const response = await authAxios.put<ActivityType>(`/activity-types/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/activity-types/${id}`);
    return response.data;
  },
};


// --- Activities ---

export interface ActivityListParams {
  search?: string;
  filters?: string;
  sort_by?: string;
  sort_order?: string;
  page?: number;
  limit?: number;
  activity_type_id?: string;
}

export const activityApi = {
  listPaginated: async (params: ActivityListParams): Promise<PaginatedResponse<Activity>> => {
    const response = await authAxios.get<PaginatedResponse<Activity>>('/activities/', { params });
    return response.data;
  },
  getFilters: async (activityTypeId?: string): Promise<FilterResponse> => {
    const params = activityTypeId ? { activity_type_id: activityTypeId } : {};
    const response = await authAxios.get<FilterResponse>('/activities/filters', { params });
    return response.data;
  },
  listByEntity: async (entityId: string): Promise<Activity[]> => {
    const response = await authAxios.get<Activity[]>(`/activities/entity/${entityId}`);
    return response.data;
  },
  get: async (id: string): Promise<Activity> => {
    const response = await authAxios.get<Activity>(`/activities/${id}`);
    return response.data;
  },
  create: async (data: {
    activity_type_id?: string;
    dimension_value_ids?: string[];
    meta?: Record<string, unknown>;
  }): Promise<Activity> => {
    const response = await authAxios.post<Activity>('/activities/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Activity>): Promise<Activity> => {
    const response = await authAxios.put<Activity>(`/activities/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/activities/${id}`);
    return response.data;
  },
  getParticipants: async (activityId: string): Promise<ActivityParticipant[]> => {
    const response = await authAxios.get<ActivityParticipant[]>(`/activities/${activityId}/participants`);
    return response.data;
  },
  saveParticipants: async (activityId: string, records: { participant_type: string; participant_id: string; section_key: string; status?: string; meta?: Record<string, unknown> }[]): Promise<ActivityParticipant[]> => {
    const response = await authAxios.post<ActivityParticipant[]>(`/activities/${activityId}/participants`, { records });
    return response.data;
  },
  replaceSectionParticipants: async (
    activityId: string,
    sectionKey: string,
    records: { participant_type: string; participant_id: string; status?: string; meta?: Record<string, unknown> }[],
  ): Promise<ActivityParticipant[]> => {
    const response = await authAxios.put<ActivityParticipant[]>(
      `/activities/${activityId}/participants`,
      { records },
      { params: { section_key: sectionKey } },
    );
    return response.data;
  },

  // --- Smart picker (Phase 3) ---

  pickerAdd: async (
    activityId: string,
    data: {
      entity_id: string;
      section_key: string;
      participant_type?: "entity" | "user";
    },
  ): Promise<ActivityParticipant> => {
    const response = await authAxios.post<ActivityParticipant>(
      `/activities/${activityId}/participants/add`,
      data,
    );
    return response.data;
  },
  pickerEnrollAndAdd: async (
    activityId: string,
    data: {
      entity_id: string;
      section_key: string;
      enrollment_meta?: Record<string, unknown>;
      enrollment_dimension_value_ids: string[];
    },
  ): Promise<ActivityParticipant> => {
    const response = await authAxios.post<ActivityParticipant>(
      `/activities/${activityId}/participants/enroll_and_add`,
      data,
    );
    return response.data;
  },
  pickerCreateAndAdd: async (
    activityId: string,
    data: {
      entity_type_id: string;
      entity_meta?: Record<string, unknown>;
      entity_dimension_value_ids?: string[];
      section_key: string;
      enrollment_meta?: Record<string, unknown>;
      enrollment_dimension_value_ids: string[];
    },
  ): Promise<ActivityParticipant> => {
    const response = await authAxios.post<ActivityParticipant>(
      `/activities/${activityId}/participants/create_and_add`,
      data,
    );
    return response.data;
  },
};

// --- Roles ---

export const roleApi = {
  list: async (): Promise<Role[]> => {
    const response = await authAxios.get<Role[]>('/roles/');
    return response.data;
  },
  create: async (data: { name: string; is_default?: boolean; permission_ids: string[] }): Promise<Role> => {
    const response = await authAxios.post<Role>('/roles/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; is_default?: boolean; permission_ids?: string[] }): Promise<Role> => {
    const response = await authAxios.put<Role>(`/roles/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/roles/${id}`);
    return response.data;
  },
  listPermissions: async (): Promise<Permission[]> => {
    const response = await authAxios.get<Permission[]>('/roles/permissions');
    return response.data;
  },
};

// --- Users (Admin) ---

export const userApi = {
  list: async (): Promise<UserListItem[]> => {
    const response = await authAxios.get<UserListItem[]>('/user/list');
    return response.data;
  },
  create: async (data: {
    first_name: string;
    last_name: string;
    country_code: string;
    mobile_number: string;
    role_id: string;
  }): Promise<UserListItem> => {
    const response = await authAxios.post<UserListItem>('/user/', data);
    return response.data;
  },
  update: async (userId: string, data: {
    first_name: string;
    last_name: string;
    country_code: string;
    mobile_number: string;
    role_id: string;
  }): Promise<UserListItem> => {
    const response = await authAxios.put<UserListItem>(`/user/${userId}`, data);
    return response.data;
  },
  updateRole: async (userId: string, roleId: string): Promise<UserListItem> => {
    const response = await authAxios.put<UserListItem>(`/user/${userId}/role`, { role_id: roleId });
    return response.data;
  },
  getAccess: async (userId: string): Promise<UserAccess> => {
    const response = await authAxios.get<UserAccess>(`/user/${userId}/access`);
    return response.data;
  },
  updateAccess: async (userId: string, data: UserAccess): Promise<UserAccess> => {
    const response = await authAxios.put<UserAccess>(`/user/${userId}/access`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/user/${id}`);
    return response.data;
  },
};

// --- Dashboard ---

export const dashboardApi = {
  getStats: async (filters?: DashboardFilters): Promise<DashboardStats> => {
    const params = new URLSearchParams();
    if (filters?.dimension_value_ids?.length) {
      for (const id of filters.dimension_value_ids) {
        params.append('dimension_value_ids', id);
      }
    }
    if (filters?.activity_type_id) {
      params.set('activity_type_id', filters.activity_type_id);
    }
    const qs = params.toString();
    const response = await authAxios.get<DashboardStats>(`/dashboard/stats${qs ? `?${qs}` : ''}`);
    return response.data;
  },
};

// --- List Config ---

export const listConfigApi = {
  get: async (scope: string): Promise<ListColumnConfig[]> => {
    const response = await authAxios.get<ListColumnConfig[]>(`/organization/list-config/${scope}`);
    return response.data;
  },
  getSettings: async (scope: string): Promise<ListConfigSettings> => {
    const response = await authAxios.get<ListConfigSettings>(`/organization/list-config/settings/${scope}`);
    return response.data;
  },
  update: async (scope: string, columns: ListColumnConfig[]): Promise<ListColumnConfig[]> => {
    const response = await authAxios.put<ListColumnConfig[]>(`/organization/list-config/${scope}`, columns);
    return response.data;
  },
};

// --- Enrollments ---

export const enrollmentApi = {
  list: async (): Promise<Enrollment[]> => {
    const response = await authAxios.get<Enrollment[]>('/enrollments/');
    return response.data;
  },
  listByEntity: async (entityId: string): Promise<Enrollment[]> => {
    const response = await authAxios.get<Enrollment[]>(`/enrollments/entity/${entityId}`);
    return response.data;
  },
  create: async (data: {
    entity_id: string;
    dimension_value_ids?: string[];
    meta?: Record<string, unknown>;
    is_active?: boolean;
  }): Promise<Enrollment> => {
    const response = await authAxios.post<Enrollment>('/enrollments/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Enrollment>): Promise<Enrollment> => {
    const response = await authAxios.put<Enrollment>(`/enrollments/${id}`, data);
    return response.data;
  },
  updateDimensions: async (id: string, dimensionValueIds: string[]): Promise<Enrollment> => {
    const response = await authAxios.put<Enrollment>(`/enrollments/${id}/dimensions`, dimensionValueIds);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/enrollments/${id}`);
    return response.data;
  },
};
