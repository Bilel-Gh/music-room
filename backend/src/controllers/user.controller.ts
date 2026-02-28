import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';
import { getIO } from '../config/socket.js';

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.getMe(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.updateMe(req.user!.userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const targetId = req.params.id as string;
    const result = await userService.getUserProfile(targetId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function sendFriendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const friendId = req.params.friendId as string;
    const result = await userService.sendFriendRequest(req.user!.userId, friendId);
    res.status(201).json({ success: true, data: result });

    // Notify target user in real-time
    const io = getIO();
    if (io) {
      const sender = await userService.getMe(req.user!.userId);
      io.to(`user:${friendId}`).emit('friendRequestReceived', {
        from: { id: sender.id, name: sender.name, email: sender.email },
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function acceptFriendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const friendId = req.params.friendId as string;
    const result = await userService.acceptFriendRequest(req.user!.userId, friendId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = (req.query.q || req.query.email) as string;
    if (!q || q.length < 2) {
      res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
      return;
    }
    const results = await userService.searchUsers(q, req.user!.userId);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

export async function rejectFriendRequest(req: Request, res: Response, next: NextFunction) {
  try {
    await userService.rejectFriendRequest(req.user!.userId, req.params.friendId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getPendingRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.getPendingRequests(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function removeFriend(req: Request, res: Response, next: NextFunction) {
  try {
    await userService.removeFriend(req.user!.userId, req.params.friendId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getFriends(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.getFriends(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function toggleSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.toggleSubscription(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
