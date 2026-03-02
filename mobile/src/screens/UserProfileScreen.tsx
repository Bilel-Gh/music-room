import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

interface UserData {
  id: string;
  name: string;
  publicInfo?: string | null;
  friendsInfo?: string | null;
  musicPreferences?: string[];
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function UserProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [userId]);

  useEffect(() => {
    if (user) {
      navigation.setOptions({ title: user.name });
    }
  }, [user]);

  const fetchUser = async () => {
    try {
      const { data } = await api.get(`/users/${userId}`);
      setUser(data.data as UserData);
    } catch {
      crossAlert('Error', 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSendFriendRequest = async () => {
    setSendingRequest(true);
    try {
      await api.post(`/users/friend-requests/${userId}`);
      setRequestSent(true);
      crossAlert('Success', 'Friend request sent!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to send request';
      crossAlert('Info', msg);
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={48} color="#ccc" />
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  // Check if this person is a friend (friendsInfo is present only for friends)
  const isFriend = user.friendsInfo !== undefined;
  const hasPublicInfo = !!user.publicInfo;
  const hasFriendsInfo = !!user.friendsInfo;
  const hasMusicPrefs = user.musicPreferences && user.musicPreferences.length > 0;
  const hasAnyInfo = hasPublicInfo || hasFriendsInfo || hasMusicPrefs;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, contentMaxWidth ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}>
      {/* Avatar + name */}
      <View style={styles.headerSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        {isFriend && (
          <View style={[styles.friendBadge, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="people" size={14} color={colors.primary} />
            <Text style={styles.friendBadgeText}>Friend</Text>
          </View>
        )}
      </View>

      {hasPublicInfo && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Public info</Text>
          <Text style={styles.cardValue}>{user.publicInfo}</Text>
        </View>
      )}

      {hasFriendsInfo && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Friends info</Text>
          <Text style={styles.cardValue}>{user.friendsInfo}</Text>
        </View>
      )}

      {hasMusicPrefs && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Music preferences</Text>
          <View style={styles.tagsRow}>
            {user.musicPreferences!.map((pref, i) => (
              <View key={i} style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.tagText}>{pref}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!hasAnyInfo && (
        <View style={styles.emptyCard}>
          <Ionicons name="information-circle-outline" size={32} color="#ccc" />
          <Text style={styles.emptyText}>No public information</Text>
        </View>
      )}

      {/* Add friend button (if not already friends) */}
      {!isFriend && !requestSent && (
        <TouchableOpacity
          style={[styles.addFriendBtn, { backgroundColor: colors.primary }, sendingRequest && styles.buttonDisabled]}
          onPress={handleSendFriendRequest}
          disabled={sendingRequest}
        >
          {sendingRequest ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.addFriendText}>Add as friend</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {requestSent && (
        <View style={styles.sentBadge}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" />
          <Text style={styles.sentText}>Request sent</Text>
        </View>
      )}
    </ScrollView>
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
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  tagText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  addFriendBtn: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  addFriendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  sentText: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 15,
    color: '#999',
    marginTop: 10,
  },
});
