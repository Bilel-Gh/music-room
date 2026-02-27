import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';

export default function App() {
  // On web, catch OAuth tokens from URL query params after Google redirect
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
  }, []);

  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <View style={styles.webRoot}>
          <View style={styles.webContainer}>
            <AppNavigator />
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.native}>
        <AppNavigator />
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  native: {
    flex: 1,
  },
  webRoot: {
    // @ts-ignore — '100vh' is valid CSS on web via react-native-web
    height: '100vh',
    backgroundColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  webContainer: {
    flex: 1,
    maxWidth: 480,
    width: '100%',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e5e5',
    // @ts-ignore
    overflow: 'hidden',
  },
});
