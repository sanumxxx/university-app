import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { SelectList } from 'react-native-dropdown-select-list';
import { authAPI } from '../../src/api/auth';

interface Group {
  group_name: string;
  course: number;
}

export default function Register() {
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [isLoading, setIsLoading] = useState(false);
  const [isTeachersLoading, setIsTeachersLoading] = useState(false);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    selectedGroup: '',
    selectedTeacher: ''
  });

  const [teachers, setTeachers] = useState<Array<{key: string, value: string}>>([]);
  const [groups, setGroups] = useState<Array<{key: string, value: string}>>([]);

  const fetchGroups = async () => {
    try {
      setIsGroupsLoading(true);
      const data = await authAPI.getGroups();
      const formattedGroups = data.map((group, index) => ({
        key: index.toString(),
        value: `${group.group_name} (${group.course} курс)`
      }));
      setGroups(formattedGroups);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список групп');
    } finally {
      setIsGroupsLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      setIsTeachersLoading(true);
      const data = await authAPI.getTeachers();
      if (data.success) {
        const formattedTeachers = data.teachers.map((name, index) => ({
          key: index.toString(),
          value: name
        }));
        setTeachers(formattedTeachers);
      } else {
        Alert.alert('Ошибка', 'Не удалось загрузить список преподавателей');
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список преподавателей');
    } finally {
      setIsTeachersLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'teacher') {
      fetchTeachers();
    } else {
      fetchGroups();
    }
  }, [role]);

  const handleRegister = async () => {
    if (!form.email || !form.password) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }

    if (form.password !== form.confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    try {
      setIsLoading(true);

      let registerData;
      if (role === 'student') {
        const groupMatch = form.selectedGroup.match(/(.+) \((\d+) курс\)/);
        if (!groupMatch) {
          Alert.alert('Ошибка', 'Неверный формат группы');
          return;
        }
        const [, groupName, course] = groupMatch;

        registerData = {
          email: form.email,
          password: form.password,
          role: 'student',
          full_name: form.fullName,
          group_name: groupName,
          course: parseInt(course)
        };
      } else {
        if (!form.selectedTeacher) {
          Alert.alert('Ошибка', 'Выберите преподавателя');
          return;
        }

        registerData = {
          email: form.email,
          password: form.password,
          role: 'teacher',
          full_name: form.selectedTeacher
        };
      }

      const response = await authAPI.register(registerData);

      if (response.success) {
        Alert.alert('Успешно', 'Регистрация прошла успешно', [
          { text: 'OK', onPress: () => router.replace('/login') }
        ]);
      } else {
        Alert.alert('Ошибка', response.error || 'Не удалось зарегистрироваться');
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось зарегистрироваться');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Регистрация</Text>

      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[styles.roleButton, role === 'student' && styles.roleButtonActive]}
          onPress={() => setRole('student')}
        >
          <Text style={[styles.roleText, role === 'student' && styles.roleTextActive]}>
            Студент
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, role === 'teacher' && styles.roleButtonActive]}
          onPress={() => setRole('teacher')}
        >
          <Text style={[styles.roleText, role === 'teacher' && styles.roleTextActive]}>
            Преподаватель
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={form.email}
        onChangeText={(text) => setForm({ ...form, email: text })}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Пароль"
        value={form.password}
        onChangeText={(text) => setForm({ ...form, password: text })}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Подтвердите пароль"
        value={form.confirmPassword}
        onChangeText={(text) => setForm({ ...form, confirmPassword: text })}
        secureTextEntry
      />

      {role === 'student' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="ФИО"
            value={form.fullName}
            onChangeText={(text) => setForm({ ...form, fullName: text })}
          />

          <View style={styles.dropdownContainer}>
            {isGroupsLoading ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <SelectList
                setSelected={(val: string) => setForm({ ...form, selectedGroup: val })}
                data={groups}
                save="value"
                placeholder="Выберите группу"
                search={true}
                searchPlaceholder="Поиск группы"
              />
            )}
          </View>
        </>
      )}

      {role === 'teacher' && (
        <View style={styles.dropdownContainer}>
          {isTeachersLoading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : teachers.length > 0 ? (
            <SelectList
              setSelected={(val: string) => setForm({ ...form, selectedTeacher: val })}
              data={teachers}
              save="value"
              placeholder="Выберите преподавателя"
              search={true}
              searchPlaceholder="Поиск преподавателя"
            />
          ) : (
            <Text style={styles.noTeachersText}>
              Нет доступных преподавателей для регистрации
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Зарегистрироваться</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.replace('/login')}
      >
        <Text style={styles.linkText}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  roleButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#007AFF',
  },
  roleText: {
    fontSize: 16,
    color: '#007AFF',
  },
  roleTextActive: {
    color: 'white',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  dropdownContainer: {
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  noTeachersText: {
    color: '#666',
    textAlign: 'center',
    padding: 10,
  },
});