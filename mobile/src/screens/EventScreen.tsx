import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import OfflineBanner from '../components/OfflineBanner';
import { useAuthStore } from '../store/authStore';
import { useNetworkStore } from '../store/networkStore';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { getSocket, connectSocket } from '../services/socket';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'Event'>;

interface Track {
  id: string;
  title: string;
  artist: string;
  voteCount: number;
  externalUrl: string | null;
  votes?: { userId: string }[];
}

interface EventData {
  id: string;
  name: string;
  description: string | null;
  licenseType: string;
  isPublic: boolean;
  creatorId: string;
  membership: { role: string } | null;
}

interface Friend {
  id: string;
  name: string;
  email: string;
}

export default function EventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const userId = useAuthStore(s => s.userId);
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const [event, setEvent] = useState<EventData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [adding, setAdding] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const [inviteVisible, setInviteVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const canParticipate = event
    ? event.licenseType === 'OPEN' || event.licenseType === 'LOCATION_TIME' || event.membership !== null
    : false;

  useEffect(() => {
    fetchData();
    setupSocket();

    return () => {
      const socket = getSocket();
      socket.emit('leaveEvent', eventId);
      socket.off('trackAdded');
      socket.off('trackVoted');
    };
  }, [eventId]);

  const handleDelete = useCallback(() => {
    crossAlert('Delete', 'Delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/events/${eventId}`);
            navigation.goBack();
          } catch {
            crossAlert('Error', 'Unable to delete');
          }
        },
      },
    ]);
  }, [eventId, navigation]);

  const openInviteModal = useCallback(async () => {
    setInviteVisible(true);
    setLoadingFriends(true);
    try {
      const { data } = await api.get('/users/me/friends');
      setFriends(data.data);
    } catch {
      crossAlert('Error', 'Unable to load friends list');
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (!event) return;
    const isCreator = event.creatorId === userId;
    if (!isCreator) return;

    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16, marginRight: 4 }}>
          <TouchableOpacity onPress={openInviteModal}>
            <Ionicons name="person-add-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [event, userId, handleDelete, openInviteModal, colors.primary]);

  const fetchData = async () => {
    try {
      const [eventRes, tracksRes] = await Promise.all([
        api.get(`/events/${eventId}`),
        api.get(`/events/${eventId}/tracks`),
      ]);
      setEvent(eventRes.data.data);
      setTracks(tracksRes.data.data);

      // Auto-join OPEN events silently
      const ev = eventRes.data.data;
      if (ev.licenseType === 'OPEN') {
        api.post(`/events/${eventId}/join`).catch(() => {});
      }
    } catch {
      crossAlert('Error', 'Unable to load event');
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    connectSocket();
    const socket = getSocket();
    socket.emit('joinEvent', eventId);

    socket.on('trackAdded', (data) => {
      if (data.eventId === eventId) setTracks(data.tracks as Track[]);
    });
    socket.on('trackVoted', (data) => {
      if (data.eventId === eventId) setTracks(data.tracks as Track[]);
    });
  };

  const handleInvite = async (friendId: string) => {
    setInvitingId(friendId);
    try {
      await api.post(`/events/${eventId}/invite`, { userId: friendId });
      crossAlert('Success', 'Invitation sent');
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to invite';
      crossAlert('Error', msg);
    } finally {
      setInvitingId(null);
    }
  };

  const handleAddTrack = async () => {
    if (!useNetworkStore.getState().isConnected) {
      crossAlert('Offline Mode', 'This action requires an internet connection.');
      return;
    }
    if (!title.trim() || !artist.trim()) {
      crossAlert('Error', 'Title and artist required');
      return;
    }

    Keyboard.dismiss();
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        artist: artist.trim(),
      };

      // LOCATION_TIME events require user's location to add tracks
      if (event?.licenseType === 'LOCATION_TIME') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          crossAlert('Error', 'Location is required to add tracks to this event');
          setAdding(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        body.latitude = loc.coords.latitude;
        body.longitude = loc.coords.longitude;
      }

      await api.post(`/events/${eventId}/tracks`, body);
      setTitle('');
      setArtist('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to add track';
      crossAlert('Error', msg);
    } finally {
      setAdding(false);
    }
  };

  const handleVote = async (trackId: string) => {
    if (!useNetworkStore.getState().isConnected) {
      crossAlert('Offline Mode', 'This action requires an internet connection.');
      return;
    }

    setVotingId(trackId);
    try {
      const body: Record<string, number> = {};

      if (event?.licenseType === 'LOCATION_TIME') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          crossAlert('Error', 'Location is required to vote in this event');
          setVotingId(null);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        body.latitude = loc.coords.latitude;
        body.longitude = loc.coords.longitude;
      }

      await api.post(`/events/${eventId}/tracks/${trackId}/vote`, body);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Unable to vote';
      crossAlert('Error', msg);
    } finally {
      setVotingId(null);
    }
  };

  const renderTrack = ({ item, index }: { item: Track; index: number }) => {
    const hasVoted = item.votes?.some(v => v.userId === userId) ?? false;

    return (
    <View style={styles.trackCard}>
      <View style={styles.trackRank}>
        <Text style={styles.rankNumber}>{index + 1}</Text>
      </View>
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
      {canParticipate && (
        <TouchableOpacity
          style={[styles.voteButton, hasVoted ? { backgroundColor: colors.primary } : { backgroundColor: colors.primaryLight }]}
          onPress={() => handleVote(item.id)}
          disabled={votingId === item.id}
        >
          {votingId === item.id ? (
            <ActivityIndicator size="small" color={hasVoted ? '#fff' : colors.primary} />
          ) : (
            <>
              <Text style={[styles.voteCount, hasVoted && { color: '#fff' }]}>{item.voteCount}</Text>
              <Text style={[styles.voteLabel, hasVoted && { color: 'rgba(255,255,255,0.8)' }]}>{hasVoted ? 'Vote' : 'Vote'}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {!canParticipate && (
        <View style={styles.voteButton}>
          <Text style={styles.voteCount}>{item.voteCount}</Text>
          <Text style={[styles.voteLabel, { color: '#999' }]}>votes</Text>
        </View>
      )}
    </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const responsiveContent = contentMaxWidth ? { maxWidth: contentMaxWidth, width: '100%' as const, alignSelf: 'center' as const } : undefined;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <OfflineBanner />
        <View style={[styles.headerInfo, responsiveContent]}>
          <View style={[styles.licenseBadge,
            event?.licenseType === 'OPEN' ? styles.badgeOpen :
            event?.licenseType === 'INVITE_ONLY' ? styles.badgeInvite : styles.badgeLocation
          ]}>
            <Text style={styles.licenseBadgeText}>
              {event?.licenseType === 'OPEN' ? 'Open' :
               event?.licenseType === 'INVITE_ONLY' ? 'Invite Only' : 'Location + Time'}
            </Text>
          </View>
          {!event?.isPublic && (
            <View style={styles.privateBadge}>
              <Text style={styles.privateBadgeText}>Private</Text>
            </View>
          )}
        </View>

        {event?.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}

        {/* Permission message for INVITE_ONLY non-members */}
        {!canParticipate && event?.licenseType === 'INVITE_ONLY' && (
          <View style={styles.restrictedBanner}>
            <Ionicons name="lock-closed-outline" size={16} color="#92400e" />
            <Text style={styles.restrictedText}>
              Invite-only event — you can view tracks but cannot vote or add new ones
            </Text>
          </View>
        )}

        {/* Add track form - only for participants */}
        {canParticipate && (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>Add a track</Text>
            <View style={styles.formRow}>
              <TextInput
                style={[styles.formInput, { flex: 1, marginRight: 8 }]}
                placeholder="Title"
                placeholderTextColor="#999"
                value={title}
                onChangeText={setTitle}
                multiline={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Artist"
                placeholderTextColor="#999"
                value={artist}
                onChangeText={setArtist}
                multiline={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }, adding && styles.buttonDisabled]}
              onPress={handleAddTrack}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.addButtonText}>Add</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Tracklist ({tracks.length})
        </Text>

        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tracks yet</Text>
          }
        />

        <Modal
          visible={inviteVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setInviteVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Invite a friend</Text>
                <TouchableOpacity onPress={() => setInviteVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {loadingFriends ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
              ) : friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends to invite</Text>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={(f) => f.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item: friend }) => (
                    <View style={styles.friendRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>{friend.name}</Text>
                        <Text style={styles.friendEmail}>{friend.email}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.inviteBtn, { backgroundColor: colors.primary }, invitingId === friend.id && styles.buttonDisabled]}
                        onPress={() => handleInvite(friend.id)}
                        disabled={invitingId === friend.id}
                      >
                        {invitingId === friend.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.inviteBtnText}>Invite</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
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
  headerInfo: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  licenseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeOpen: {
    backgroundColor: '#dcfce7',
  },
  badgeInvite: {
    backgroundColor: '#fef3c7',
  },
  badgeLocation: {
    backgroundColor: '#dbeafe',
  },
  licenseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  privateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3e8ff',
  },
  privateBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b21a8',
  },
  description: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    margin: 12,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  restrictedText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
  },
  addForm: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  addButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  trackCard: {
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
  trackRank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  trackInfo: {
    flex: 1,
    marginRight: 10,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  trackArtist: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  voteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 58,
  },
  voteCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  voteLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  friendEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  inviteBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
