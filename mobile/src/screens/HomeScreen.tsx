import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { crossAlert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import OfflineBanner from '../components/OfflineBanner';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

type HomeNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { useNetworkStore } from '../store/networkStore';
import api from '../services/api';
import { getSocket, connectSocket } from '../services/socket';

interface Event {
  id: string;
  name: string;
  description: string | null;
  licenseType: string;
  isPublic: boolean;
  creatorId: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  licenseType: string;
  isPublic: boolean;
  creatorId: string;
}

type FeedMode = 'public' | 'mine';

const CACHE_EVENTS_KEY = 'cache:events';
const CACHE_PLAYLISTS_KEY = 'cache:playlists';

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavProp>();
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const userId = useAuthStore(s => s.userId);
  const isConnected = useNetworkStore(s => s.isConnected);
  const [events, setEvents] = useState<Event[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'playlists'>('events');
  const [feedMode, setFeedMode] = useState<FeedMode>('public');

  const loadCachedData = useCallback(async () => {
    try {
      const [cachedEvents, cachedPlaylists] = await Promise.all([
        AsyncStorage.getItem(CACHE_EVENTS_KEY),
        AsyncStorage.getItem(CACHE_PLAYLISTS_KEY),
      ]);
      if (cachedEvents) setEvents(JSON.parse(cachedEvents));
      if (cachedPlaylists) setPlaylists(JSON.parse(cachedPlaylists));
    } catch {
      // cache read failed, ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!isConnected) {
      loadCachedData();
      return;
    }

    try {
      const eventsUrl = feedMode === 'mine' ? '/events/me' : '/events';
      const playlistsUrl = feedMode === 'mine' ? '/playlists/me' : '/playlists';
      const [eventsRes, playlistsRes] = await Promise.all([
        api.get(eventsUrl),
        api.get(playlistsUrl),
      ]);
      setEvents(eventsRes.data.data);
      setPlaylists(playlistsRes.data.data);

      // Save to cache for offline use (only public feed)
      if (feedMode === 'public') {
        AsyncStorage.setItem(CACHE_EVENTS_KEY, JSON.stringify(eventsRes.data.data)).catch(() => {});
        AsyncStorage.setItem(CACHE_PLAYLISTS_KEY, JSON.stringify(playlistsRes.data.data)).catch(() => {});
      }
    } catch {
      // Network error — try loading from cache
      loadCachedData();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedMode, isConnected, loadCachedData]);

  // Fetch on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Also fetch on mount to handle the very first load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time: listen for new public events/playlists
  useEffect(() => {
    if (feedMode !== 'public') return;

    connectSocket();
    const socket = getSocket();

    const handleEventCreated = (data: { event: Event }) => {
      setEvents(prev => [data.event, ...prev]);
    };
    const handlePlaylistCreated = (data: { playlist: Playlist }) => {
      setPlaylists(prev => [data.playlist, ...prev]);
    };

    socket.on('eventCreated', handleEventCreated);
    socket.on('playlistCreated', handlePlaylistCreated);

    return () => {
      socket.off('eventCreated', handleEventCreated);
      socket.off('playlistCreated', handlePlaylistCreated);
    };
  }, [feedMode]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const switchFeedMode = (mode: FeedMode) => {
    if (mode === feedMode) return;
    setFeedMode(mode);
    setLoading(true);
  };

  const handleDeleteEvent = (eventId: string, name: string) => {
    crossAlert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/events/${eventId}`);
            setEvents(prev => prev.filter(e => e.id !== eventId));
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
              || 'Impossible de supprimer';
            crossAlert('Erreur', msg);
          }
        },
      },
    ]);
  };

  const handleDeletePlaylist = (playlistId: string, name: string) => {
    crossAlert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/playlists/${playlistId}`);
            setPlaylists(prev => prev.filter(p => p.id !== playlistId));
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
              || 'Impossible de supprimer';
            crossAlert('Erreur', msg);
          }
        },
      },
    ]);
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    const isOwner = feedMode === 'mine' && item.creatorId === userId;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Event', { eventId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.badge, item.licenseType === 'OPEN' ? styles.badgeOpen : styles.badgeInvite]}>
            <Text style={styles.badgeText}>{item.licenseType}</Text>
          </View>
          {isOwner && (
            <TouchableOpacity
              onPress={() => handleDeleteEvent(item.id, item.name)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => {
    const isOwner = feedMode === 'mine' && item.creatorId === userId;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Playlist', { playlistId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.badge, item.licenseType === 'OPEN' ? styles.badgeOpen : styles.badgeInvite]}>
            <Text style={styles.badgeText}>{item.licenseType}</Text>
          </View>
          {isOwner && (
            <TouchableOpacity
              onPress={() => handleDeletePlaylist(item.id, item.name)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const responsiveList = contentMaxWidth
    ? { maxWidth: contentMaxWidth, width: '100%' as const, alignSelf: 'center' as const }
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <OfflineBanner />
      {/* Feed mode toggle */}
      <View style={styles.feedToggle}>
        <TouchableOpacity
          style={[styles.feedBtn, feedMode === 'public' && [styles.feedBtnActive, { backgroundColor: colors.primary }]]}
          onPress={() => switchFeedMode('public')}
        >
          <Text style={[styles.feedBtnText, feedMode === 'public' && styles.feedBtnTextActive]}>
            Public
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.feedBtn, feedMode === 'mine' && [styles.feedBtnActive, { backgroundColor: colors.primary }]]}
          onPress={() => switchFeedMode('mine')}
        >
          <Text style={[styles.feedBtnText, feedMode === 'mine' && styles.feedBtnTextActive]}>
            Mes items
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'events' && [styles.tabActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && [styles.tabTextActive, { color: colors.primary }]]}>
            Evenements ({events.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'playlists' && [styles.tabActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('playlists')}
        >
          <Text style={[styles.tabText, activeTab === 'playlists' && [styles.tabTextActive, { color: colors.primary }]]}>
            Playlists ({playlists.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'events' ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          contentContainerStyle={[styles.list, responsiveList]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            isConnected ? (
              <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('CreateEvent')}>
                <Text style={styles.createButtonText}>+ Nouvel evenement</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun evenement pour le moment</Text>
          }
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          renderItem={renderPlaylistItem}
          contentContainerStyle={[styles.list, responsiveList]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            isConnected ? (
              <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('CreatePlaylist')}>
                <Text style={styles.createButtonText}>+ Nouvelle playlist</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucune playlist pour le moment</Text>
          }
        />
      )}

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
  feedToggle: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  feedBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  feedBtnActive: {},
  feedBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  feedBtnTextActive: {
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 10,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    lineHeight: 20,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeOpen: {
    backgroundColor: '#dcfce7',
  },
  badgeInvite: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 15,
  },
  createButton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
