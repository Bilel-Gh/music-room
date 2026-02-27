import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Keyboard,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import api from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePlaylist'>;

type LicenseType = 'OPEN' | 'INVITE_ONLY';

export default function CreatePlaylistScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [licenseType, setLicenseType] = useState<LicenseType>('OPEN');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Erreur', 'Le nom doit faire au moins 2 caracteres');
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
        || 'Impossible de creer la playlist';
      Alert.alert('Erreur', msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Nom *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nom de la playlist"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optionnel)"
        placeholderTextColor="#999"
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Playlist publique</Text>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ true: '#4f46e5', false: '#ddd' }}
        />
      </View>

      <Text style={styles.label}>Type de licence</Text>
      <View style={styles.licenseRow}>
        {(['OPEN', 'INVITE_ONLY'] as LicenseType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.licenseBtn, licenseType === type && styles.licenseBtnActive]}
            onPress={() => setLicenseType(type)}
          >
            <Text style={[styles.licenseBtnText, licenseType === type && styles.licenseBtnTextActive]}>
              {type === 'OPEN' ? 'Ouvert' : 'Sur invitation'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.licenseHint}>
        {licenseType === 'OPEN'
          ? 'Tout le monde peut ajouter et modifier les tracks'
          : 'Seuls les invites avec permission "Editeur" peuvent modifier les tracks'}
      </Text>

      <TouchableOpacity
        style={[styles.createBtn, creating && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createBtnText}>Creer la playlist</Text>
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
  licenseBtnActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  licenseBtnText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  licenseBtnTextActive: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  licenseHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  createBtn: {
    backgroundColor: '#4f46e5',
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
