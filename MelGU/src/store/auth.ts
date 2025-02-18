import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: number;
  email: string;
  role: 'student' | 'teacher';
  full_name: string;
  group_name?: string;
  course?: number;
}

interface SavedAccount extends User {
  password?: string;
}

interface AuthState {
  user: User | null;
  currentPassword: string | null;
  savedAccounts: SavedAccount[];
  isLoading: boolean;
  setUser: (user: User | null, password?: string) => Promise<void>;
  addSavedAccount: (account: SavedAccount) => Promise<void>;
  removeSavedAccount: (email: string) => Promise<void>;
  getSavedAccounts: () => Promise<void>;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEYS = {
  USER: 'user',
  CURRENT_PASSWORD: 'currentPassword',
  SAVED_ACCOUNTS: 'savedAccounts'
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  currentPassword: null,
  savedAccounts: [],
  isLoading: true,

  setUser: async (user, password) => {
    try {
      set({ user, currentPassword: password || null });

      if (user) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        if (password) {
          await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_PASSWORD, password);
        }
        console.log('User and password saved successfully');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
        await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_PASSWORD);
        console.log('User data cleared');
      }
    } catch (error) {
      console.error('Error setting user:', error);
      throw error;
    }
  },

  addSavedAccount: async (account) => {
    try {
      const { savedAccounts, currentPassword } = get();
      console.log('Adding account:', account.email);

      const updatedAccounts = [...savedAccounts];
      const accountToSave = {
        ...account,
        password: account.password || currentPassword
      };

      const existingIndex = updatedAccounts.findIndex(acc => acc.email === account.email);

      if (existingIndex !== -1) {
        console.log('Updating existing account');
        updatedAccounts[existingIndex] = accountToSave;
      } else {
        console.log('Adding new account');
        updatedAccounts.push(accountToSave);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_ACCOUNTS, JSON.stringify(updatedAccounts));
      set({ savedAccounts: updatedAccounts });
      console.log('Account saved successfully');
    } catch (error) {
      console.error('Error saving account:', error);
      throw error;
    }
  },

  removeSavedAccount: async (email) => {
    try {
      console.log('Removing account:', email);
      const { savedAccounts } = get();
      const updatedAccounts = savedAccounts.filter(acc => acc.email !== email);

      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_ACCOUNTS, JSON.stringify(updatedAccounts));
      set({ savedAccounts: updatedAccounts });
      console.log('Account removed successfully');
    } catch (error) {
      console.error('Error removing account:', error);
      throw error;
    }
  },

  getSavedAccounts: async () => {
    try {
      const accountsString = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_ACCOUNTS);
      if (accountsString) {
        const accounts = JSON.parse(accountsString);
        set({ savedAccounts: accounts });
        console.log('Retrieved saved accounts:', accounts.length);
      } else {
        set({ savedAccounts: [] });
        console.log('No saved accounts found');
      }
    } catch (error) {
      console.error('Error getting saved accounts:', error);
      throw error;
    }
  },

  checkAuth: async () => {
    try {
      set({ isLoading: true });

      const [userString, password] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.CURRENT_PASSWORD)
      ]);

      if (userString) {
        const user = JSON.parse(userString);
        set({
          user,
          currentPassword: password
        });
        console.log('Auth check: User found');
      } else {
        set({
          user: null,
          currentPassword: null
        });
        console.log('Auth check: No user found');
      }

      await get().getSavedAccounts();
    } catch (error) {
      console.error('Error checking auth:', error);
      set({
        user: null,
        currentPassword: null
      });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      console.log('Logging out...');
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_PASSWORD);

      set({
        user: null,
        currentPassword: null
      });
      console.log('Logout successful');
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }
}));