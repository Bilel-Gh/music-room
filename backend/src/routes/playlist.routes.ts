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
 *     summary: Lister les playlists publiques
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des playlists
 */
router.get('/', playlistController.listPlaylists);

/**
 * @swagger
 * /playlists/me:
 *   get:
 *     summary: Mes playlists (creees ou rejointes)
 *     tags: [Playlists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des playlists de l'utilisateur
 */
router.get('/me', playlistController.listMyPlaylists);

/**
 * @swagger
 * /playlists:
 *   post:
 *     summary: Creer une playlist
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
 *         description: Playlist creee
 */
router.post('/', validate(createPlaylistSchema), playlistController.createPlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   get:
 *     summary: Details d'une playlist
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
 *         description: Details de la playlist
 *       404:
 *         description: Playlist non trouvee
 */
router.get('/:id', playlistController.getPlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   put:
 *     summary: Modifier une playlist (createur uniquement)
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
 *         description: Playlist mise a jour
 *       403:
 *         description: Non autorise
 */
router.put('/:id', validate(updatePlaylistSchema), playlistController.updatePlaylist);

/**
 * @swagger
 * /playlists/{id}:
 *   delete:
 *     summary: Supprimer une playlist (createur uniquement)
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
 *         description: Playlist supprimee
 *       403:
 *         description: Non autorise
 */
router.delete('/:id', playlistController.deletePlaylist);

/**
 * @swagger
 * /playlists/{id}/tracks:
 *   get:
 *     summary: Liste des tracks de la playlist (triees par position)
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
 *         description: Liste des tracks
 */
router.get('/:id/tracks', playlistController.getPlaylistTracks);

/**
 * @swagger
 * /playlists/{id}/tracks:
 *   post:
 *     summary: Ajouter une track a la playlist
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
 *         description: Track ajoutee
 *       403:
 *         description: Pas le droit d'editer
 */
router.post('/:id/tracks', validate(addPlaylistTrackSchema), playlistController.addTrack);

/**
 * @swagger
 * /playlists/{id}/tracks/{trackId}:
 *   delete:
 *     summary: Supprimer une track de la playlist
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
 *         description: Track supprimee
 *       403:
 *         description: Pas le droit d'editer
 *       404:
 *         description: Track non trouvee
 */
router.delete('/:id/tracks/:trackId', playlistController.removeTrack);

/**
 * @swagger
 * /playlists/{id}/tracks/{trackId}/position:
 *   put:
 *     summary: Reordonner une track dans la playlist
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
 *         description: Liste mise a jour avec nouvelles positions
 *       403:
 *         description: Pas le droit d'editer
 *       404:
 *         description: Track non trouvee
 */
router.put('/:id/tracks/:trackId/position', validate(reorderTrackSchema), playlistController.reorderTrack);

/**
 * @swagger
 * /playlists/{id}/invite:
 *   post:
 *     summary: Inviter un utilisateur a la playlist
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
 *         description: Utilisateur invite
 *       403:
 *         description: Seul le createur peut inviter
 *       409:
 *         description: Deja membre
 */
router.post('/:id/invite', validate(inviteUserSchema), playlistController.inviteUser);

export default router;
