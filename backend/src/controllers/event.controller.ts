import { Request, Response, NextFunction } from 'express';
import * as eventService from '../services/event.service.js';
import * as voteService from '../services/vote.service.js';
import { getIO } from '../config/socket.js';

export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const event = await eventService.createEvent(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: event });

    // Broadcast to all clients if public
    const io = getIO();
    if (io && event.isPublic) {
      io.emit('eventCreated', { event });
    }
  } catch (err) {
    next(err);
  }
}

export async function getEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const event = await eventService.getEvent(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

export async function listMyEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const events = await eventService.listMyEvents(req.user!.userId);
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
}

export async function listEvents(_req: Request, res: Response, next: NextFunction) {
  try {
    const events = await eventService.listEvents();
    res.json({ success: true, data: events });
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const event = await eventService.updateEvent(
      req.params.id as string,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction) {
  try {
    await eventService.deleteEvent(req.params.id as string, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function joinEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await eventService.joinEvent(req.params.id as string, req.user!.userId);
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function inviteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const eventId = req.params.id as string;
    const member = await eventService.inviteUser(
      eventId,
      req.user!.userId,
      req.body.userId,
    );
    res.status(201).json({ success: true, data: member });

    const io = getIO();
    if (io) {
      const event = await eventService.getEvent(eventId, req.user!.userId);
      io.to(`user:${req.body.userId}`).emit('invitationReceived', {
        type: 'event',
        name: event.name,
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function addTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const eventId = req.params.id as string;
    const track = await eventService.addTrack(eventId, req.body, req.user!.userId);

    // Émettre la liste mise à jour via Socket.io
    const io = getIO();
    if (io) {
      const tracks = await eventService.getEventTracks(eventId);
      io.to(`event:${eventId}`).emit('trackAdded', { eventId, tracks });
    }

    res.status(201).json({ success: true, data: track });
  } catch (err) {
    next(err);
  }
}

export async function getEventTracks(req: Request, res: Response, next: NextFunction) {
  try {
    const tracks = await eventService.getEventTracks(req.params.id as string);
    res.json({ success: true, data: tracks });
  } catch (err) {
    next(err);
  }
}

export async function listPendingInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    const invitations = await eventService.listPendingInvitations(req.user!.userId);
    res.json({ success: true, data: invitations });
  } catch (err) {
    next(err);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await eventService.acceptInvitation(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function rejectInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    await eventService.rejectInvitation(req.params.id as string, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function voteForTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const eventId = req.params.id as string;
    const trackId = req.params.trackId as string;
    const { latitude, longitude } = req.body;

    const track = await voteService.voteForTrack(trackId, req.user!.userId, latitude, longitude);

    // Émettre la liste mise à jour via Socket.io
    const io = getIO();
    if (io) {
      const tracks = await eventService.getEventTracks(eventId);
      io.to(`event:${eventId}`).emit('trackVoted', { eventId, tracks });
    }

    res.json({ success: true, data: track });
  } catch (err) {
    next(err);
  }
}
