import { useState } from 'react';
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ navigation }: Props) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const { formMaxWidth } = useResponsive();

  const handleReset = async () => {
    if (!token.trim()) {
      crossAlert('Error', 'Please enter the token');
      return;
    }
    if (password.length < 8) {
      crossAlert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      crossAlert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), password });
      crossAlert('Success', 'Password reset successfully', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to reset password';
      crossAlert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, formMaxWidth ? { maxWidth: formMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          Enter the token you received and your new password
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Reset token"
          placeholderTextColor="#999"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="New password (8 char. min)"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#999"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Reset</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Back to login</Text>
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 28,
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
  linkText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '500',
  },
});
