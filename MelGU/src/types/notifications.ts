// src/types/notifications.ts

// Базовый тип для всех уведомлений
export interface BaseNotification {
  id: number;
  title: string;
  body: string;
  type: NotificationType;
  reference_id?: number;
  is_read: boolean;
  created_at: string;
  payload?: NotificationPayload;
}

// Все возможные типы уведомлений
export type NotificationType = 'message' | 'grade' | 'system';

// Общий тип для payload, объединяющий все возможные варианты
export type NotificationPayload = MessagePayload | GradePayload | SystemPayload;

// Payload для уведомлений о сообщениях
export interface MessagePayload {
  sender_name: string;
  message_id: number;
  recipient_type: 'group' | 'student';
  recipient_id: string;
  content_preview: string;
}

// Payload для уведомлений об оценках
export interface GradePayload {
  subject: string;
  grade_value: string;
  semester: string;
  teacher_name: string;
}

// Payload для системных уведомлений
export interface SystemPayload {
  category: 'info' | 'warning' | 'error';
  action?: string;
  data?: Record<string, any>;
}

// Тип для отправки уведомления
export interface SendNotificationParams {
  user_id: number;
  title: string;
  body: string;
  type: NotificationType;
  reference_id?: number;
  payload?: NotificationPayload;
}

// Параметры для получения уведомлений
export interface GetNotificationsParams {
  user_id: number;
  type?: NotificationType;
  page?: number;
  per_page?: number;
}

// Ответ от API с уведомлениями
export interface NotificationsResponse {
  success: boolean;
  notifications: BaseNotification[];
  total: number;
  pages: number;
  current_page: number;
}

// Параметры для отметки уведомлений как прочитанных
export interface MarkAsReadParams {
  notification_ids: number[];
  user_id: number;
}

// Состояние уведомлений в Redux/Context
export interface NotificationState {
  notifications: BaseNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

// Push уведомления
export interface PushNotificationToken {
  user_id: number;
  token: string;
  platform: 'ios' | 'android';
  created_at: string;
}

// Действия с уведомлениями
export type NotificationAction =
  | { type: 'FETCH_NOTIFICATIONS_START' }
  | { type: 'FETCH_NOTIFICATIONS_SUCCESS'; payload: BaseNotification[] }
  | { type: 'FETCH_NOTIFICATIONS_ERROR'; payload: string }
  | { type: 'MARK_AS_READ'; payload: number[] }
  | { type: 'ADD_NOTIFICATION'; payload: BaseNotification }
  | { type: 'UPDATE_UNREAD_COUNT'; payload: number };