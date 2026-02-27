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
 *     summary: List public events
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events
 */
router.get('/', eventController.listEvents);

/**
 * @swagger
 * /events:
 *   post:
 *     summary: Create an event
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
 *                 example: "Jazz Night"
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
 *         description: Event created
 */
router.post('/', validate(createEventSchema), eventController.createEvent);

/**
 * @swagger
 * /events/me:
 *   get:
 *     summary: My events (created or joined)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user events
 */
router.get('/me', eventController.listMyEvents);

/**
 * @swagger
 * /events/invitations:
 *   get:
 *     summary: List my pending invitations
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of invitations
 */
router.get('/invitations', eventController.listPendingInvitations);

/**
 * @swagger
 * /events/{id}:
 *   get:
 *     summary: Event details
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
 *         description: Event details
 *       404:
 *         description: Event not found
 */
router.get('/:id', eventController.getEvent);

/**
 * @swagger
 * /events/{id}:
 *   put:
 *     summary: Update an event (creator only)
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
 *         description: Event updated
 *       403:
 *         description: Unauthorized (not the creator)
 */
router.put('/:id', validate(updateEventSchema), eventController.updateEvent);

/**
 * @swagger
 * /events/{id}:
 *   delete:
 *     summary: Delete an event (creator only)
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
 *         description: Event deleted
 *       403:
 *         description: Unauthorized
 */
router.delete('/:id', eventController.deleteEvent);

/**
 * @swagger
 * /events/{id}/join:
 *   post:
 *     summary: Join an event
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
 *         description: Successfully joined
 *       403:
 *         description: Invite-only event
 *       409:
 *         description: Already a member
 */
/**
 * @swagger
 * /events/{id}/accept:
 *   post:
 *     summary: Accept an invitation
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
 *         description: Invitation accepted
 *       404:
 *         description: No pending invitation
 */
router.post('/:id/accept', eventController.acceptInvitation);

/**
 * @swagger
 * /events/{id}/reject:
 *   delete:
 *     summary: Reject an invitation
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
 *         description: Invitation rejected
 *       404:
 *         description: No pending invitation
 */
router.delete('/:id/reject', eventController.rejectInvitation);

router.post('/:id/join', eventController.joinEvent);

/**
 * @swagger
 * /events/{id}/invite:
 *   post:
 *     summary: Invite a user to the event
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
 *         description: User invited
 *       403:
 *         description: Only the creator can invite
 *       409:
 *         description: Already a member
 */
router.post('/:id/invite', validate(inviteEventSchema), eventController.inviteUser);

/**
 * @swagger
 * /events/{id}/tracks:
 *   get:
 *     summary: List tracks sorted by votes
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
 *         description: List of tracks
 */
router.get('/:id/tracks', eventController.getEventTracks);

/**
 * @swagger
 * /events/{id}/tracks:
 *   post:
 *     summary: Add a track to the event
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
 *         description: Track added
 *       403:
 *         description: Unauthorized (invite-only event)
 */
router.post('/:id/tracks', validate(addTrackSchema), eventController.addTrack);

/**
 * @swagger
 * /events/{id}/tracks/{trackId}/vote:
 *   post:
 *     summary: Vote for a track
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
 *         description: Vote recorded
 *       403:
 *         description: Unauthorized (not a member or out of range)
 *       409:
 *         description: Already voted
 */
router.post('/:id/tracks/:trackId/vote', validate(voteSchema), eventController.voteForTrack);

export default router;
