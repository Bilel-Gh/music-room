import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { ThemeProvider } from './src/theme/theme-context';
import api from './src/services/api';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('accessToken');
      const refreshToken = params.get('refreshToken');
      if (accessToken && refreshToken) {
        useAuthStore.getState().setTokens(accessToken, refreshToken);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    api.get('/config/features')
      .then(({ data }) => {
        useAuthStore.getState().setPremiumEnabled(data.premiumEnabled ?? false);
      })
      .catch(() => {});
  }, []);

  if (Platform.OS === 'web') {
    return (
      <ThemeProvider>
        <SafeAreaProvider>
          <View style={styles.webRoot}>
            <AppNavigator />
          </View>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <View style={styles.native}>
          <AppNavigator />
          <StatusBar style="auto" />
        </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  native: {
    flex: 1,
  },
  webRoot: {
    // @ts-ignore — '100vh' is valid CSS on web via react-native-web
    height: '100vh',
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
});
