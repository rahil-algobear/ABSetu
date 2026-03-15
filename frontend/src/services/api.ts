import authAxios, { publicAxios } from './axios';
import {
  Attendance,
  Beneficiary,
  Center,
  Enrollment,
  EntityType,
  Facilitator,
  LoginResponse,
  MetaFieldDefinition,
  MetaFieldSchemas,
  OTPVerifyData,
  Organization,
  Permission,
  Programme,
  ProgrammeCenter,
  Role,
  Session,
  SessionTemplate,
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
  get: async (entityType: EntityType): Promise<MetaFieldDefinition[]> => {
    const response = await authAxios.get<MetaFieldDefinition[]>(
      `/organization/meta-field-schemas/${entityType}`
    );
    return response.data;
  },
  update: async (entityType: EntityType, fields: MetaFieldDefinition[]): Promise<MetaFieldDefinition[]> => {
    const response = await authAxios.put<MetaFieldDefinition[]>(
      `/organization/meta-field-schemas/${entityType}`,
      fields
    );
    return response.data;
  },
};

// --- Centers ---

export const centerApi = {
  list: async (): Promise<Center[]> => {
    const response = await authAxios.get<Center[]>('/organization/centers');
    return response.data;
  },
  get: async (id: string): Promise<Center> => {
    const response = await authAxios.get<Center>(`/organization/centers/${id}`);
    return response.data;
  },
  create: async (data: { name: string; code: string; address?: string; meta?: Record<string, unknown> }): Promise<Center> => {
    const response = await authAxios.post<Center>('/organization/centers', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Center>): Promise<Center> => {
    const response = await authAxios.put<Center>(`/organization/centers/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/organization/centers/${id}`);
    return response.data;
  },
};

// --- Programmes ---

export const programmeApi = {
  list: async (): Promise<Programme[]> => {
    const response = await authAxios.get<Programme[]>('/organization/programmes');
    return response.data;
  },
  get: async (id: string): Promise<Programme> => {
    const response = await authAxios.get<Programme>(`/organization/programmes/${id}`);
    return response.data;
  },
  create: async (data: { name: string; description?: string; meta?: Record<string, unknown> }): Promise<Programme> => {
    const response = await authAxios.post<Programme>('/organization/programmes', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Programme>): Promise<Programme> => {
    const response = await authAxios.put<Programme>(`/organization/programmes/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/organization/programmes/${id}`);
    return response.data;
  },
};

// --- Programme-Centers ---

export const programmeCenterApi = {
  list: async (): Promise<ProgrammeCenter[]> => {
    const response = await authAxios.get<ProgrammeCenter[]>('/organization/programme-centers');
    return response.data;
  },
  create: async (data: { programme_id: string; center_id: string }): Promise<ProgrammeCenter> => {
    const response = await authAxios.post<ProgrammeCenter>('/organization/programme-centers', data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/organization/programme-centers/${id}`);
    return response.data;
  },
};

// --- Session Templates ---

export const sessionTemplateApi = {
  list: async (): Promise<SessionTemplate[]> => {
    const response = await authAxios.get<SessionTemplate[]>('/session-templates/');
    return response.data;
  },
  get: async (id: string): Promise<SessionTemplate> => {
    const response = await authAxios.get<SessionTemplate>(`/session-templates/${id}`);
    return response.data;
  },
  create: async (data: { name: string; description?: string; meta?: Record<string, unknown> }): Promise<SessionTemplate> => {
    const response = await authAxios.post<SessionTemplate>('/session-templates/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<SessionTemplate>): Promise<SessionTemplate> => {
    const response = await authAxios.put<SessionTemplate>(`/session-templates/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/session-templates/${id}`);
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

// --- Sessions ---

export const sessionApi = {
  list: async (): Promise<Session[]> => {
    const response = await authAxios.get<Session[]>('/sessions/');
    return response.data;
  },
  get: async (id: string): Promise<Session> => {
    const response = await authAxios.get<Session>(`/sessions/${id}`);
    return response.data;
  },
  create: async (data: {
    session_template_id: string;
    programme_center_id: string;
    date: string;
    notes?: string;
    facilitator_ids?: string[];
    meta?: Record<string, unknown>;
  }): Promise<Session> => {
    const response = await authAxios.post<Session>('/sessions/', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Session>): Promise<Session> => {
    const response = await authAxios.put<Session>(`/sessions/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await authAxios.delete(`/sessions/${id}`);
    return response.data;
  },
  getAttendance: async (sessionId: string): Promise<Attendance[]> => {
    const response = await authAxios.get<Attendance[]>(`/sessions/${sessionId}/attendance`);
    return response.data;
  },
  markAttendance: async (sessionId: string, records: { beneficiary_id: string; status: string }[]): Promise<Attendance[]> => {
    const response = await authAxios.post<Attendance[]>(`/sessions/${sessionId}/attendance`, { records });
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
  create: async (data: { name: string; meta?: Record<string, unknown> }): Promise<Beneficiary> => {
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
    programme_center_id: string;
    admission_date: string;
    release_date?: string;
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
