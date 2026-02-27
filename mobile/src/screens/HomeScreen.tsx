import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';

type HomeNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;
import { useAuthStore } from '../store/authStore';
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

function SwipeableCard({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const gestureStartX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        // Only capture horizontal swipes, ignore vertical scrolling
        return Math.abs(gesture.dx) > 15 && Math.abs(gesture.dy) < 10;
      },
      onPanResponderGrant: () => {
        gestureStartX.current = openRef.current ? -80 : 0;
      },
      onPanResponderMove: (_, gesture) => {
        const val = Math.min(0, Math.max(-80, gestureStartX.current + gesture.dx));
        translateX.setValue(val);
      },
      onPanResponderRelease: (_, gesture) => {
        const destination = gestureStartX.current + gesture.dx;
        if (destination < -40) {
          openRef.current = true;
          Animated.spring(translateX, { toValue: -80, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        } else {
          openRef.current = false;
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <TouchableOpacity
        style={styles.deleteBackground}
        onPress={() => {
          openRef.current = false;
          Animated.timing(translateX, { toValue: 0, duration: 150, useNativeDriver: true }).start();
          onDelete();
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <Animated.View
        style={{ transform: [{ translateX }], backgroundColor: '#f5f5f5' }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavProp>();
  const userId = useAuthStore(s => s.userId);
  const [events, setEvents] = useState<Event[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'playlists'>('events');
  const [feedMode, setFeedMode] = useState<FeedMode>('public');

  const fetchData = useCallback(async () => {
    try {
      const eventsUrl = feedMode === 'mine' ? '/events/me' : '/events';
      const playlistsUrl = feedMode === 'mine' ? '/playlists/me' : '/playlists';
      const [eventsRes, playlistsRes] = await Promise.all([
        api.get(eventsUrl),
        api.get(playlistsUrl),
      ]);
      setEvents(eventsRes.data.data);
      setPlaylists(playlistsRes.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedMode]);

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
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
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
            Alert.alert('Erreur', msg);
          }
        },
      },
    ]);
  };

  const handleDeletePlaylist = (playlistId: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
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
            Alert.alert('Erreur', msg);
          }
        },
      },
    ]);
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    const isOwner = feedMode === 'mine' && item.creatorId === userId;

    if (isOwner) {
      return (
        <SwipeableCard onDelete={() => handleDeleteEvent(item.id, item.name)}>
          <TouchableOpacity
            style={[styles.card, { marginBottom: 0 }]}
            onPress={() => navigation.navigate('Event', { eventId: item.id })}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.badge, item.licenseType === 'OPEN' ? styles.badgeOpen : styles.badgeInvite]}>
                <Text style={styles.badgeText}>{item.licenseType}</Text>
              </View>
            </View>
            {item.description ? (
              <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </TouchableOpacity>
        </SwipeableCard>
      );
    }

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
        </View>
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderPlaylistItem = ({ item }: { item: Playlist }) => {
    const isOwner = feedMode === 'mine' && item.creatorId === userId;

    if (isOwner) {
      return (
        <SwipeableCard onDelete={() => handleDeletePlaylist(item.id, item.name)}>
          <TouchableOpacity
            style={[styles.card, { marginBottom: 0 }]}
            onPress={() => navigation.navigate('Playlist', { playlistId: item.id })}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.badge, item.licenseType === 'OPEN' ? styles.badgeOpen : styles.badgeInvite]}>
                <Text style={styles.badgeText}>{item.licenseType}</Text>
              </View>
            </View>
            {item.description ? (
              <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </TouchableOpacity>
        </SwipeableCard>
      );
    }

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
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Feed mode toggle */}
      <View style={styles.feedToggle}>
        <TouchableOpacity
          style={[styles.feedBtn, feedMode === 'public' && styles.feedBtnActive]}
          onPress={() => switchFeedMode('public')}
        >
          <Text style={[styles.feedBtnText, feedMode === 'public' && styles.feedBtnTextActive]}>
            Public
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.feedBtn, feedMode === 'mine' && styles.feedBtnActive]}
          onPress={() => switchFeedMode('mine')}
        >
          <Text style={[styles.feedBtnText, feedMode === 'mine' && styles.feedBtnTextActive]}>
            Mes items
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'events' && styles.tabActive]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && styles.tabTextActive]}>
            Evenements ({events.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'playlists' && styles.tabActive]}
          onPress={() => setActiveTab('playlists')}
        >
          <Text style={[styles.tabText, activeTab === 'playlists' && styles.tabTextActive]}>
            Playlists ({playlists.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'events' ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreateEvent')}>
              <Text style={styles.createButtonText}>+ Nouvel evenement</Text>
            </TouchableOpacity>
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
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreatePlaylist')}>
              <Text style={styles.createButtonText}>+ Nouvelle playlist</Text>
            </TouchableOpacity>
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
  feedBtnActive: {
    backgroundColor: '#4f46e5',
  },
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
    borderBottomColor: '#4f46e5',
  },
  tabText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#4f46e5',
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
    backgroundColor: '#4f46e5',
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
  swipeContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
});
