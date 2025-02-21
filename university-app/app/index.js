import { useState, useEffect } from 'react';
import {
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Text,
  Alert,
  ActivityIndicator,
    ActionSheetIOS
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../utils/config';




export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    userType: '',
    group: '',
    teacher: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [groupsResponse, teachersResponse] = await Promise.all([

        axios.get(`${API_URL}/groups`),
        axios.get(`${API_URL}/teachers`)
      ]);
      setGroups(groupsResponse.data);
      setTeachers(teachersResponse.data);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsLoading(true);

      if (!formData.email || !formData.password) {
        Alert.alert('Ошибка', 'Заполните все обязательные поля');
        return;
      }

      const endpoint = isLogin ? 'login' : 'register';
      const response = await axios.post(`${API_URL}/${endpoint}`, formData);

      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));

      router.replace('/(tabs)/schedule');
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error.response?.data?.error || 'Произошла ошибка'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showActionSheet = (type) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: type === 'userType'
            ? ['Отмена', 'Студент', 'Преподаватель']
            : type === 'group'
              ? ['Отмена', ...groups]
              : ['Отмена', ...teachers],
          cancelButtonIndex: 0,
          title: getActionSheetTitle(type)
        },
        (buttonIndex) => {
          if (buttonIndex !== 0) {
            handleActionSheetSelect(type, buttonIndex);
          }
        }
      );
    }
  };

  const getActionSheetTitle = (type) => {
    switch (type) {
      case 'userType':
        return 'Выберите тип пользователя';
      case 'group':
        return 'Выберите группу';
      case 'teacher':
        return 'Выберите преподавателя';
      default:
        return '';
    }
  };

  const handleActionSheetSelect = (type, index) => {
    const value = type === 'userType'
      ? index === 1 ? 'student' : 'teacher'
      : type === 'group'
        ? groups[index - 1]
        : teachers[index - 1];

    setFormData(prev => ({ ...prev, [type]: value }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formContainer}>
            <Text style={styles.title}>
              {isLogin ? 'Вход' : 'Регистрация'}
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={formData.email}
                onChangeText={(value) => setFormData(prev => ({ ...prev, email: value }))}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { paddingRight: 50 }]}
                placeholder="Пароль"
                placeholderTextColor="#999"
                value={formData.password}
                onChangeText={(value) => setFormData(prev => ({ ...prev, password: value }))}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.passwordIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={24}
                  color="#999"
                />
              </TouchableOpacity>
            </View>

            {!isLogin && (
  <>
    {/* Показываем поле ФИО только для студента */}
    {formData.userType !== 'teacher' && (
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="ФИО"
          placeholderTextColor="#999"
          value={formData.fullName}
          onChangeText={(value) => setFormData(prev => ({ ...prev, fullName: value }))}
        />
      </View>
    )}

    <TouchableOpacity
      style={styles.selectButton}
      onPress={() => showActionSheet('userType')}
    >
      <Text style={[
        styles.selectButtonText,
        !formData.userType && styles.placeholderText
      ]}>
        {formData.userType
          ? formData.userType === 'student' ? 'Студент' : 'Преподаватель'
          : 'Выберите тип пользователя'}
      </Text>
      <Ionicons name="chevron-down" size={24} color="#999" />
    </TouchableOpacity>

    {formData.userType === 'student' && (
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => showActionSheet('group')}
      >
        <Text style={[
          styles.selectButtonText,
          !formData.group && styles.placeholderText
        ]}>
          {formData.group || 'Выберите группу'}
        </Text>
        <Ionicons name="chevron-down" size={24} color="#999" />
      </TouchableOpacity>
    )}

    {formData.userType === 'teacher' && (
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => showActionSheet('teacher')}
      >
        <Text style={[
          styles.selectButtonText,
          !formData.teacher && styles.placeholderText
        ]}>
          {formData.teacher || 'Выберите преподавателя'}
        </Text>
        <Ionicons name="chevron-down" size={24} color="#999" />
      </TouchableOpacity>
    )}
  </>
)}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsLogin(!isLogin);
                setFormData({
                  email: '',
                  password: '',
                  fullName: '',
                  userType: '',
                  group: '',
                  teacher: ''
                });
              }}
              style={styles.switchButton}
            >
              <Text style={styles.switchButtonText}>
                {isLogin ? 'Создать аккаунт' : 'Уже есть аккаунт?'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  formContainer: {
    padding: 20,
    marginHorizontal: 16,
    marginTop: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 5,
  },
  input: {
    height: 50,
    paddingHorizontal: 16,
    fontSize: 17,
    color: '#000',
  },
  passwordIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  selectButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 16,
    height: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectButtonText: {
    fontSize: 17,
    color: '#000',
  },
  placeholderText: {
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#007AFF',
    fontSize: 17,
  },
});