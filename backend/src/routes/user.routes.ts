import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateProfileSchema } from '../schemas/user.schema.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// Toutes les routes user sont protégées
router.use(authenticate);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Mon profil complet
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil de l'utilisateur connecté
 *       401:
 *         description: Non authentifié
 */
router.get('/me', userController.getMe);

/**
 * @swagger
 * /users/me:
 *   put:
 *     summary: Modifier mon profil
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
 *                 example: "Fan de jazz"
 *               friendsInfo:
 *                 type: string
 *                 example: "Dispo le samedi pour des concerts"
 *               privateInfo:
 *                 type: string
 *                 example: "Mon vrai nom est Jean-Pierre"
 *               musicPreferences:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["jazz", "rock", "electro"]
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *       401:
 *         description: Non authentifié
 */
router.put('/me', validate(updateProfileSchema), userController.updateMe);

/**
 * @swagger
 * /users/me/friends:
 *   get:
 *     summary: Liste de mes amis
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des amis acceptés
 */
router.get('/me/friends', userController.getFriends);

/**
 * @swagger
 * /users/friend-requests/{friendId}:
 *   post:
 *     summary: Envoyer une demande d'ami
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
 *         description: Demande envoyée
 *       400:
 *         description: Impossible de s'ajouter soi-même
 *       404:
 *         description: Utilisateur non trouvé
 *       409:
 *         description: Demande déjà existante
 */
router.post('/friend-requests/:friendId', userController.sendFriendRequest);

/**
 * @swagger
 * /users/friend-requests/{friendId}/accept:
 *   put:
 *     summary: Accepter une demande d'ami
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
 *         description: Demande acceptée
 *       404:
 *         description: Aucune demande en attente
 */
router.put('/friend-requests/:friendId/accept', userController.acceptFriendRequest);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Voir le profil d'un utilisateur (visibilité selon relation)
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
 *         description: Profil (champs visibles selon la relation)
 *       404:
 *         description: Utilisateur non trouvé
 */
router.get('/:id', userController.getUserProfile);

export default router;
