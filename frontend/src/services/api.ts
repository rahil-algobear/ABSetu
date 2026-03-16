import authAxios, { publicAxios } from './axios';
import {
  Activity,
  ActivityType,
  Beneficiary,
  Dimension,
  DimensionValue,
  Enrollment,
  Facilitator,
  LoginResponse,
  MetaFieldDefinition,
  MetaFieldSchemas,
  OTPVerifyData,
  Organization,
  Participation,
  Permission,
  Role,
  TagRule,
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

// --- Tag Rules ---

export const tagRuleApi = {
  list: async (dimensionId1?: string, dimensionId2?: string): Promise<TagRule[]> => {
    const params = new URLSearchParams();
    if (dimensionId1) params.set('dimension_id_1', dimensionId1);
    if (dimensionId2) params.set('dimension_id_2', dimensionId2);
    const response = await authAxios.get<TagRule[]>(`/tag-rules/?${params.toString()}`);
    return response.data;
  },
  create: async (data: { dimension_value_id_1: string; dimension_value_id_2: string }): Promise<TagRule> => {
    const response = await authAxios.post<TagRule>('/tag-rules/', data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/tag-rules/${id}`);
    return response.data;
  },
  bulkSync: async (data: { dimension_id_1: string; dimension_id_2: string; pairs: [string, string][] }): Promise<TagRule[]> => {
    const response = await authAxios.post<TagRule[]>('/tag-rules/bulk', data);
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
  create: async (data: { name: string; description?: string; meta?: Record<string, unknown> }): Promise<ActivityType> => {
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

// --- Facilitators ---

export const facilitatorApi = {
  list: async (): Promise<Facilitator[]> => {
    const response = await authAxios.get<Facilitator[]>('/facilitators/');
    return response.data;
  },
  get: async (id: string): Promise<Facilitator> => {
    const response = await authAxios.get<Facilitator>(`/facilitators/${id}`);
    return response.data;
  },
  create: async (data: { name: string; contact?: string; meta?: Record<string, unknown> }): Promise<Facilitator> => {
    const response = await authAxios.post<Facilitator>('/facilitators/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Facilitator>): Promise<Facilitator> => {
    const response = await authAxios.put<Facilitator>(`/facilitators/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/facilitators/${id}`);
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
    facilitator_ids?: string[];
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
  getParticipations: async (activityId: string): Promise<Participation[]> => {
    const response = await authAxios.get<Participation[]>(`/activities/${activityId}/participations`);
    return response.data;
  },
  markParticipations: async (activityId: string, records: { beneficiary_id: string; status: string; meta?: Record<string, unknown> }[]): Promise<Participation[]> => {
    const response = await authAxios.post<Participation[]>(`/activities/${activityId}/participations`, { records });
    return response.data;
  },
};

// --- Beneficiaries ---

export const beneficiaryApi = {
  list: async (): Promise<Beneficiary[]> => {
    const response = await authAxios.get<Beneficiary[]>('/beneficiaries/');
    return response.data;
  },
  get: async (id: string): Promise<Beneficiary> => {
    const response = await authAxios.get<Beneficiary>(`/beneficiaries/${id}`);
    return response.data;
  },
  create: async (data: { name: string; dimension_value_ids?: string[]; meta?: Record<string, unknown> }): Promise<Beneficiary> => {
    const response = await authAxios.post<Beneficiary>('/beneficiaries/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Beneficiary>): Promise<Beneficiary> => {
    const response = await authAxios.put<Beneficiary>(`/beneficiaries/${id}`, data);
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
  listByBeneficiary: async (beneficiaryId: string): Promise<Enrollment[]> => {
    const response = await authAxios.get<Enrollment[]>(`/enrollments/beneficiary/${beneficiaryId}`);
    return response.data;
  },
  create: async (data: {
    beneficiary_id: string;
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
