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
  Alert,
  Keyboard,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { getSocket, connectSocket } from '../services/socket';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlist'>;

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  position: number;
  externalUrl: string | null;
}

interface PlaylistData {
  id: string;
  name: string;
  description: string | null;
  licenseType: string;
  creatorId: string;
}

interface Friend {
  id: string;
  name: string;
  email: string;
}

export default function PlaylistScreen({ route, navigation }: Props) {
  const { playlistId } = route.params;
  const userId = useAuthStore(s => s.userId);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);

  // Invite modal
  const [inviteVisible, setInviteVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    setupSocket();

    return () => {
      const socket = getSocket();
      socket.emit('leavePlaylist', playlistId);
      socket.off('playlistTrackAdded');
      socket.off('playlistTrackRemoved');
      socket.off('playlistTrackReordered');
    };
  }, [playlistId]);

  const handleDelete = useCallback(() => {
    Alert.alert('Supprimer', 'Supprimer cette playlist ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/playlists/${playlistId}`);
            navigation.goBack();
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer');
          }
        },
      },
    ]);
  }, [playlistId, navigation]);

  const openInviteModal = useCallback(async () => {
    setInviteVisible(true);
    setLoadingFriends(true);
    try {
      const { data } = await api.get('/users/me/friends');
      setFriends(data.data);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger la liste d\'amis');
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  // Header: title + actions (delete + invite for creator)
  useEffect(() => {
    if (!playlist) return;
    const isCreator = playlist.creatorId === userId;

    navigation.setOptions({
      title: playlist.name,
      ...(isCreator && {
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
      }),
    });
  }, [playlist, userId, handleDelete, openInviteModal]);

  const fetchData = async () => {
    try {
      const [plRes, tracksRes] = await Promise.all([
        api.get(`/playlists/${playlistId}`),
        api.get(`/playlists/${playlistId}/tracks`),
      ]);
      setPlaylist(plRes.data.data);
      setTracks(tracksRes.data.data);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger la playlist');
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    connectSocket();
    const socket = getSocket();
    socket.emit('joinPlaylist', playlistId);

    socket.on('playlistTrackAdded', (data) => {
      if (data.playlistId === playlistId) setTracks(data.tracks as PlaylistTrack[]);
    });
    socket.on('playlistTrackRemoved', (data) => {
      if (data.playlistId === playlistId) setTracks(data.tracks as PlaylistTrack[]);
    });
    socket.on('playlistTrackReordered', (data) => {
      if (data.playlistId === playlistId) setTracks(data.tracks as PlaylistTrack[]);
    });
  };

  const handleInvite = async (friendId: string) => {
    setInvitingId(friendId);
    try {
      await api.post(`/playlists/${playlistId}/invite`, { userId: friendId });
      Alert.alert('Succes', 'Invitation envoyee');
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible d\'inviter';
      Alert.alert('Erreur', msg);
    } finally {
      setInvitingId(null);
    }
  };

  const handleAddTrack = async () => {
    if (!title.trim() || !artist.trim()) {
      Alert.alert('Erreur', 'Titre et artiste requis');
      return;
    }

    Keyboard.dismiss();
    setAdding(true);
    try {
      await api.post(`/playlists/${playlistId}/tracks`, {
        title: title.trim(),
        artist: artist.trim(),
      });
      setTitle('');
      setArtist('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible d\'ajouter la track';
      Alert.alert('Erreur', msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    Alert.alert('Supprimer', 'Retirer cette track de la playlist ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setBusyTrackId(trackId);
          try {
            await api.delete(`/playlists/${playlistId}/tracks/${trackId}`);
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
              || 'Impossible de supprimer';
            Alert.alert('Erreur', msg);
          } finally {
            setBusyTrackId(null);
          }
        },
      },
    ]);
  };

  const handleMove = async (trackId: string, currentPos: number, direction: 'up' | 'down') => {
    const newPosition = direction === 'up' ? currentPos - 1 : currentPos + 1;
    if (newPosition < 0 || newPosition >= tracks.length) return;

    setBusyTrackId(trackId);
    try {
      const { data } = await api.put(`/playlists/${playlistId}/tracks/${trackId}/position`, {
        newPosition,
      });
      setTracks(data.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible de deplacer';
      Alert.alert('Erreur', msg);
    } finally {
      setBusyTrackId(null);
    }
  };

  const renderTrack = ({ item }: { item: PlaylistTrack }) => {
    const isBusy = busyTrackId === item.id;
    return (
      <View style={styles.trackCard}>
        <View style={styles.trackPos}>
          <Text style={styles.posNumber}>{item.position + 1}</Text>
        </View>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
        </View>
        {isBusy ? (
          <ActivityIndicator size="small" color="#4f46e5" style={{ marginRight: 8 }} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.moveBtn, item.position === 0 && styles.moveBtnDisabled]}
              onPress={() => handleMove(item.id, item.position, 'up')}
              disabled={item.position === 0}
            >
              <Text style={styles.moveBtnText}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveBtn, item.position === tracks.length - 1 && styles.moveBtnDisabled]}
              onPress={() => handleMove(item.id, item.position, 'down')}
              disabled={item.position === tracks.length - 1}
            >
              <Text style={styles.moveBtnText}>↓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteTrack(item.id)}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {playlist?.description ? (
          <Text style={styles.description}>{playlist.description}</Text>
        ) : null}

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

        <Text style={styles.sectionTitle}>
          Tracks ({tracks.length})
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
  description: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
  trackPos: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  posNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  trackInfo: {
    flex: 1,
    marginRight: 8,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  trackArtist: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moveBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveBtnDisabled: {
    opacity: 0.3,
  },
  moveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
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
