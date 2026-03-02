import { Request, Response, NextFunction } from 'express';
import * as playlistService from '../services/playlist.service.js';
import { getIO } from '../config/socket.js';

async function emitPlaylistUpdate(playlistId: string, userId: string, event: 'playlistTrackAdded' | 'playlistTrackRemoved' | 'playlistTrackReordered') {
  const io = getIO();
  if (!io) return;
  const tracks = await playlistService.getPlaylistTracks(playlistId, userId);
  io.to(`playlist:${playlistId}`).emit(event, { playlistId, tracks });
}

export async function createPlaylist(req: Request, res: Response, next: NextFunction) {
  try {
    const playlist = await playlistService.createPlaylist(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: playlist });

    const io = getIO();
    if (io && playlist.isPublic !== false) {
      io.emit('playlistCreated', { playlist });
    }
  } catch (err) {
    next(err);
  }
}

export async function getPlaylist(req: Request, res: Response, next: NextFunction) {
  try {
    const playlist = await playlistService.getPlaylist(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: playlist });
  } catch (err) {
    next(err);
  }
}

export async function listPlaylists(_req: Request, res: Response, next: NextFunction) {
  try {
    const playlists = await playlistService.listPlaylists();
    res.json({ success: true, data: playlists });
  } catch (err) {
    next(err);
  }
}

export async function listMyPlaylists(req: Request, res: Response, next: NextFunction) {
  try {
    const playlists = await playlistService.listMyPlaylists(req.user!.userId);
    res.json({ success: true, data: playlists });
  } catch (err) {
    next(err);
  }
}

export async function updatePlaylist(req: Request, res: Response, next: NextFunction) {
  try {
    const playlist = await playlistService.updatePlaylist(
      req.params.id as string,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: playlist });
  } catch (err) {
    next(err);
  }
}

export async function deletePlaylist(req: Request, res: Response, next: NextFunction) {
  try {
    const playlistId = req.params.id as string;
    await playlistService.deletePlaylist(playlistId, req.user!.userId);
    const io = getIO();
    if (io) io.emit('playlistDeleted', { playlistId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const playlistId = req.params.id as string;
    const track = await playlistService.addTrack(playlistId, req.body, req.user!.userId);
    await emitPlaylistUpdate(playlistId, req.user!.userId, 'playlistTrackAdded');
    res.status(201).json({ success: true, data: track });
  } catch (err) {
    next(err);
  }
}

export async function removeTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const playlistId = req.params.id as string;
    await playlistService.removeTrack(playlistId, req.params.trackId as string, req.user!.userId);
    await emitPlaylistUpdate(playlistId, req.user!.userId, 'playlistTrackRemoved');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function reorderTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const playlistId = req.params.id as string;
    await playlistService.reorderTrack(
      playlistId,
      req.params.trackId as string,
      req.body.newPosition,
      req.user!.userId,
    );
    await emitPlaylistUpdate(playlistId, req.user!.userId, 'playlistTrackReordered');
    const tracks = await playlistService.getPlaylistTracks(playlistId, req.user!.userId);
    res.json({ success: true, data: tracks });
  } catch (err) {
    next(err);
  }
}

export async function inviteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const playlistId = req.params.id as string;
    const member = await playlistService.inviteUser(
      playlistId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data: member });

    const io = getIO();
    if (io) {
      const playlist = await playlistService.getPlaylist(playlistId, req.user!.userId);
      if (playlist) {
        io.to(`user:${req.body.userId}`).emit('invitationReceived', {
          type: 'playlist',
          name: playlist.name,
        });
      }
    }
  } catch (err) {
    next(err);
  }
}

export async function getPlaylistTracks(req: Request, res: Response, next: NextFunction) {
  try {
    const tracks = await playlistService.getPlaylistTracks(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: tracks });
  } catch (err) {
    next(err);
  }
}

export async function listPendingInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await playlistService.listPendingInvitations(req.user!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    await playlistService.acceptInvitation(req.params.id as string, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function rejectInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    await playlistService.rejectInvitation(req.params.id as string, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
