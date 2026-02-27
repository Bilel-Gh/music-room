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

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  isLoading: boolean;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  loadTokens: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  isLoading: true,

  setTokens: async (access, refresh) => {
    await AsyncStorage.setItem('accessToken', access);
    await AsyncStorage.setItem('refreshToken', refresh);
    set({ accessToken: access, refreshToken: refresh, userId: getUserIdFromToken(access) });
  },

  logout: async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    set({ accessToken: null, refreshToken: null, userId: null });
  },

  loadTokens: async () => {
    const accessToken = await AsyncStorage.getItem('accessToken');
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    const userId = accessToken ? getUserIdFromToken(accessToken) : null;
    set({ accessToken, refreshToken, userId, isLoading: false });
  },
}));
