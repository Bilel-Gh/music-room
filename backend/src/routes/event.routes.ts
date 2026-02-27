import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createEventSchema,
  updateEventSchema,
  addTrackSchema,
  voteSchema,
  inviteEventSchema,
} from '../schemas/event.schema.js';
import * as eventController from '../controllers/event.controller.js';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /events:
 *   get:
 *     summary: Lister les événements publics
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des événements
 */
router.get('/', eventController.listEvents);

/**
 * @swagger
 * /events:
 *   post:
 *     summary: Créer un événement
 *     tags: [Events]
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
 *                 example: "Soirée Jazz"
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               licenseType:
 *                 type: string
 *                 enum: [OPEN, INVITE_ONLY, LOCATION_TIME]
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Événement créé
 */
router.post('/', validate(createEventSchema), eventController.createEvent);

/**
 * @swagger
 * /events/me:
 *   get:
 *     summary: Mes evenements (crees ou rejoints)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des evenements de l'utilisateur
 */
router.get('/me', eventController.listMyEvents);

/**
 * @swagger
 * /events/invitations:
 *   get:
 *     summary: Lister mes invitations en attente
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des invitations
 */
router.get('/invitations', eventController.listPendingInvitations);

/**
 * @swagger
 * /events/{id}:
 *   get:
 *     summary: Détails d'un événement
 *     tags: [Events]
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
 *         description: Détails de l'événement
 *       404:
 *         description: Événement non trouvé
 */
router.get('/:id', eventController.getEvent);

/**
 * @swagger
 * /events/{id}:
 *   put:
 *     summary: Modifier un événement (créateur uniquement)
 *     tags: [Events]
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
 *         description: Événement mis à jour
 *       403:
 *         description: Non autorisé (pas le créateur)
 */
router.put('/:id', validate(updateEventSchema), eventController.updateEvent);

/**
 * @swagger
 * /events/{id}:
 *   delete:
 *     summary: Supprimer un événement (créateur uniquement)
 *     tags: [Events]
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
 *         description: Événement supprimé
 *       403:
 *         description: Non autorisé
 */
router.delete('/:id', eventController.deleteEvent);

/**
 * @swagger
 * /events/{id}/join:
 *   post:
 *     summary: Rejoindre un événement
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Rejoint avec succès
 *       403:
 *         description: Événement sur invitation uniquement
 *       409:
 *         description: Déjà membre
 */
/**
 * @swagger
 * /events/{id}/accept:
 *   post:
 *     summary: Accepter une invitation
 *     tags: [Events]
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
 *         description: Invitation acceptee
 *       404:
 *         description: Pas d'invitation en attente
 */
router.post('/:id/accept', eventController.acceptInvitation);

/**
 * @swagger
 * /events/{id}/reject:
 *   delete:
 *     summary: Refuser une invitation
 *     tags: [Events]
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
 *         description: Invitation refusee
 *       404:
 *         description: Pas d'invitation en attente
 */
router.delete('/:id/reject', eventController.rejectInvitation);

router.post('/:id/join', eventController.joinEvent);

/**
 * @swagger
 * /events/{id}/invite:
 *   post:
 *     summary: Inviter un utilisateur a l'evenement
 *     tags: [Events]
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
 *     responses:
 *       201:
 *         description: Utilisateur invite
 *       403:
 *         description: Seul le createur peut inviter
 *       409:
 *         description: Deja membre
 */
router.post('/:id/invite', validate(inviteEventSchema), eventController.inviteUser);

/**
 * @swagger
 * /events/{id}/tracks:
 *   get:
 *     summary: Liste des tracks triées par votes
 *     tags: [Events]
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
router.get('/:id/tracks', eventController.getEventTracks);

/**
 * @swagger
 * /events/{id}/tracks:
 *   post:
 *     summary: Ajouter une track à l'événement
 *     tags: [Events]
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
 *                 example: "So What"
 *               artist:
 *                 type: string
 *                 example: "Miles Davis"
 *               externalUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Track ajoutée
 *       403:
 *         description: Non autorisé (événement sur invitation)
 */
router.post('/:id/tracks', validate(addTrackSchema), eventController.addTrack);

/**
 * @swagger
 * /events/{id}/tracks/{trackId}/vote:
 *   post:
 *     summary: Voter pour une track
 *     tags: [Events]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Vote enregistré
 *       403:
 *         description: Non autorisé (pas membre ou hors zone)
 *       409:
 *         description: Déjà voté
 */
router.post('/:id/tracks/:trackId/vote', validate(voteSchema), eventController.voteForTrack);

export default router;
