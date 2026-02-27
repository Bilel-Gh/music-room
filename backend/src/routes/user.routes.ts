import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateProfileSchema } from '../schemas/user.schema.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// All user routes are protected
router.use(authenticate);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get my full profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Not authenticated
 */
router.get('/me', userController.getMe);

/**
 * @swagger
 * /users/me:
 *   put:
 *     summary: Update my profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jean Dupont
 *               publicInfo:
 *                 type: string
 *                 example: "Jazz fan"
 *               friendsInfo:
 *                 type: string
 *                 example: "Available on Saturdays for concerts"
 *               privateInfo:
 *                 type: string
 *                 example: "My real name is Jean-Pierre"
 *               musicPreferences:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["jazz", "rock", "electro"]
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Not authenticated
 */
router.put('/me', validate(updateProfileSchema), userController.updateMe);

/**
 * @swagger
 * /users/me/friends:
 *   get:
 *     summary: List my friends
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accepted friends
 */
router.get('/me/friends', userController.getFriends);

/**
 * @swagger
 * /users/friends/{friendId}:
 *   delete:
 *     summary: Remove a friend
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Friend removed
 *       404:
 *         description: Friendship not found
 */
router.delete('/friends/:friendId', userController.removeFriend);

/**
 * @swagger
 * /users/search:
 *   get:
 *     summary: Search users by name or email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search by name or email (min 2 chars)
 *     responses:
 *       200:
 *         description: Matching users
 *       400:
 *         description: Query too short
 */
router.get('/search', userController.searchUsers);

/**
 * @swagger
 * /users/friend-requests/pending:
 *   get:
 *     summary: Pending friend requests
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending requests
 */
router.get('/friend-requests/pending', userController.getPendingRequests);

/**
 * @swagger
 * /users/friend-requests/{friendId}:
 *   post:
 *     summary: Send a friend request
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Request sent
 *       400:
 *         description: Cannot add yourself
 *       404:
 *         description: User not found
 *       409:
 *         description: Request already exists
 */
router.post('/friend-requests/:friendId', userController.sendFriendRequest);

/**
 * @swagger
 * /users/friend-requests/{friendId}/accept:
 *   put:
 *     summary: Accept a friend request
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request accepted
 *       404:
 *         description: No pending request
 */
router.put('/friend-requests/:friendId/accept', userController.acceptFriendRequest);

/**
 * @swagger
 * /users/friend-requests/{friendId}/reject:
 *   delete:
 *     summary: Reject a friend request
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Request rejected
 *       404:
 *         description: No pending request found
 */
router.delete('/friend-requests/:friendId/reject', userController.rejectFriendRequest);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: View a user profile (visibility based on relationship)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Profile (visible fields depend on relationship)
 *       404:
 *         description: User not found
 */
router.get('/:id', userController.getUserProfile);

export default router;
