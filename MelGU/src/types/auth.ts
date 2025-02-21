export interface LoginData {
  email: string;
  password: string;
}

export interface StudentRegisterData extends LoginData {
  role: 'student';
  full_name: string;
  group_name: string;
  course: number;
}

export interface TeacherRegisterData extends LoginData {
  role: 'teacher';
  full_name: string;
}

export type User = {
  id: number;
  email: string;
  role: 'student' | 'teacher';
  full_name: string;
  group_name?: string;
  course?: number;
};

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
}