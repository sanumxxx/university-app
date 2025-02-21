import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  TouchableOpacity
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../../src/store/auth';
import { apiRequest } from '../../../src/api/config';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#4c6793',
  secondary: '#7189b9',
  background: '#f8f9fa',
  card: '#ffffff',
  text: {
    primary: '#202124',
    secondary: '#5f6368',
    light: '#ffffff',
  }
};

interface Announcement {
  id: number;
  title: string;
  content: string;
  teacher_name: string;
  recipient_type: 'group' | 'all';
  recipient_id?: string;
  is_pinned: boolean;
  created_at: string;
}

export default function AnnouncementView() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncement = async () => {
    try {
      const response = await apiRequest<{ success: boolean; announcement: Announcement }>(
        `/announcements/${id}`
      );
      if (response.success) {
        setAnnouncement(response.announcement);
      }
    } catch (error) {
      console.error('Error fetching announcement:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncement();
  }, [id]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Опции для заголовка
  const HeaderRight = () => {
    if (user?.role !== 'teacher') return null;

    return (
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          // Добавить логику редактирования объявления
        }}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!announcement) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Объявление не найдено</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Объявление",
          headerRight: HeaderRight,
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: '#fff',
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.card}>
          {announcement.is_pinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={16} color={COLORS.primary} />
              <Text style={styles.pinnedText}>Закреплено</Text>
            </View>
          )}

          <Text style={styles.title}>{announcement.title}</Text>

          <View style={styles.metaContainer}>
            <Text style={styles.authorText}>
              {announcement.teacher_name}
            </Text>
            <Text style={styles.dateText}>
              {formatDate(announcement.created_at)}
            </Text>
          </View>

          {announcement.recipient_type === 'group' && (
            <View style={styles.recipientBadge}>
              <Text style={styles.recipientText}>
                Группа: {announcement.recipient_id}
              </Text>
            </View>
          )}

          <Text style={styles.content}>{announcement.content}</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    margin: 16,
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
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}10`,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  pinnedText: {
    fontSize: 12,
    color: COLORS.primary,
    marginLeft: 4,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  authorText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  recipientBadge: {
    backgroundColor: `${COLORS.secondary}10`,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  recipientText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  content: {
    fontSize: 16,
    color: COLORS.text.primary,
    lineHeight: 24,
  },
});