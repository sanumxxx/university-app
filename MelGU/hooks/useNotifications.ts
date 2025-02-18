// types/notifications.ts
export interface Notification {
  id: number;
  title: string;
  body: string;
  type: 'message' | 'grade' | 'system';
  reference_id?: number;
  payload?: any;
  is_read: boolean;
  created_at: string;
}

// hooks/useNotifications.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import * as ExpoNotifications from 'expo-notifications';
import { NotificationService } from '../src/utils/notifications';
import { apiRequest } from '../src/api/config';
import { useAuthStore } from '../src/store/auth';
import { router } from 'expo-router';
import { Notification } from '../src/types/notifications';

export const useNotifications = () => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationListener = useRef<ExpoNotifications.Subscription>();
  const responseListener = useRef<ExpoNotifications.Subscription>();
  const { user } = useAuthStore();

  // Загрузка уведомлений
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await apiRequest<{
        success: boolean;
        notifications: Notification[];
        total: number;
      }>(`/notifications?user_id=${user.id}`);

      if (response.success) {
        setNotifications(response.notifications);
        setUnreadCount(response.notifications.filter(n => !n.is_read).length);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Обновление списка уведомлений (pull-to-refresh)
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  // Регистрация push-токена
  const registerForPushNotifications = async () => {
    try {
      const token = await NotificationService.registerForPushNotifications();
      if (token && user?.id) {
        setExpoPushToken(token);
        await apiRequest('/push-token', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.id,
            token: token
          })
        });
      }
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }
  };

  // Отметка уведомлений как прочитанных
  const markAsRead = async (notificationIds: number[]) => {
    try {
      const response = await apiRequest('/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user?.id,
          notification_ids: notificationIds
        })
      });

      if (response.success) {
        setNotifications(prev =>
          prev.map(notification =>
            notificationIds.includes(notification.id)
              ? { ...notification, is_read: true }
              : notification
          )
        );
        setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  // Обработка нажатия на уведомление
  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead([notification.id]);
    }

    // Навигация в зависимости от типа уведомления
    switch (notification.type) {
      case 'message':
        router.push('/(tabs)/messages');
        break;
      case 'grade':
        router.push('/(tabs)/journal');
        break;
      case 'system':
        // Обработка системных уведомлений
        break;
    }
  };

  // Инициализация слушателей уведомлений
  useEffect(() => {
    registerForPushNotifications();
    fetchNotifications();

    notificationListener.current = NotificationService.addNotificationReceivedListener(
      notification => {
        fetchNotifications(); // Обновляем список при получении нового уведомления
      }
    );

    responseListener.current = NotificationService.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data as Notification;
        handleNotificationPress(data);
      }
    );

    return () => {
      if (notificationListener.current) {
        NotificationService.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        NotificationService.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user]);

  return {
    notifications,
    loading,
    refreshing,
    unreadCount,
    expoPushToken,
    fetchNotifications,
    onRefresh,
    markAsRead,
    handleNotificationPress
  };
};