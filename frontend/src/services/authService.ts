import api from '../utils/api';

export interface SendCodeRequest {
  email: string;
}

export interface RegistrationOrgUnit {
  id: number;
  name: string;
}

export interface RegistrationOrgDepartment {
  id: number;
  unitId: number;
  name: string;
}

export interface RegistrationOrgPosition {
  id: number;
  departmentId: number;
  name: string;
}

export interface LoginRequest {
  email: string;
  code: string;
  remember?: boolean;
  name?: string;
  gender?: 'male' | 'female';
  phone?: string;
  hireDate?: string;
  positionId?: number;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: number;
    email: string;
    dashboardVisible?: boolean;
    aiChatVisible?: boolean;
    projectsVisible?: boolean;
    userQueryVisible?: boolean;
    systemSettingsVisible?: boolean;
  };
}

export interface VerifyResponse {
  message: string;
  user: {
    id: number;
    email: string;
    created_at: string;
    last_login: string;
    dashboardVisible?: boolean;
    aiChatVisible?: boolean;
    projectsVisible?: boolean;
    userQueryVisible?: boolean;
    systemSettingsVisible?: boolean;
  };
}

export const authService = {
  sendCode: async (email: string) => {
    const response = await api.post<{ message: string; cooldownTime: number; isExistingUser: boolean }>(
      '/auth/send-code',
      { email },
    );
    return response.data;
  },

  login: async (data: LoginRequest) => {
    const response = await api.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  verify: async () => {
    const response = await api.get<VerifyResponse>('/auth/verify');
    return response.data;
  },

  getRegistrationOrgStructure: async () => {
    const response = await api.get<{
      units: RegistrationOrgUnit[];
      departments: RegistrationOrgDepartment[];
      positions: RegistrationOrgPosition[];
    }>('/auth/registration-org-structure');
    return response.data;
  },
};
