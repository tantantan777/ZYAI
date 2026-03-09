import api from '../utils/api';

export interface SendCodeRequest {
  email: string;
}

export interface LoginRequest {
  email: string;
  code: string;
  remember?: boolean;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: number;
    email: string;
  };
}

export interface VerifyResponse {
  message: string;
  user: {
    id: number;
    email: string;
    created_at: string;
    last_login: string;
  };
}

export const authService = {
  // 发送验证码
  sendCode: async (email: string) => {
    const response = await api.post<{ message: string; cooldownTime: number }>('/auth/send-code', { email });
    return response.data;
  },

  // 登录/注册
  login: async (data: LoginRequest) => {
    const response = await api.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  // 验证token
  verify: async () => {
    const response = await api.get<VerifyResponse>('/auth/verify');
    return response.data;
  },
};
