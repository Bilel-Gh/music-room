import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Keyboard,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';
import { useAuthStore } from '../store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePlaylist'>;

type LicenseType = 'OPEN' | 'INVITE_ONLY';

export default function CreatePlaylistScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { formMaxWidth } = useResponsive();
  const isPremium = useAuthStore(s => s.isPremium);
  const premiumEnabled = useAuthStore(s => s.premiumEnabled);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [licenseType, setLicenseType] = useState<LicenseType>('OPEN');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      crossAlert('Error', 'Name must be at least 2 characters');
      return;
    }

    Keyboard.dismiss();
    setCreating(true);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        isPublic,
        licenseType,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      const { data } = await api.post('/playlists', payload);
      navigation.replace('Playlist', { playlistId: data.data.id });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to create playlist';
      crossAlert('Error', msg);
    } finally {
      setCreating(false);
    }
  };

  if (premiumEnabled && !isPremium) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>&#x1F512;</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' }}>
          Premium Feature
        </Text>
        <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 }}>
          Creating playlists requires a Premium subscription. Upgrade in your Profile settings.
        </Text>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.createBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, formMaxWidth ? { maxWidth: formMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Name *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Playlist name"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        placeholderTextColor="#999"
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Public playlist</Text>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ true: colors.primary, false: '#ddd' }}
        />
      </View>

      <Text style={styles.label}>License type</Text>
      <View style={styles.licenseRow}>
        {(['OPEN', 'INVITE_ONLY'] as LicenseType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.licenseBtn, licenseType === type && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
            onPress={() => setLicenseType(type)}
          >
            <Text style={[styles.licenseBtnText, licenseType === type && { color: colors.primary, fontWeight: '600' as const }]}>
              {type === 'OPEN' ? 'Open' : 'Invite Only'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.licenseHint}>
        {licenseType === 'OPEN'
          ? 'Anyone can add and edit tracks'
          : 'Only invited users with "Editor" permission can edit tracks'}
      </Text>

      <TouchableOpacity
        style={[styles.createBtn, { backgroundColor: colors.primary }, creating && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createBtnText}>Create playlist</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1a1a1a',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  licenseRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  licenseBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  licenseBtnActive: {},
  licenseBtnText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  licenseBtnTextActive: {},
  licenseHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  createBtn: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
