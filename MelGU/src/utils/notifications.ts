import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiRequest } from '../api/config';

// Конфигурация обработчика уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class NotificationService {
  static async registerForPushNotifications() {
    try {
      if (!Device.isDevice) {
        throw new Error('Must use physical device for Push Notifications');
      }

      // Запрос разрешений
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        throw new Error('Failed to get push token for push notification!');
      }

      // Настройка для Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Получение токена
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        throw new Error('Project ID is not defined');
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: projectId
      });

      return token.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  static async registerOnServer(userId: number) {
    try {
        if (!userId) {
            console.error('No user ID provided');
            return false;
        }

        console.log('Starting server registration for user:', userId);
        const token = await this.registerForPushNotifications();

        if (!token) {
            console.error('Failed to get push token');
            return false;
        }

        const data = {
            user_id: userId,
            token: token
        };

        console.log('Sending data to server:', data);

        const response = await apiRequest('/push-token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        console.log('Server response:', response);
        return response.success;
    } catch (error) {
        console.error('Error registering on server:', error, 'For user:', userId);
        return false;
    }
}

  static async scheduleLocalNotification(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
      },
      trigger: null // Немедленное уведомление
    }); // Здесь была лишняя закрывающая скобка
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }
}

  static addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  static addNotificationResponseReceivedListener(
    callback: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  static removeNotificationSubscription(subscription: Notifications.Subscription) {
    Notifications.removeNotificationSubscription(subscription);
  }

  static async getBadgeCountAsync() {
    return await Notifications.getBadgeCountAsync();
  }

  static async setBadgeCountAsync(count: number) {
    return await Notifications.setBadgeCountAsync(count);
  }
}