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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import OfflineBanner from '../components/OfflineBanner';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useNetworkStore } from '../store/networkStore';
import { getSocket, connectSocket } from '../services/socket';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

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
  isPublic: boolean;
  creatorId: string;
  membership: { canEdit: boolean } | null;
}

interface Friend {
  id: string;
  name: string;
  email: string;
}

export default function PlaylistScreen({ route, navigation }: Props) {
  const { playlistId } = route.params;
  const userId = useAuthStore(s => s.userId);
  const isPremium = useAuthStore(s => s.isPremium);
  const premiumEnabled = useAuthStore(s => s.premiumEnabled);
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsive();
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
  const [inviteCanEdit, setInviteCanEdit] = useState<Record<string, boolean>>({});

  const hasEditPermission = playlist
    ? playlist.licenseType === 'OPEN' || (playlist.membership?.canEdit === true)
    : false;
  const canEdit = premiumEnabled ? (hasEditPermission && isPremium) : hasEditPermission;

  const isCreator = playlist?.creatorId === userId;

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
    crossAlert('Supprimer', 'Supprimer cette playlist ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/playlists/${playlistId}`);
            navigation.goBack();
          } catch {
            crossAlert('Erreur', 'Impossible de supprimer');
          }
        },
      },
    ]);
  }, [playlistId, navigation]);

  const openInviteModal = useCallback(async () => {
    setInviteVisible(true);
    setLoadingFriends(true);
    setInviteCanEdit({});
    try {
      const { data } = await api.get('/users/me/friends');
      setFriends(data.data);
      // Default all to editor
      const defaults: Record<string, boolean> = {};
      for (const f of data.data) {
        defaults[f.id] = true;
      }
      setInviteCanEdit(defaults);
    } catch {
      crossAlert('Erreur', 'Impossible de charger la liste d\'amis');
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (!playlist) return;
    if (!isCreator) return;

    navigation.setOptions({
      title: playlist.name,
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
  }, [playlist, userId, isCreator, handleDelete, openInviteModal, colors.primary]);

  // Set title for non-creators too
  useEffect(() => {
    if (!playlist) return;
    if (isCreator) return;
    navigation.setOptions({ title: playlist.name });
  }, [playlist, isCreator]);

  const fetchData = async () => {
    try {
      const [plRes, tracksRes] = await Promise.all([
        api.get(`/playlists/${playlistId}`),
        api.get(`/playlists/${playlistId}/tracks`),
      ]);
      setPlaylist(plRes.data.data);
      setTracks(tracksRes.data.data);
    } catch {
      crossAlert('Erreur', 'Impossible de charger la playlist');
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
      await api.post(`/playlists/${playlistId}/invite`, {
        userId: friendId,
        canEdit: inviteCanEdit[friendId] ?? true,
      });
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
    if (!useNetworkStore.getState().isConnected) {
      crossAlert('Mode Hors-Ligne', 'Cette action necessite une connexion internet.');
      return;
    }
    if (!title.trim() || !artist.trim()) {
      crossAlert('Erreur', 'Titre et artiste requis');
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
      crossAlert('Erreur', msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!useNetworkStore.getState().isConnected) {
      crossAlert('Mode Hors-Ligne', 'Cette action necessite une connexion internet.');
      return;
    }
    crossAlert('Supprimer', 'Retirer cette track de la playlist ?', [
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
            crossAlert('Erreur', msg);
          } finally {
            setBusyTrackId(null);
          }
        },
      },
    ]);
  };

  const handleMove = async (trackId: string, currentPos: number, direction: 'up' | 'down') => {
    if (!useNetworkStore.getState().isConnected) {
      crossAlert('Mode Hors-Ligne', 'Cette action necessite une connexion internet.');
      return;
    }
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
      crossAlert('Erreur', msg);
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
        {canEdit && (
          isBusy ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
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
          )
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <OfflineBanner />
        {/* License badge */}
        <View style={[styles.headerInfo, contentMaxWidth ? { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]}>
          <View style={[styles.licenseBadge,
            playlist?.licenseType === 'OPEN' ? styles.lbOpen : styles.lbInvite
          ]}>
            <Text style={styles.licenseBadgeText}>
              {playlist?.licenseType === 'OPEN' ? 'Ouvert' : 'Sur invitation'}
            </Text>
          </View>
          {!playlist?.isPublic && (
            <View style={styles.privateBadge}>
              <Text style={styles.privateBadgeText}>Prive</Text>
            </View>
          )}
        </View>

        {playlist?.description ? (
          <Text style={styles.description}>{playlist.description}</Text>
        ) : null}

        {/* Read-only message for viewers */}
        {!canEdit && playlist?.licenseType === 'INVITE_ONLY' && !premiumEnabled && (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="eye-outline" size={16} color="#1e40af" />
            <Text style={styles.readOnlyText}>Lecture seule — vous ne pouvez pas modifier cette playlist</Text>
          </View>
        )}

        {/* Premium gate banner */}
        {premiumEnabled && !isPremium && hasEditPermission && (
          <View style={[styles.readOnlyBanner, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="lock-closed-outline" size={16} color="#92400e" />
            <Text style={[styles.readOnlyText, { color: '#92400e' }]}>
              Premium required — upgrade in your Profile to edit playlists
            </Text>
          </View>
        )}

        {/* Add track form - only for editors */}
        {canEdit && (
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
              style={[styles.addButton, { backgroundColor: colors.primary }, adding && styles.buttonDisabled]}
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

        {/* Invite modal with canEdit toggle */}
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
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
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
                        <View style={styles.permRow}>
                          <Text style={styles.permLabel}>
                            {inviteCanEdit[friend.id] ? 'Editeur' : 'Lecteur'}
                          </Text>
                          <Switch
                            value={inviteCanEdit[friend.id] ?? true}
                            onValueChange={(val) =>
                              setInviteCanEdit(prev => ({ ...prev, [friend.id]: val }))
                            }
                            trackColor={{ true: colors.primary, false: '#ddd' }}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.inviteBtn, { backgroundColor: colors.primary }, invitingId === friend.id && styles.buttonDisabled]}
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
  lbOpen: {
    backgroundColor: '#dcfce7',
  },
  lbInvite: {
    backgroundColor: '#fef3c7',
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
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    margin: 12,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
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
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  permLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
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
