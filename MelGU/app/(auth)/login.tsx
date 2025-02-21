import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '../../src/api/auth';
import { useAuthStore } from '../../src/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { NotificationService } from "@/src/utils/notifications";

interface LoginForm {
  email: string;
  password: string;
}

const COLORS = {
  primary: '#007AFF',
  background: 'white',
  text: '#000',
  textSecondary: '#666',
  border: '#ddd',
  error: '#FF3B30',
};

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<LoginForm>({
    email: '',
    password: ''
  });

  const {
    setUser,
    savedAccounts,
    getSavedAccounts,
    removeSavedAccount,
    addSavedAccount
  } = useAuthStore();

  useEffect(() => {
    loadSavedAccounts();
  }, []);

  const loadSavedAccounts = async () => {
    try {
      await getSavedAccounts();
    } catch (error) {
      console.error('Error loading saved accounts:', error);
    }
  };

  const handleLogin = async (emailToUse?: string, passwordToUse?: string) => {
  try {
    if (isLoading) return;
    setIsLoading(true);

    const credentials = {
      email: emailToUse || form.email,
      password: passwordToUse || form.password
    };

    if (!credentials.email || !credentials.password) {
      Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
      return;
    }

    const response = await authAPI.login(credentials);

    if (response.success && response.user) {
      // Сохраняем пользователя с паролем
      await setUser(response.user, credentials.password);

      // Сохраняем в список аккаунтов
      const accountToSave = {
        ...response.user,
        password: credentials.password
      };
      await addSavedAccount(accountToSave);

      // Регистрируем уведомления
      try {
        await NotificationService.registerOnServer(response.user.id);
      } catch (error) {
        console.error('Failed to register notifications:', error);
        // Продолжаем работу даже если регистрация уведомлений не удалась
      }

      router.replace('/(tabs)');
    } else {
      Alert.alert('Ошибка', response.error || 'Неверный email или пароль');
    }
  } catch (error) {
    console.error('Login error:', error);
    Alert.alert('Ошибка', 'Не удалось войти в систему');
  } finally {
    setIsLoading(false);
  }
};

  const handleRemoveAccount = (email: string) => {
    Alert.alert(
      'Удаление аккаунта',
      'Вы уверены, что хотите удалить этот аккаунт из сохраненных?',
      [
        {
          text: 'Отмена',
          style: 'cancel'
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => removeSavedAccount(email)
        }
      ]
    );
  };

  const SavedAccountCard = ({ account }: { account: typeof savedAccounts[0] }) => (
    <TouchableOpacity
      style={styles.savedAccountCard}
      onPress={() => handleLogin(account.email, account.password)}
      disabled={isLoading}
      activeOpacity={0.7}
    >
      <View style={styles.savedAccountInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {account.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
          </Text>
        </View>
        <View style={styles.accountDetails}>
          <Text style={styles.accountName} numberOfLines={1}>{account.full_name}</Text>
          <Text style={styles.accountEmail} numberOfLines={1}>{account.email}</Text>
          <Text style={styles.accountRole}>
            {account.role === 'teacher' ? 'Преподаватель' : 'Студент'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => handleRemoveAccount(account.email)}
        style={styles.removeButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        disabled={isLoading}
      >
        <Ionicons name="close-circle-outline" size={24} color={COLORS.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <Text style={styles.title}>Вход в систему</Text>

          {savedAccounts.length > 0 && (
            <View style={styles.savedAccountsContainer}>
              <Text style={styles.savedAccountsTitle}>Сохраненные аккаунты</Text>
              {savedAccounts.map((account) => (
                <SavedAccountCard key={account.email} account={account} />
              ))}

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>или</Text>
                <View style={styles.line} />
              </View>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={form.email}
            onChangeText={(text) => setForm(prev => ({ ...prev, email: text }))}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isLoading}
            autoComplete="email"
            placeholderTextColor={COLORS.textSecondary}
          />

          <TextInput
            style={styles.input}
            placeholder="Пароль"
            value={form.password}
            onChangeText={(text) => setForm(prev => ({ ...prev, password: text }))}
            secureTextEntry
            editable={!isLoading}
            autoComplete="password"
            placeholderTextColor={COLORS.textSecondary}
          />

          <TouchableOpacity
            style={[
              styles.button,
              (!form.email || !form.password || isLoading) && styles.buttonDisabled
            ]}
            onPress={() => handleLogin()}
            disabled={!form.email || !form.password || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Войти</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/(auth)/register')}
            disabled={isLoading}
          >
            <Text style={styles.linkText}>Нет аккаунта? Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: COLORS.text,
  },
  savedAccountsContainer: {
    marginBottom: 24,
  },
  savedAccountsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: COLORS.text,
  },
  savedAccountCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  savedAccountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  accountRole: {
    fontSize: 12,
    color: COLORS.primary,
  },
  removeButton: {
    padding: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 10,
    color: COLORS.textSecondary,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: COLORS.background,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
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
    padding: 10,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 16,
  },
});