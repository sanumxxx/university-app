import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../../src/store/auth';
import { apiRequest } from '../../../src/api/config';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface Recipient {
  id: number;
  full_name: string;
  group_name?: string;
}

interface Group {
  group_name: string;
  course: number;
  id: number; // Ensure Group interface has an 'id' property
}

export default function NewChat() {
  const { user } = useAuthStore();
  const [type, setType] = useState<'personal' | 'group'>('personal');
  const [search, setSearch] = useState('');
  const [recipients, setRecipients] = useState<(Recipient | Group)[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    const fetchRecipients = async () => {
    try {
      setLoading(true);
      let endpoint;

      if (type === 'personal') {
        endpoint = user?.role === 'student'
          ? `/teachers?search=${encodeURIComponent(search)}`
          : `/students?search=${encodeURIComponent(search)}`;
      } else {
        endpoint = `/groups`; // Базовый endpoint
        if (search) { // Добавляем параметр search, только если есть поисковый запрос
          endpoint += `?search=${encodeURIComponent(search)}`;
        }
      }

      console.log("fetchRecipients: Endpoint запроса:", endpoint); // ЛОГ: URL запроса

      const response = await apiRequest(endpoint);

      console.log("fetchRecipients: Ответ API:", response); // ЛОГ: Полный ответ API

      // Убедимся, что у каждого элемента есть id для keyExtractor
      const processedData = type === 'personal'
        ? response
        : (response as Group[]).map((group: Group, index: number) => ({
            ...group,
            id: index + 1 // Генерируем уникальный id для групп
          }));

      setRecipients(processedData);
      console.log("fetchRecipients: Processed recipients:", processedData); // Log processed recipients

    } catch (error) {
      console.error('Error fetching recipients:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить список получателей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayTimer = setTimeout(() => {
      fetchRecipients();
    }, 300);

    return () => clearTimeout(delayTimer);
  }, [search, type]);

  const createChat = async () => {
    try {
      if (!selectedRecipient && !selectedGroup && type === 'personal') { // Added type check here
        Alert.alert('Ошибка', 'Выберите получателя для личного чата');
        return;
      }
      if (!selectedGroup && type === 'group') { // Added check for group chat
        Alert.alert('Ошибка', 'Выберите группу для группового чата');
        return;
      }


      const endpoint = type === 'personal' ? '/chats/personal' : '/chats/group';
      const body = type === 'personal'
        ? {
            student_id: user?.role === 'student' ? user?.id : selectedRecipient?.id,
            teacher_id: user?.role === 'teacher' ? user?.id : selectedRecipient?.id
          }
        : {
            teacher_id: user?.id,
            group_name: selectedGroup,
            subject: `Групповой чат ${selectedGroup}`
          };

      console.log("Creating chat with endpoint:", endpoint, "body:", body); // Log create chat details

      const response = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      console.log("Create chat API response:", response); // Log create chat response

      if (response.success) {
        router.replace({
          pathname: '/(tabs)/chat/[id]',
          params: { id: response.chat_id }
        });
      } else {
        Alert.alert('Ошибка', response.error || 'Не удалось создать чат');
      }
    } catch (error) {
      console.error('Error creating chat:', error);
      Alert.alert('Ошибка', 'Не удалось создать чат');
    }
  };

  const renderRecipient = ({ item }: { item: Recipient | Group }) => {
    const isGroup = 'course' in item;
    const isSelected = isGroup
      ? selectedGroup === item.group_name
      : selectedRecipient?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.recipientCard, isSelected && styles.selectedCard]}
        onPress={() => {
          if (isGroup) {
            setSelectedGroup(item.group_name);
            setSelectedRecipient(null); // Clear selected recipient when group is selected
          } else {
            setSelectedRecipient(item);
            setSelectedGroup(null); // Clear selected group when recipient is selected
          }
        }}
      >
        <View style={styles.recipientIcon}>
          <Ionicons
            name={type === 'personal' ? 'person' : 'people'}
            size={24}
            color="#4c6793"
          />
        </View>
        <View style={styles.recipientInfo}>
          <Text style={styles.recipientName}>
            {isGroup ? item.group_name : item.full_name}
          </Text>
          {!isGroup && item.group_name && (
            <Text style={styles.recipientGroup}>
              Группа: {item.group_name}
            </Text>
          )}
          {isGroup && (
            <Text style={styles.recipientGroup}>
              Курс: {item.course}
            </Text>
          )}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#4c6793" />
        )}
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: Recipient | Group) => {
    if ('course' in item) {
      return `group-${item.group_name}`;
    }
    return `recipient-${item.id}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Новый чат</Text>
        </View>

        {/* Chat Type Selector - Only for teachers */}
        {user?.role === 'teacher' && (
          <View style={styles.typeContainer}>
            <TouchableOpacity
              style={[styles.typeButton, type === 'personal' && styles.selectedType]}
              onPress={() => {
                setType('personal');
                setSearch(''); // Clear search when changing type
                setRecipients([]); // Clear recipients when changing type
                setSelectedRecipient(null);
                setSelectedGroup(null);
              }}
            >
              <Text style={[
                styles.typeText,
                type === 'personal' && styles.selectedTypeText
              ]}>
                Личный чат
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeButton, type === 'group' && styles.selectedType]}
              onPress={() => {
                setType('group');
                setSearch(''); // Clear search when changing type
                setRecipients([]); // Clear recipients when changing type
                setSelectedRecipient(null);
                setSelectedGroup(null);
                fetchRecipients(); // Fetch groups immediately when switching to group type
              }}
            >
              <Text style={[
                styles.typeText,
                type === 'group' && styles.selectedTypeText
              ]}>
                Групповой чат
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder={type === 'personal' ? "Поиск по имени..." : "Поиск по группе..."}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Recipients List */}
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#4c6793" />
        ) : (
          <FlatList
            data={recipients}
            renderItem={renderRecipient}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {search
                    ? 'Ничего не найдено'
                    : `Начните вводить ${type === 'personal' ? 'имя' : 'группу'} для поиска`
                  }
                </Text>
              </View>
            }
          />
        )}

        {/* Create Button */}
        <TouchableOpacity
          style={[
            styles.createButton,
            (type === 'personal' && !selectedRecipient) || (type === 'group' && !selectedGroup) ? styles.createButtonDisabled : null // Conditional disabling
          ]}
          onPress={createChat}
          disabled={(type === 'personal' && !selectedRecipient) || (type === 'group' && !selectedGroup)} // Conditional disabling
        >
          <Text style={styles.createButtonText}>Создать чат</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 0,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  typeContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f0f0f0',
  },
  selectedType: {
    backgroundColor: '#4c6793',
  },
  typeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  selectedTypeText: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedCard: {
    borderColor: '#4c6793',
    borderWidth: 2,
  },
  recipientIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  recipientGroup: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#4c6793',
    margin: 16,
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