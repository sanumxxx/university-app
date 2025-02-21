import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  Switch,
  Linking,
  Share
} from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { NotificationService } from '../../src/utils/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
  primary: '#4c6793',
  secondary: '#7189b9',
  accent: '#ffffff',
  background: '#f8f9fa',
  card: '#ffffff',
  text: {
    primary: '#202124',
    secondary: '#5f6368',
    light: '#ffffff',
    error: '#FF3B30',
  },
};

export default function Profile() {
  const { user, logout, addSavedAccount } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [lastActiveTime, setLastActiveTime] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadLastActiveTime();
    updateLastActiveTime();
  }, []);

  const loadSettings = async () => {
    try {
      const notifications = await AsyncStorage.getItem('notificationsEnabled');
      const theme = await AsyncStorage.getItem('darkMode');
      setNotificationsEnabled(notifications !== 'false');
      setDarkMode(theme === 'true');
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadLastActiveTime = async () => {
    try {
      const time = await AsyncStorage.getItem('lastActiveTime');
      setLastActiveTime(time);
    } catch (error) {
      console.error('Error loading last active time:', error);
    }
  };

  const updateLastActiveTime = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem('lastActiveTime', now);
    setLastActiveTime(now);
  };

  const handleLogout = () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        {
          text: 'Отмена',
          style: 'cancel'
        },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось выйти из системы');
            }
          }
        }
      ]
    );
  };

  const handleSwitchAccount = async () => {
    try {
      if (!user) return;
      const { full_name, email, role, id, group_name, course } = user;
      await addSavedAccount({ full_name, email, role, id, group_name, course });
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сменить аккаунт');
    }
  };

  const toggleNotifications = async (value: boolean) => {
    try {
      setNotificationsEnabled(value);
      await AsyncStorage.setItem('notificationsEnabled', value.toString());
      if (value) {
        await NotificationService.registerOnServer(user?.id || 0);
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
    }
  };

  const toggleDarkMode = async (value: boolean) => {
    try {
      setDarkMode(value);
      await AsyncStorage.setItem('darkMode', value.toString());
    } catch (error) {
      console.error('Error toggling dark mode:', error);
    }
  };

  const shareProfile = async () => {
    try {
      const message = `${user?.full_name} - ${user?.role === 'teacher' ? 'Преподаватель' : 'Студент'}\n${user?.email}`;
      await Share.share({
        message,
        title: 'Профиль пользователя'
      });
    } catch (error) {
      console.error('Error sharing profile:', error);
    }
  };

  const openSupport = () => {
    Linking.openURL('mailto:support@example.com?subject=Support%20Request');
  };

  const ProfileItem = ({ icon, label, value }: { icon: string, label: string, value: string }) => (
    <View style={styles.profileItem}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon as any} size={24} color={COLORS.primary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemValue}>{value}</Text>
      </View>
    </View>
  );

  const SettingsSwitch = ({
    icon,
    label,
    value,
    onValueChange
  }: {
    icon: string,
    label: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  }) => (
    <View style={styles.settingsItem}>
      <View style={styles.settingsLeft}>
        <Ionicons name={icon as any} size={24} color={COLORS.primary} style={styles.settingsIcon} />
        <Text style={styles.settingsLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E0E0E0', true: COLORS.primary }}
        thumbColor={COLORS.accent}
      />
    </View>
  );

  if (!user) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.role}>
            {user.role === 'teacher' ? 'Преподаватель' : 'Студент'}
          </Text>
          <TouchableOpacity onPress={shareProfile} style={styles.shareButton}>
            <Ionicons name="share-outline" size={20} color={COLORS.text.light} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {/* Основная информация */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Основная информация</Text>
          <View style={styles.card}>
            <ProfileItem
              icon="mail-outline"
              label="Email"
              value={user.email}
            />
            {user.role === 'student' && (
              <>
                <View style={styles.separator} />
                <ProfileItem
                  icon="people-outline"
                  label="Группа"
                  value={user.group_name || ''}
                />
                <View style={styles.separator} />
                <ProfileItem
                  icon="school-outline"
                  label="Курс"
                  value={String(user.course || '')}
                />
              </>
            )}
          </View>
        </View>

        {/* Настройки */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Настройки</Text>
          <View style={styles.card}>
            <SettingsSwitch
              icon="notifications-outline"
              label="Уведомления"
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
            />
            <View style={styles.separator} />
            <SettingsSwitch
              icon="moon-outline"
              label="Темная тема"
              value={darkMode}
              onValueChange={toggleDarkMode}
            />
          </View>
        </View>

        {/* Активность */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Активность</Text>
          <View style={styles.card}>
            <View style={styles.statsItem}>
              <Ionicons name="time-outline" size={24} color={COLORS.primary} />
              <Text style={styles.statsText}>
                Последняя активность: {lastActiveTime
                  ? new Date(lastActiveTime).toLocaleString()
                  : 'Неизвестно'}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.statsItem}>
              <Ionicons name="mail-outline" size={24} color={COLORS.primary} />
              <Text style={styles.statsText}>
                Непрочитанных сообщений: {unreadMessages}
              </Text>
            </View>
          </View>
        </View>

        {/* Действия */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={handleSwitchAccount}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={24} color={COLORS.primary} />
            <Text style={styles.accountButtonText}>Сменить аккаунт</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.supportButton}
            onPress={openSupport}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={24} color={COLORS.primary} />
            <Text style={styles.supportButtonText}>Поддержка</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={24} color={COLORS.text.error} />
            <Text style={styles.logoutText}>Выйти</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Версия приложения: 1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text.light,
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    color: COLORS.text.light,
    opacity: 0.8,
  },
  shareButton: {
    position: 'absolute',
    right: 20,
    top: 20,
    padding: 8,
  },
  content: {
    padding: 16,
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  accountButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  supportButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
  },
  logoutText: {
    color: COLORS.text.error,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  versionText: {
    fontSize: 14,
    color: COLORS.text.secondary,

    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 4,
  },
  itemValue: {
    fontSize: 16,
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.background,
    marginHorizontal: -16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsIcon: {
    marginRight: 12,
  },
  settingsLabel: {
    fontSize: 16,
    color: COLORS.text.primary,
  },
  statsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  statsText: {
    fontSize: 14,
    color: COLORS.text.primary,
    flex: 1,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: 24,
  },
  accountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  accountButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  supportButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutText: {
    color: COLORS.text.error,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: Platform.OS === 'ios' ? 40 : 24,
    opacity: 0.7,
  },
  versionText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 8,
  },
  appInfoText: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.text.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: COLORS.text.light,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  statusText: {
    color: COLORS.text.light,
    fontSize: 14,
    fontWeight: '500',
  },
  qrButton: {
    position: 'absolute',
    left: 20,
    top: 20,
    padding: 8,
  }
});