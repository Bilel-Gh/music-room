import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

interface UserProfile {
  name: string;
  email: string;
  emailVerified: boolean;
  googleId: string | null;
  publicInfo: string | null;
  friendsInfo: string | null;
  privateInfo: string | null;
  musicPreferences: string[];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [publicInfo, setPublicInfo] = useState('');
  const [friendsInfo, setFriendsInfo] = useState('');
  const [privateInfo, setPrivateInfo] = useState('');
  const [musicPrefs, setMusicPrefs] = useState('');

  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.email);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/users/me');
      const user = data.data as UserProfile;
      setProfile(user);
      populateFields(user);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le profil');
    } finally {
      setLoading(false);
    }
  };

  const populateFields = (user: UserProfile) => {
    setName(user.name);
    setPublicInfo(user.publicInfo || '');
    setFriendsInfo(user.friendsInfo || '');
    setPrivateInfo(user.privateInfo || '');
    setMusicPrefs(user.musicPreferences.join(', '));
  };

  const handleEdit = () => {
    if (profile) populateFields(profile);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (profile) populateFields(profile);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom ne peut pas etre vide');
      return;
    }

    setSaving(true);
    try {
      const musicPreferences = musicPrefs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const { data } = await api.put('/users/me', {
        name: name.trim(),
        publicInfo: publicInfo || undefined,
        friendsInfo: friendsInfo || undefined,
        privateInfo: privateInfo || undefined,
        musicPreferences,
      });
      setProfile(data.data as UserProfile);
      setIsEditing(false);
      Alert.alert('Succes', 'Profil mis a jour');
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre a jour le profil');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
      const result = await WebBrowser.openAuthSessionAsync(
        `${apiUrl}/api/auth/google?platform=mobile`,
        'musicroom://auth/callback',
      );

      if (result.type === 'success' && result.url) {
        // Google OAuth succeeded — the backend already linked the account
        // Refresh profile to reflect the change
        await fetchProfile();
        Alert.alert('Succes', 'Compte Google lie');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de lier le compte Google');
    }
  };

  const handleLogout = () => {
    Alert.alert('Deconnexion', 'Voulez-vous vous deconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Deconnexion', style: 'destructive', onPress: () => logout() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!profile) return null;

  // View mode
  if (!isEditing) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
            </View>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.email}>{profile.email}</Text>
          </View>

          {/* Email verification banner */}
          {profile.emailVerified === false && (
            <TouchableOpacity
              style={styles.verifyBanner}
              onPress={() => email && navigation.navigate('EmailVerification', { email })}
            >
              <Text style={styles.verifyBannerText}>
                Email non verifie — Appuyez pour verifier
              </Text>
            </TouchableOpacity>
          )}

          {/* Info cards */}
          {profile.publicInfo ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Info publique</Text>
              <Text style={styles.cardValue}>{profile.publicInfo}</Text>
            </View>
          ) : null}

          {profile.friendsInfo ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Info amis</Text>
              <Text style={styles.cardValue}>{profile.friendsInfo}</Text>
            </View>
          ) : null}

          {profile.privateInfo ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Info privee</Text>
              <Text style={styles.cardValue}>{profile.privateInfo}</Text>
            </View>
          ) : null}

          {profile.musicPreferences.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Preferences musicales</Text>
              <View style={styles.tagsRow}>
                {profile.musicPreferences.map((pref, i) => (
                  <View key={i} style={styles.tag}>
                    <Text style={styles.tagText}>{pref}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <Text style={styles.editButtonText}>Modifier le profil</Text>
          </TouchableOpacity>

          {!profile.googleId && (
            <TouchableOpacity style={styles.googleLinkButton} onPress={handleLinkGoogle}>
              <Text style={styles.googleLinkText}>Lier un compte Google</Text>
            </TouchableOpacity>
          )}

          {profile.googleId && (
            <View style={styles.googleLinkedBadge}>
              <Text style={styles.googleLinkedText}>Compte Google lie</Text>
            </View>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Se deconnecter</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Edit mode
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.email}>{profile.email}</Text>

        <Text style={styles.label}>Nom</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>Info publique</Text>
        <Text style={styles.visibilityHint}>Visible par tous les utilisateurs</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={publicInfo}
          onChangeText={setPublicInfo}
          placeholder="Bio, centre d'interets..."
          placeholderTextColor="#bbb"
          multiline
        />

        <Text style={styles.label}>Info amis uniquement</Text>
        <Text style={styles.visibilityHint}>Visible par vos amis uniquement</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={friendsInfo}
          onChangeText={setFriendsInfo}
          placeholder="Infos reservees a vos amis..."
          placeholderTextColor="#bbb"
          multiline
        />

        <Text style={styles.label}>Info privee</Text>
        <Text style={styles.visibilityHint}>Visible par vous uniquement</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={privateInfo}
          onChangeText={setPrivateInfo}
          placeholder="Notes personnelles..."
          placeholderTextColor="#bbb"
          multiline
        />

        <Text style={styles.label}>Preferences musicales</Text>
        <Text style={styles.visibilityHint}>Visible par tous — Separez par des virgules (ex: Rock, Jazz, Hip-hop)</Text>
        <TextInput
          style={styles.input}
          value={musicPrefs}
          onChangeText={setMusicPrefs}
          placeholder="jazz, rock, electro..."
          placeholderTextColor="#bbb"
        />

        <View style={styles.editActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  // Avatar section
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 8,
  },
  // Info cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  tagText: {
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#4f46e5',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleLinkButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  googleLinkText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '500',
  },
  googleLinkedBadge: {
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#ecfdf5',
  },
  googleLinkedText: {
    color: '#065f46',
    fontSize: 14,
    fontWeight: '500',
  },
  logoutButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '500',
  },
  // Edit mode
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
    marginTop: 16,
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
  visibilityHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  verifyBanner: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  verifyBannerText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
  },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4f46e5',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
