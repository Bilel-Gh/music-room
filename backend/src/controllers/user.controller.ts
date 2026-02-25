import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';

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

export async function getFriends(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.getFriends(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
