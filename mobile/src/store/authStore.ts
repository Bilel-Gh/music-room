import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

function getEmailFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email ?? null;
  } catch {
    return null;
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  isPremium: boolean;
  premiumEnabled: boolean;
  isLoading: boolean;
  setTokens: (access: string, refresh: string) => void;
  setIsPremium: (value: boolean) => void;
  setPremiumEnabled: (value: boolean) => void;
  logout: () => void;
  loadTokens: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  email: null,
  isPremium: false,
  premiumEnabled: false,
  isLoading: true,

  setTokens: async (access, refresh) => {
    await AsyncStorage.setItem('accessToken', access);
    await AsyncStorage.setItem('refreshToken', refresh);
    set({
      accessToken: access,
      refreshToken: refresh,
      userId: getUserIdFromToken(access),
      email: getEmailFromToken(access),
    });
  },

  setIsPremium: (value) => set({ isPremium: value }),
  setPremiumEnabled: (value) => set({ premiumEnabled: value }),

  logout: async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    set({ accessToken: null, refreshToken: null, userId: null, email: null, isPremium: false });
  },

  loadTokens: async () => {
    const accessToken = await AsyncStorage.getItem('accessToken');
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    const userId = accessToken ? getUserIdFromToken(accessToken) : null;
    const email = accessToken ? getEmailFromToken(accessToken) : null;
    set({ accessToken, refreshToken, userId, email, isLoading: false });
  },
}));
