import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
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
import api from '../services/api';
import { onFriendRequest } from '../services/socket';
import { crossAlert } from '../utils/alert';

interface PendingRequest {
  id: string;
  name: string;
  email: string;
  requestId: string;
}

interface EventInvitation {
  invitationId: string;
  event: {
    id: string;
    name: string;
    description: string | null;
    licenseType: string;
    creator: { id: string; name: string };
  };
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  useEffect(() => {
    const unsub = onFriendRequest((data) => {
      const newReq: PendingRequest = {
        id: data.from.id,
        name: data.from.name,
        email: data.from.email,
        requestId: '',
      };
      setRequests(prev => {
        if (prev.some(r => r.id === newReq.id)) return prev;
        return [newReq, ...prev];
      });
    });
    return unsub;
  }, []);

  const loadAll = async () => {
    try {
      const [friendRes, inviteRes] = await Promise.all([
        api.get('/users/friend-requests/pending'),
        api.get('/events/invitations'),
      ]);
      setRequests(friendRes.data.data);
      setInvitations(inviteRes.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, []);

  const handleAcceptFriend = async (friendId: string) => {
    setBusyId(`friend-${friendId}`);
    try {
      await api.put(`/users/friend-requests/${friendId}/accept`);
      setRequests(prev => prev.filter(r => r.id !== friendId));
      crossAlert('Succes', 'Demande acceptee');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible d\'accepter';
      crossAlert('Erreur', msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectFriend = async (friendId: string) => {
    setBusyId(`friend-${friendId}`);
    try {
      await api.delete(`/users/friend-requests/${friendId}/reject`);
      setRequests(prev => prev.filter(r => r.id !== friendId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible de refuser';
      crossAlert('Erreur', msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptEvent = async (eventId: string) => {
    setBusyId(`event-${eventId}`);
    try {
      await api.post(`/events/${eventId}/accept`);
      setInvitations(prev => prev.filter(i => i.event.id !== eventId));
      crossAlert('Succes', 'Invitation acceptee');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible d\'accepter';
      crossAlert('Erreur', msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectEvent = async (eventId: string) => {
    setBusyId(`event-${eventId}`);
    try {
      await api.delete(`/events/${eventId}/reject`);
      setInvitations(prev => prev.filter(i => i.event.id !== eventId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible de refuser';
      crossAlert('Erreur', msg);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const isEmpty = requests.length === 0 && invitations.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucune notification</Text>
          </View>
        ) : (
          <>
            {/* Event invitations */}
            {invitations.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Invitations evenements</Text>
                {invitations.map(inv => {
                  const busy = busyId === `event-${inv.event.id}`;
                  return (
                    <View key={inv.invitationId} style={styles.requestCard}>
                      <View style={styles.requestInfo}>
                        <View style={[styles.avatar, { backgroundColor: '#7c3aed' }]}>
                          <Ionicons name="musical-notes" size={20} color="#fff" />
                        </View>
                        <View style={styles.textBlock}>
                          <Text style={styles.reqName} numberOfLines={1}>{inv.event.name}</Text>
                          <Text style={styles.reqEmail}>Par {inv.event.creator.name}</Text>
                          <Text style={styles.inviteLabel}>Invitation a un evenement</Text>
                        </View>
                      </View>

                      {busy ? (
                        <ActivityIndicator size="small" color="#4f46e5" />
                      ) : (
                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() => handleAcceptEvent(inv.event.id)}
                          >
                            <Ionicons name="checkmark" size={20} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleRejectEvent(inv.event.id)}
                          >
                            <Ionicons name="close" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {/* Friend requests */}
            {requests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Demandes d'amis</Text>
                {requests.map(req => {
                  const busy = busyId === `friend-${req.id}`;
                  return (
                    <View key={req.id} style={styles.requestCard}>
                      <TouchableOpacity
                        style={styles.requestInfo}
                        onPress={() => navigation.navigate('UserProfile', { userId: req.id })}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{getInitials(req.name)}</Text>
                        </View>
                        <View style={styles.textBlock}>
                          <Text style={styles.reqName}>{req.name}</Text>
                          <Text style={styles.reqEmail}>{req.email}</Text>
                          <Text style={styles.reqLabel}>Demande d'ami</Text>
                        </View>
                      </TouchableOpacity>

                      {busy ? (
                        <ActivityIndicator size="small" color="#4f46e5" />
                      ) : (
                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() => handleAcceptFriend(req.id)}
                          >
                            <Ionicons name="checkmark" size={20} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleRejectFriend(req.id)}
                          >
                            <Ionicons name="close" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    marginTop: 12,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  requestInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  textBlock: {
    flex: 1,
  },
  reqName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  reqEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
  },
  reqLabel: {
    fontSize: 12,
    color: '#6366f1',
    marginTop: 3,
    fontWeight: '500',
  },
  inviteLabel: {
    fontSize: 12,
    color: '#7c3aed',
    marginTop: 3,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
