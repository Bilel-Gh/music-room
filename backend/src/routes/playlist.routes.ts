import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createPlaylistSchema,
  updatePlaylistSchema,
  addPlaylistTrackSchema,
  reorderTrackSchema,
  inviteUserSchema,
} from '../schemas/playlist.schema.js';
import * as playlistController from '../controllers/playlist.controller.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /playlists:
 *   get:
 *     summary: List public playlists
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of playlists
 */
router.get('/', playlistController.listPlaylists);

/**
 * @swagger
 * /playlists/me:
 *   get:
 *     summary: My playlists (created or joined)
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user playlists
 */
router.get('/me', playlistController.listMyPlaylists);

/**
 * @swagger
 * /playlists:
 *   post:
 *     summary: Create a playlist
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Chill Vibes"
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               licenseType:
 *                 type: string
 *                 enum: [OPEN, INVITE_ONLY]
 *     responses:
 *       201:
 *         description: Playlist created
 */
router.post('/', validate(createPlaylistSchema), playlistController.createPlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   get:
 *     summary: Playlist details
 *     tags: [Playlists]
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
 *         description: Playlist details
 *       404:
 *         description: Playlist not found
 */
router.get('/:id', playlistController.getPlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   put:
 *     summary: Update a playlist (creator only)
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Playlist updated
 *       403:
 *         description: Unauthorized
 */
router.put('/:id', validate(updatePlaylistSchema), playlistController.updatePlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   delete:
 *     summary: Delete a playlist (creator only)
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Playlist deleted
 *       403:
 *         description: Unauthorized
 */
router.delete('/:id', playlistController.deletePlaylist);

/**
 * @swagger
 * /playlists/{id}/tracks:
 *   get:
 *     summary: List playlist tracks (sorted by position)
 *     tags: [Playlists]
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
 *         description: List of tracks
 */
router.get('/:id/tracks', playlistController.getPlaylistTracks);

/**
 * @swagger
 * /playlists/{id}/tracks:
 *   post:
 *     summary: Add a track to the playlist
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, artist]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Clair de Lune"
 *               artist:
 *                 type: string
 *                 example: "Debussy"
 *               externalUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Track added
 *       403:
 *         description: No edit access
 */
router.post('/:id/tracks', validate(addPlaylistTrackSchema), playlistController.addTrack);

/**
 * @swagger
 * /playlists/{id}/tracks/{trackId}:
 *   delete:
 *     summary: Remove a track from the playlist
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: trackId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Track removed
 *       403:
 *         description: No edit access
 *       404:
 *         description: Track not found
 */
router.delete('/:id/tracks/:trackId', playlistController.removeTrack);

/**
 * @swagger
 * /playlists/{id}/tracks/{trackId}/position:
 *   put:
 *     summary: Reorder a track in the playlist
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: trackId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPosition]
 *             properties:
 *               newPosition:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       200:
 *         description: Updated list with new positions
 *       403:
 *         description: No edit access
 *       404:
 *         description: Track not found
 */
router.put('/:id/tracks/:trackId/position', validate(reorderTrackSchema), playlistController.reorderTrack);

/**
 * @swagger
 * /playlists/{id}/invite:
 *   post:
 *     summary: Invite a user to the playlist
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *               canEdit:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: User invited
 *       403:
 *         description: Only the creator can invite
 *       409:
 *         description: Already a member
 */
router.post('/:id/invite', validate(inviteUserSchema), playlistController.inviteUser);

export default router;
