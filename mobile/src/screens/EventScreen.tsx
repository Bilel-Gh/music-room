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
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { getSocket, connectSocket } from '../services/socket';

type Props = NativeStackScreenProps<RootStackParamList, 'Event'>;

interface Track {
  id: string;
  title: string;
  artist: string;
  voteCount: number;
  externalUrl: string | null;
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
  const [event, setEvent] = useState<EventData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [adding, setAdding] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  // Invite modal
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
    crossAlert('Supprimer', 'Supprimer cet evenement ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/events/${eventId}`);
            navigation.goBack();
          } catch {
            crossAlert('Erreur', 'Impossible de supprimer');
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
      crossAlert('Erreur', 'Impossible de charger la liste d\'amis');
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
            <Ionicons name="person-add-outline" size={22} color="#4f46e5" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [event, userId, handleDelete, openInviteModal]);

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
      crossAlert('Erreur', 'Impossible de charger l\'evenement');
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
      crossAlert('Succes', 'Invitation envoyee');
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible d\'inviter';
      crossAlert('Erreur', msg);
    } finally {
      setInvitingId(null);
    }
  };

  const handleAddTrack = async () => {
    if (!title.trim() || !artist.trim()) {
      crossAlert('Erreur', 'Titre et artiste requis');
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
          crossAlert('Erreur', 'La localisation est requise pour ajouter des tracks dans cet evenement');
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
        || 'Impossible d\'ajouter la track';
      crossAlert('Erreur', msg);
    } finally {
      setAdding(false);
    }
  };

  const handleVote = async (trackId: string) => {
    setVotingId(trackId);
    try {
      const body: Record<string, number> = {};

      if (event?.licenseType === 'LOCATION_TIME') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          crossAlert('Erreur', 'La localisation est requise pour voter dans cet evenement');
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
        || 'Impossible de voter';
      crossAlert('Erreur', msg);
    } finally {
      setVotingId(null);
    }
  };

  const renderTrack = ({ item, index }: { item: Track; index: number }) => (
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
          style={styles.voteButton}
          onPress={() => handleVote(item.id)}
          disabled={votingId === item.id}
        >
          {votingId === item.id ? (
            <ActivityIndicator size="small" color="#4f46e5" />
          ) : (
            <>
              <Text style={styles.voteCount}>{item.voteCount}</Text>
              <Text style={styles.voteLabel}>Vote</Text>
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {/* License badge + description */}
        <View style={styles.headerInfo}>
          <View style={[styles.licenseBadge,
            event?.licenseType === 'OPEN' ? styles.badgeOpen :
            event?.licenseType === 'INVITE_ONLY' ? styles.badgeInvite : styles.badgeLocation
          ]}>
            <Text style={styles.licenseBadgeText}>
              {event?.licenseType === 'OPEN' ? 'Ouvert' :
               event?.licenseType === 'INVITE_ONLY' ? 'Sur invitation' : 'Lieu + Horaire'}
            </Text>
          </View>
          {!event?.isPublic && (
            <View style={styles.privateBadge}>
              <Text style={styles.privateBadgeText}>Prive</Text>
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
              Evenement sur invitation — vous pouvez voir les tracks mais pas voter ni en ajouter
            </Text>
          </View>
        )}

        {/* Add track form - only for participants */}
        {canParticipate && (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>Ajouter une track</Text>
            <View style={styles.formRow}>
              <TextInput
                style={[styles.formInput, { flex: 1, marginRight: 8 }]}
                placeholder="Titre"
                placeholderTextColor="#999"
                value={title}
                onChangeText={setTitle}
                multiline={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Artiste"
                placeholderTextColor="#999"
                value={artist}
                onChangeText={setArtist}
                multiline={false}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
            <TouchableOpacity
              style={[styles.addButton, adding && styles.buttonDisabled]}
              onPress={handleAddTrack}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.addButtonText}>Ajouter</Text>
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
            <Text style={styles.emptyText}>Aucune track pour le moment</Text>
          }
        />

        {/* Invite modal */}
        <Modal
          visible={inviteVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setInviteVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Inviter un ami</Text>
                <TouchableOpacity onPress={() => setInviteVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {loadingFriends ? (
                <ActivityIndicator size="large" color="#4f46e5" style={{ marginVertical: 30 }} />
              ) : friends.length === 0 ? (
                <Text style={styles.emptyText}>Aucun ami a inviter</Text>
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
                        style={[styles.inviteBtn, invitingId === friend.id && styles.buttonDisabled]}
                        onPress={() => handleInvite(friend.id)}
                        disabled={invitingId === friend.id}
                      >
                        {invitingId === friend.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.inviteBtnText}>Inviter</Text>
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
    backgroundColor: '#4f46e5',
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
    backgroundColor: '#eef2ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 58,
  },
  voteCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4f46e5',
  },
  voteLabel: {
    fontSize: 11,
    color: '#6366f1',
    marginTop: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
    fontSize: 15,
  },
  // Invite modal
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
    backgroundColor: '#4f46e5',
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
