# API Design — Music Room

## REST principles applied in this project

REST (Representational State Transfer) is a set of conventions for designing web APIs. Here's how each principle is applied:

### 1. Resources are nouns, not verbs

Each URL represents a "thing" (resource), not an action. The HTTP method (verb) tells the server what to do with it.

```
Good:  POST /api/events          (create an event)
Bad:   POST /api/createEvent     (verb in URL)

Good:  GET /api/users/me         (get my profile)
Bad:   GET /api/getMyProfile     (verb in URL)
```

### 2. HTTP methods have meaning

| Method | Meaning | Example |
|--------|---------|---------|
| `GET` | Read a resource (no side effects) | `GET /api/events` — list events |
| `POST` | Create a new resource | `POST /api/events` — create event |
| `PUT` | Update an existing resource | `PUT /api/events/:id` — update event |
| `DELETE` | Remove a resource | `DELETE /api/events/:id` — delete event |

### 3. Stateless

Each request contains everything the server needs to process it (the JWT token in the header). The server doesn't store session state between requests.

### 4. Consistent response format

Every endpoint returns the same JSON structure:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": "Error message"
}

// Validation error
{
  "success": false,
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```

### 5. Meaningful HTTP status codes

| Code | Meaning | When it's used |
|------|---------|---------------|
| `200` | OK | Successful read or update |
| `201` | Created | Successful creation (POST) |
| `204` | No Content | Successful delete (nothing to return) |
| `400` | Bad Request | Validation error (Zod) or malformed input |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | Authenticated but not allowed (not creator, not member, etc.) |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate (email already taken, already a member) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |

### Why JSON?

JSON (JavaScript Object Notation) is the standard format for REST APIs because:
- It's native to JavaScript/TypeScript (our entire stack)
- It's human-readable and easy to debug
- Every HTTP client and framework supports it natively
- It's lightweight compared to XML

---

## Endpoint families

### Authentication (`/api/auth`)

Handles user registration, login, token refresh, email verification, password reset, and Google OAuth.

| Method | Endpoint | Auth? | Purpose |
|--------|----------|-------|---------|
| `POST` | `/register` | No | Create account |
| `POST` | `/login` | No | Login with email/password |
| `POST` | `/refresh` | No | Get new token pair |
| `POST` | `/verify-email` | No | Verify email with 6-digit code |
| `POST` | `/forgot-password` | No | Request password reset |
| `POST` | `/reset-password` | No | Reset password with token |
| `PUT` | `/link-google` | Yes | Link Google account |
| `GET` | `/google` | No | Start Google OAuth (web) |
| `GET` | `/google/callback` | No | Google OAuth callback (web) |
| `POST` | `/google/mobile` | No | Google OAuth (mobile ID token) |

**Rate limited**: `/register`, `/login`, `/forgot-password` (5 req/15min).

### Users (`/api/users`)

Profile management, friend system, and user search.

| Method | Endpoint | Auth? | Purpose |
|--------|----------|-------|---------|
| `GET` | `/me` | Yes | Get my profile |
| `PUT` | `/me` | Yes | Update my profile |
| `GET` | `/me/friends` | Yes | List my friends |
| `PUT` | `/me/subscription` | Yes | Toggle premium |
| `GET` | `/search?q=...` | Yes | Search users by name/email |
| `GET` | `/friend-requests/pending` | Yes | List pending requests |
| `POST` | `/friend-requests/:friendId` | Yes | Send friend request |
| `PUT` | `/friend-requests/:friendId/accept` | Yes | Accept request |
| `DELETE` | `/friend-requests/:friendId/reject` | Yes | Reject request |
| `DELETE` | `/friends/:friendId` | Yes | Remove friend |
| `GET` | `/:id` | Yes | View user profile (visibility rules) |

### Events (`/api/events`)

Music voting events — create, join, add tracks, vote.

| Method | Endpoint | Auth? | Purpose |
|--------|----------|-------|---------|
| `GET` | `/` | Yes | List public events |
| `GET` | `/me` | Yes | List my events |
| `GET` | `/invitations` | Yes | List pending invitations |
| `POST` | `/` | Yes | Create event |
| `GET` | `/:id` | Yes | Get event details |
| `PUT` | `/:id` | Yes | Update event (creator only) |
| `DELETE` | `/:id` | Yes | Delete event (creator only) |
| `POST` | `/:id/join` | Yes | Join OPEN event |
| `POST` | `/:id/accept` | Yes | Accept invitation |
| `DELETE` | `/:id/reject` | Yes | Reject invitation |
| `POST` | `/:id/invite` | Yes | Invite user (creator only) |
| `GET` | `/:id/tracks` | Yes | List tracks (sorted by votes) |
| `POST` | `/:id/tracks` | Yes | Add a track |
| `POST` | `/:id/tracks/:trackId/vote` | Yes | Vote/unvote on a track |

### Playlists (`/api/playlists`)

Collaborative playlists — create, edit, reorder, invite.

| Method | Endpoint | Auth? | Premium? | Purpose |
|--------|----------|-------|----------|---------|
| `GET` | `/` | Yes | No | List public playlists |
| `GET` | `/me` | Yes | No | List my playlists |
| `GET` | `/invitations` | Yes | No | List pending invitations |
| `POST` | `/` | Yes | Yes | Create playlist |
| `GET` | `/:id` | Yes | No | Get playlist details |
| `PUT` | `/:id` | Yes | No | Update playlist (creator only) |
| `DELETE` | `/:id` | Yes | No | Delete playlist (creator only) |
| `GET` | `/:id/tracks` | Yes | No | List tracks (sorted by position) |
| `POST` | `/:id/tracks` | Yes | Yes | Add track |
| `DELETE` | `/:id/tracks/:trackId` | Yes | Yes | Remove track |
| `PUT` | `/:id/tracks/:trackId/position` | Yes | Yes | Reorder track |
| `POST` | `/:id/invite` | Yes | No | Invite user |
| `POST` | `/:id/accept` | Yes | No | Accept invitation |
| `DELETE` | `/:id/reject` | Yes | No | Reject invitation |

### Other endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/docs` | Swagger UI documentation |
| `GET` | `/api/config/features` | Feature flags (premiumEnabled) |

---

## Swagger documentation

The API is fully documented with Swagger/OpenAPI annotations. Interactive documentation is available at:

```
http://localhost:3001/api/docs
```

**How it works**:
- Each route file contains JSDoc-style Swagger annotations (`@swagger`)
- `swagger-jsdoc` extracts these annotations and generates an OpenAPI specification
- `swagger-ui-express` serves an interactive web page where you can browse and test endpoints

**Files**:
- `backend/src/config/swagger.ts` — Swagger configuration
- `backend/src/routes/*.routes.ts` — Swagger annotations on each route

**How to read the Swagger docs**:
1. Start the backend (`make dev`)
2. Open `http://localhost:3001/api/docs` in a browser
3. Each endpoint shows: HTTP method, URL, required parameters, request body schema, possible responses
4. Click "Try it out" to send a test request directly from the browser
5. Add your JWT token in the "Authorize" button to test authenticated endpoints

---

## Route file structure

Each route file follows the same pattern:

```
backend/src/routes/
├── auth.routes.ts       ← 271 lines (routes + Swagger annotations)
├── user.routes.ts       ← 247 lines
├── event.routes.ts      ← 377 lines
└── playlist.routes.ts   ← 378 lines
```

A typical route definition:

```typescript
/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody: ...
 *     responses:
 *       201: ...
 *       401: ...
 */
router.post('/', authenticate, validate(createEventSchema), createEvent);
```

The middleware chain is: `authenticate` (JWT) → `validate` (Zod schema) → controller function.
