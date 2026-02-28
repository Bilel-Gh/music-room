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

type Props = NativeStackScreenProps<RootStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const { formMaxWidth } = useResponsive();

  const handleVerify = async () => {
    if (code.length !== 6) {
      crossAlert('Erreur', 'Le code doit contenir 6 chiffres');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/verify-email', { email, code });
      crossAlert('Succes', 'Email verifie !', [
        { text: 'OK', onPress: () => navigation.navigate('MainTabs') },
      ]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Code invalide';
      crossAlert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigation.navigate('MainTabs');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, formMaxWidth ? { maxWidth: formMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}>
        <Text style={styles.title}>Verification de l'email</Text>
        <Text style={styles.subtitle}>
          Un code a 6 chiffres a ete envoye a {email}
        </Text>
        <Text style={styles.hint}>
          (En mode dev, le code est affiche dans les logs du serveur)
        </Text>

        <TextInput
          style={[styles.codeInput, { borderColor: colors.primary }]}
          placeholder="000000"
          placeholderTextColor="#ccc"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verifier</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Passer pour le moment</Text>
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
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 28,
    fontStyle: 'italic',
  },
  codeInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    letterSpacing: 12,
    fontWeight: '700',
    marginBottom: 20,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  button: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipText: {
    textAlign: 'center',
    marginTop: 18,
    color: '#999',
    fontSize: 14,
  },
});
