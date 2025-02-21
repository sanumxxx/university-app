import { apiRequest } from './config';

interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    id: number;
    email: string;
    role: 'student' | 'teacher';
    full_name: string;
    group_name?: string;
    course?: number;
  };
}

interface LoginCredentials {
  email: string;
  password: string;
}

export const authAPI = {
  async getTeachers() {
    return apiRequest<{ success: boolean; teachers: string[] }>('/available-teachers');
  },

  async getGroups() {
    return apiRequest<Array<{ group_name: string; course: number }>>('/groups');
  },

  async register(data: any) {
    return apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async login(credentials: LoginCredentials) {
    return apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  }
};