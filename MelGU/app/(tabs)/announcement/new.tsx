import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../../../src/store/auth';
import { apiRequest } from '../../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';

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

interface Group {
  group_name: string;
  course: number;
}

export default function NewAnnouncement() {
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'group'>('all');
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [openDropdown, setOpenDropdown] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Загрузка списка групп
  const fetchGroups = async () => {
    try {
      const response = await apiRequest<{ success: boolean; groups: Group[] }>(
        '/groups'
      );
      if (response.success) {
        setGroups(response.groups);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const createAnnouncement = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }

    if (recipientType === 'group' && !selectedGroup) {
      Alert.alert('Ошибка', 'Выберите группу');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          recipient_type: recipientType,
          recipient_id: recipientType === 'group' ? selectedGroup : undefined,
          is_pinned: isPinned,
          teacher_id: user?.id
        })
      });

      if (response.success) {
        router.back();
      } else {
        Alert.alert('Ошибка', response.error || 'Не удалось создать объявление');
      }
    } catch (error) {
      console.error('Error creating announcement:', error);
      Alert.alert('Ошибка', 'Не удалось создать объявление');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'teacher') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Только преподаватели могут создавать объявления
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Новое объявление",
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: '#fff',
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.card}>
          {/* Заголовок */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Заголовок *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Введите заголовок..."
              maxLength={200}
            />
          </View>

          {/* Текст объявления */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Текст объявления *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={content}
              onChangeText={setContent}
              placeholder="Введите текст объявления..."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          {/* Тип получателей */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Получатели</Text>
            <View style={styles.recipientTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.recipientTypeButton,
                  recipientType === 'all' && styles.activeRecipientType
                ]}
                onPress={() => setRecipientType('all')}
              >
                <Text style={[
                  styles.recipientTypeText,
                  recipientType === 'all' && styles.activeRecipientTypeText
                ]}>
                  Все
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.recipientTypeButton,
                  recipientType === 'group' && styles.activeRecipientType
                ]}
                onPress={() => setRecipientType('group')}
              >
                <Text style={[
                  styles.recipientTypeText,
                  recipientType === 'group' && styles.activeRecipientTypeText
                ]}>
                  Группа
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Выбор группы */}
          {recipientType === 'group' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Выберите группу</Text>
              <DropDownPicker
                open={openDropdown}
                value={selectedGroup}
                items={groups.map(group => ({
                  label: group.group_name,
                  value: group.group_name
                }))}
                setOpen={setOpenDropdown}
                setValue={setSelectedGroup}
                setItems={() => {}}
                placeholder="Выберите группу"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                zIndex={3000}
                zIndexInverse={1000}
              />
            </View>
          )}

          {/* Закрепить объявление */}
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Закрепить объявление</Text>
            <Switch
              value={isPinned}
              onValueChange={setIsPinned}
              trackColor={{ false: '#d1d1d1', true: COLORS.primary + '50' }}
              thumbColor={isPinned ? COLORS.primary : '#f4f3f4'}
              ios_backgroundColor="#d1d1d1"
            />
          </View>

          {/* Кнопка создания */}
          <TouchableOpacity
            style={[
              styles.createButton,
              (!title.trim() || !content.trim() || loading) && styles.createButtonDisabled
            ]}
            onPress={createAnnouncement}
            disabled={!title.trim() || !content.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.createButtonText}>Создать объявление</Text>
            )}
          </TouchableOpacity>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
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
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text.primary,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  recipientTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 4,
  },
  recipientTypeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeRecipientType: {
    backgroundColor: COLORS.primary,
  },
  recipientTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  activeRecipientTypeText: {
    color: '#fff',
  },
  dropdown: {
    borderColor: '#ddd',
    borderRadius: 8,
  },
  dropdownContainer: {
    borderColor: '#ddd',
    backgroundColor: COLORS.card,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchLabel: {
    fontSize: 16,
    color: COLORS.text.primary,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});