import authAxios, { publicAxios } from './axios';
import {
  Activity,
  ActivityCategory,
  ActivityParticipant,
  ActivityType,
  Dimension,
  DimensionValue,
  Enrollment,
  Entity,
  EntityType,
  LoginResponse,
  MetaFieldDefinition,
  MetaFieldSchemas,
  OTPVerifyData,
  Organization,
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

export const metaFieldSchemaApi = {
  getAll: async (): Promise<MetaFieldSchemas> => {
    const response = await authAxios.get<MetaFieldSchemas>('/organization/meta-field-schemas');
    return response.data;
  },
  get: async (entityType: string): Promise<MetaFieldDefinition[]> => {
    const response = await authAxios.get<MetaFieldDefinition[]>(
      `/organization/meta-field-schemas/${entityType}`
    );
    return response.data;
  },
  update: async (entityType: string, fields: MetaFieldDefinition[]): Promise<MetaFieldDefinition[]> => {
    const response = await authAxios.put<MetaFieldDefinition[]>(
      `/organization/meta-field-schemas/${entityType}`,
      fields
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
  create: async (data: { name: string; key: string; sort_order?: number }): Promise<Dimension> => {
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
  // Dimension values
  listValues: async (dimensionId: string): Promise<DimensionValue[]> => {
    const response = await authAxios.get<DimensionValue[]>(`/dimensions/${dimensionId}/values`);
    return response.data;
  },
  createValue: async (dimensionId: string, data: { name: string; code: string; sort_order?: number; meta?: Record<string, unknown> }): Promise<DimensionValue> => {
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
  create: async (data: { name: string; key: string; config?: Record<string, unknown>; sort_order?: number }): Promise<EntityType> => {
    const response = await authAxios.post<EntityType>('/entity-types/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; config?: Record<string, unknown>; sort_order?: number }): Promise<EntityType> => {
    const response = await authAxios.put<EntityType>(`/entity-types/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/entity-types/${id}`);
    return response.data;
  },
};

// --- Entities ---

export const entityApi = {
  list: async (entityTypeId?: string): Promise<Entity[]> => {
    const params = entityTypeId ? `?entity_type_id=${entityTypeId}` : '';
    const response = await authAxios.get<Entity[]>(`/entities/${params}`);
    return response.data;
  },
  get: async (id: string): Promise<Entity> => {
    const response = await authAxios.get<Entity>(`/entities/${id}`);
    return response.data;
  },
  create: async (data: { entity_type_id: string; name: string; dimension_value_ids?: string[]; meta?: Record<string, unknown> }): Promise<Entity> => {
    const response = await authAxios.post<Entity>('/entities/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; meta?: Record<string, unknown> }): Promise<Entity> => {
    const response = await authAxios.put<Entity>(`/entities/${id}`, data);
    return response.data;
  },
  updateTags: async (id: string, dimensionValueIds: string[]): Promise<Entity> => {
    const response = await authAxios.put<Entity>(`/entities/${id}/tags`, dimensionValueIds);
    return response.data;
  },
};

// --- Activity Categories ---

export const activityCategoryApi = {
  list: async (): Promise<ActivityCategory[]> => {
    const response = await authAxios.get<ActivityCategory[]>('/activity-categories/');
    return response.data;
  },
  get: async (id: string): Promise<ActivityCategory> => {
    const response = await authAxios.get<ActivityCategory>(`/activity-categories/${id}`);
    return response.data;
  },
  create: async (data: { name: string; key: string; sections?: Record<string, unknown>[]; sort_order?: number }): Promise<ActivityCategory> => {
    const response = await authAxios.post<ActivityCategory>('/activity-categories/', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; sections?: Record<string, unknown>[]; sort_order?: number }): Promise<ActivityCategory> => {
    const response = await authAxios.put<ActivityCategory>(`/activity-categories/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/activity-categories/${id}`);
    return response.data;
  },
};

// --- Activity Types ---

export const activityTypeApi = {
  list: async (categoryId?: string): Promise<ActivityType[]> => {
    const params = categoryId ? `?category_id=${categoryId}` : '';
    const response = await authAxios.get<ActivityType[]>(`/activity-types/${params}`);
    return response.data;
  },
  get: async (id: string): Promise<ActivityType> => {
    const response = await authAxios.get<ActivityType>(`/activity-types/${id}`);
    return response.data;
  },
  create: async (data: { name: string; category_id?: string; description?: string; meta?: Record<string, unknown> }): Promise<ActivityType> => {
    const response = await authAxios.post<ActivityType>('/activity-types/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<ActivityType>): Promise<ActivityType> => {
    const response = await authAxios.put<ActivityType>(`/activity-types/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/activity-types/${id}`);
    return response.data;
  },
};

// --- Activities ---

export const activityApi = {
  list: async (): Promise<Activity[]> => {
    const response = await authAxios.get<Activity[]>('/activities/');
    return response.data;
  },
  get: async (id: string): Promise<Activity> => {
    const response = await authAxios.get<Activity>(`/activities/${id}`);
    return response.data;
  },
  create: async (data: {
    activity_type_id: string;
    date: string;
    notes?: string;
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
    admission_date: string;
    release_date?: string;
    dimension_value_ids?: string[];
    meta?: Record<string, unknown>;
  }): Promise<Enrollment> => {
    const response = await authAxios.post<Enrollment>('/enrollments/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Enrollment>): Promise<Enrollment> => {
    const response = await authAxios.put<Enrollment>(`/enrollments/${id}`, data);
    return response.data;
  },
};
