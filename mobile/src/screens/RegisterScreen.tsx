import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setTokens = useAuthStore((s) => s.setTokens);
  const { colors } = useTheme();
  const { formMaxWidth } = useResponsive();

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      crossAlert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      crossAlert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      await setTokens(data.data.accessToken, data.data.refreshToken);
      setTimeout(() => {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'EmailVerification', params: { email: email.trim() } },
          ],
        });
      }, 100);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        'Unable to create account';
      crossAlert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      handleGoogleToken(idToken);
    }
  }, [googleResponse]);

  const handleGoogleToken = async (idToken: string) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/google/mobile', { idToken });
      await setTokens(data.data.accessToken, data.data.refreshToken);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        'Unable to sign in with Google';
      crossAlert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    if (Platform.OS === 'web') {
      const apiUrl = process.env.EXPO_PUBLIC_WEB_API_URL || 'http://localhost:3001';
      window.location.href = `${apiUrl}/api/auth/google`;
    } else {
      promptGoogleAsync();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, formMaxWidth ? { maxWidth: formMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}>
        <Text style={styles.title}>Create an account</Text>
        <Text style={styles.subtitle}>Join Music Room</Text>

        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password (8 characters min)"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.googleButton, Platform.OS !== 'web' && !googleRequest && styles.buttonDisabled]}
          onPress={handleGoogleRegister}
          disabled={Platform.OS !== 'web' && !googleRequest}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={[styles.linkBold, { color: colors.primary }]}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  button: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  linkText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#666',
    fontSize: 14,
  },
  linkBold: {
    fontWeight: '600',
  },
});
