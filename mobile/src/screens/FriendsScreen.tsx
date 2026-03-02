import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import OfflineBanner from '../components/OfflineBanner';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

interface UserResult {
  id: string;
  name: string;
  email: string;
}

export default function FriendsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [])
  );

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(query.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const loadFriends = async () => {
    try {
      const { data } = await api.get('/users/me/friends');
      setFriends(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFriends();
  }, []);

  const performSearch = async (q: string) => {
    setSearching(true);
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.data);
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string) => {
    setSendingTo(userId);
    try {
      await api.post(`/users/friend-requests/${userId}`);
      crossAlert('Success', 'Friend request sent!');
      setSearchResults(prev => prev.filter(u => u.id !== userId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to send request';
      crossAlert('Error', msg);
    } finally {
      setSendingTo(null);
    }
  };

  const handleRemoveFriend = (friendId: string, friendName: string) => {
    crossAlert('Remove', `Remove ${friendName} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(friendId);
          try {
            await api.delete(`/users/friends/${friendId}`);
            setFriends(prev => prev.filter(f => f.id !== friendId));
          } catch {
            crossAlert('Error', 'Unable to remove this friend');
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <OfflineBanner />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.content, contentMaxWidth ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}
      >
        {/* Search section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Nom ou email..."
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {searching && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
          )}

          {searchResults.map(user => (
            <TouchableOpacity
              key={user.id}
              style={styles.userCard}
              onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
            >
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }, sendingTo === user.id && styles.buttonDisabled]}
                onPress={() => handleSendRequest(user.id)}
                disabled={sendingTo === user.id}
              >
                {sendingTo === user.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* Friends list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My friends ({friends.length})</Text>
          {friends.length === 0 ? (
            <Text style={styles.emptyText}>No friends yet</Text>
          ) : (
            friends.map(friend => (
              <TouchableOpacity
                key={friend.id}
                style={styles.friendCard}
                onPress={() => navigation.navigate('UserProfile', { userId: friend.id })}
              >
                <View style={styles.friendInfo}>
                  <Text style={styles.userName}>{friend.name}</Text>
                  <Text style={styles.userEmail}>{friend.email}</Text>
                </View>
                {removingId === friend.id ? (
                  <ActivityIndicator size="small" color="#ef4444" style={{ marginRight: 8 }} />
                ) : (
                  <TouchableOpacity
                    onPress={() => handleRemoveFriend(friend.id, friend.name)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="close-circle-outline" size={22} color="#ef4444" />
                  </TouchableOpacity>
                )}
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  userEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 75,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  friendInfo: {
    flex: 1,
  },
  removeBtn: {
    padding: 4,
    marginRight: 4,
  },
  chevron: {
    fontSize: 22,
    color: '#ccc',
    fontWeight: '300',
    marginLeft: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 16,
    fontSize: 14,
  },
});
