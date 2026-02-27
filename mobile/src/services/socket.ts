import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

let socket: Socket | null = null;

// Listeners for notification badge
type FriendRequestListener = (data: { from: { id: string; name: string; email: string } }) => void;
const friendRequestListeners: Set<FriendRequestListener> = new Set();

type InvitationListener = (data: { type: 'event' | 'playlist'; name: string }) => void;
const invitationListeners: Set<InvitationListener> = new Set();

export function onFriendRequest(listener: FriendRequestListener) {
  friendRequestListeners.add(listener);
  return () => { friendRequestListeners.delete(listener); };
}

export function onInvitation(listener: InvitationListener) {
  invitationListeners.add(listener);
  return () => { invitationListeners.delete(listener); };
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });

    socket.on('connect', () => {
      console.log('[Socket.io] Connected:', socket?.id);
      // Join user-specific room for notifications
      const userId = useAuthStore.getState().userId;
      if (userId) {
        socket?.emit('authenticate', userId);
      }
    });

    socket.on('connect_error', (err) => {
      console.log('[Socket.io] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.io] Disconnected:', reason);
    });

    socket.on('friendRequestReceived', (data) => {
      friendRequestListeners.forEach(listener => listener(data));
    });

    socket.on('invitationReceived', (data) => {
      invitationListeners.forEach(listener => listener(data));
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
