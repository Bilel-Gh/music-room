import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

interface ServerToClientEvents {
  trackAdded: (data: { eventId: string; tracks: unknown[] }) => void;
  trackVoted: (data: { eventId: string; tracks: unknown[] }) => void;
  playlistTrackAdded: (data: { playlistId: string; tracks: unknown[] }) => void;
  playlistTrackRemoved: (data: { playlistId: string; tracks: unknown[] }) => void;
  playlistTrackReordered: (data: { playlistId: string; tracks: unknown[] }) => void;
}

interface ClientToServerEvents {
  joinEvent: (eventId: string) => void;
  leaveEvent: (eventId: string) => void;
  joinPlaylist: (playlistId: string) => void;
  leavePlaylist: (playlistId: string) => void;
}

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initSocketServer(httpServer: HttpServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    socket.on('joinEvent', (eventId) => {
      socket.join(`event:${eventId}`);
    });

    socket.on('leaveEvent', (eventId) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on('joinPlaylist', (playlistId) => {
      socket.join(`playlist:${playlistId}`);
    });

    socket.on('leavePlaylist', (playlistId) => {
      socket.leave(`playlist:${playlistId}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}
