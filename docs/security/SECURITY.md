# Security — Music Room

This document lists all security measures implemented in the project, what they protect against, and where they are in the code.

## Security measures overview

```
Client Request
     │
     ▼
┌─────────────┐
│   helmet     │  ← HTTP security headers (XSS, clickjacking, MIME sniffing)
├─────────────┤
│   cors       │  ← Cross-origin access control
├─────────────┤
│ rate-limit   │  ← Brute-force protection (global + auth-specific)
├─────────────┤
│   JWT auth   │  ← Identity verification on every request
├─────────────┤
│ Zod validate │  ← Input validation (type, format, length)
├─────────────┤
│  controller  │  ← Access control (ownership, membership, permissions)
├─────────────┤
│   Prisma     │  ← Parameterized queries (SQL injection prevention)
├─────────────┤
│  bcrypt      │  ← Password hashing (brute-force resistant)
├─────────────┤
│  winston     │  ← Action logging (audit trail)
└─────────────┘
```

---

## 1. Helmet — HTTP Security Headers

**What it is**: A middleware that sets HTTP response headers to prevent common web attacks.

**What it protects against**:
- **XSS (Cross-Site Scripting)**: `Content-Security-Policy` header restricts what scripts can run
- **Clickjacking**: `X-Frame-Options` prevents the app from being embedded in iframes
- **MIME sniffing**: `X-Content-Type-Options: nosniff` prevents browsers from interpreting files as a different MIME type
- **Protocol downgrade**: `Strict-Transport-Security` (HSTS) forces HTTPS

**Where**: `backend/src/app.ts:19`
```typescript
app.use(helmet());
```

One line, 11 security headers. Helmet uses sensible defaults — no configuration needed for our case.

---

## 2. CORS — Cross-Origin Resource Sharing

**What it is**: Controls which domains can make requests to our API.

**What it protects against**: Prevents unauthorized websites from making API calls on behalf of a user (cross-origin attacks).

**Where**: `backend/src/app.ts:18`
```typescript
app.use(cors());
```

Currently configured to allow all origins (`*`) since the mobile app and development tools need access. In production, this should be restricted to specific domains.

---

## 3. Rate Limiting

**What it is**: Limits the number of requests a single IP address can make in a time window.

**What it protects against**: Brute-force attacks on login/registration, and API abuse.

**Where**: `backend/src/config/rate-limit.ts`

### Two levels of rate limiting:

| Limiter | Scope | Limit | Window | Applied to |
|---------|-------|-------|--------|-----------|
| `globalLimiter` | All routes | 200 requests | 15 minutes | `backend/src/app.ts:20` |
| `authLimiter` | Auth routes only | 5 requests | 15 minutes | `backend/src/routes/auth.routes.ts` (on login, register, forgot-password) |

**Example attack prevented**: An attacker trying to guess passwords can only attempt 5 logins every 15 minutes per IP. After that, they get a 429 response:
```json
{ "success": false, "error": "Too many requests, please try again later" }
```

Both limiters are disabled during tests (`NODE_ENV=test`) to avoid flaky test results.

---

## 4. JWT Authentication

**What it is**: JSON Web Tokens verify user identity on every API request.

**What it protects against**: Unauthorized access to protected resources.

**Where**: `backend/src/middleware/auth.middleware.ts`

```typescript
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid token' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;  // { userId, email }
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
```

**Security details**:
- Access tokens expire after **15 minutes** (short-lived to minimize damage if stolen)
- Refresh tokens expire after **7 days**
- Two separate secrets: `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Token is always in the `Authorization` header, never in URL parameters (prevents leakage in logs)

See `docs/auth/JWT_FLOW.md` for the complete authentication flow.

---

## 5. Password Hashing (bcrypt)

**What it is**: Passwords are hashed with bcrypt before storage. The original password is never stored or retrievable.

**What it protects against**: Even if the database is leaked, attackers can't recover passwords.

**Where**: `backend/src/services/auth.service.ts:32` (registration) and `auth.service.ts:64` (login)

```typescript
// Registration: hash the password
const hashedPassword = await bcrypt.hash(data.password, 10);

// Login: compare submitted password with hash
const valid = await bcrypt.compare(password, user.password);
```

**Why bcrypt with 10 rounds**: Each round doubles the computation time. 10 rounds means ~100ms per hash — fast enough for users, slow enough to make brute-force impractical. An attacker trying to crack a bcrypt hash would need ~100ms per attempt, making dictionary attacks extremely slow.

---

## 6. Input Validation (Zod)

**What it is**: Every API input is validated against a Zod schema before reaching the controller. Invalid requests are rejected with a 400 error.

**What it protects against**:
- **SQL injection**: No raw strings reach the database (Prisma parameterizes + Zod validates)
- **Type confusion**: A string where a number is expected is caught before it can cause errors
- **Oversized inputs**: Length limits prevent abuse (e.g., password must be >= 8 characters)
- **Format enforcement**: Email must be valid email format, UUIDs must be valid UUIDs

**Where**: `backend/src/middleware/validate.middleware.ts` + `backend/src/schemas/` folder

```typescript
// Example: register schema
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
```

**Error response format**:
```json
{
  "success": false,
  "errors": [
    { "field": "email", "message": "Invalid email" },
    { "field": "password", "message": "String must contain at least 8 character(s)" }
  ]
}
```

**Validated routes**:
- `POST /auth/register` — email, password (>=8), name (>=2)
- `POST /auth/login` — email, password
- `POST /auth/refresh` — refreshToken
- `POST /auth/verify-email` — email, code (6 digits)
- `POST /auth/forgot-password` — email
- `POST /auth/reset-password` — token, password (>=8)
- `PUT /users/me` — name, publicInfo, friendsInfo, privateInfo, musicPreferences
- `POST /events` — name (>=2), description, isPublic, licenseType, time/location
- `POST /events/:id/tracks` — title, artist, externalUrl, location
- `POST /events/:id/tracks/:trackId/vote` — latitude, longitude
- `POST /playlists` — name (>=2), description, isPublic, licenseType
- `POST /playlists/:id/tracks` — title, artist, externalUrl
- `PUT /playlists/:id/tracks/:trackId/position` — newPosition (integer >= 0)
- `POST /events/:id/invite` — userId (UUID)
- `POST /playlists/:id/invite` — userId (UUID), canEdit (boolean)

---

## 7. Access Control

**What it is**: Beyond authentication (who are you?), access control checks authorization (what can you do?).

**What it protects against**: Users accessing or modifying resources they shouldn't.

**Where**: Various service files

| Check | Where | What it does |
|-------|-------|-------------|
| Event creator only | `event.service.ts:119,139` | Only the creator can update/delete an event |
| Playlist creator only | `playlist.service.ts:116,129` | Only the creator can update/delete a playlist |
| Invite-only events | `event.service.ts:159` | Can't join INVITE_ONLY events without invitation |
| Playlist edit permission | `playlist.service.ts:31-48` | INVITE_ONLY playlists: must be accepted member with `canEdit=true` |
| Playlist view permission | `playlist.service.ts:10-28` | Private playlists: only accepted members can view |
| Profile visibility | `user.service.ts` | Three visibility levels: public, friends-only, private |
| Event membership | `vote.service.ts:36-42` | INVITE_ONLY events: must be member to vote |
| Location/time gating | `vote.service.ts:44-63` | LOCATION_TIME events: must be within 5km + time window |
| Premium feature gate | `middleware/premium.middleware.ts` | Playlist creation gated behind premium when enabled |

---

## 8. SQL Injection Prevention

**What it is**: Prisma ORM uses parameterized queries, which means user input is never concatenated directly into SQL strings.

**What it protects against**: SQL injection — where an attacker submits `'; DROP TABLE users; --` as input.

**Where**: Implicit in all Prisma calls throughout the codebase.

```typescript
// What we write:
await prisma.user.findUnique({ where: { email } });

// What Prisma generates (parameterized):
// SELECT * FROM "User" WHERE "email" = $1  (with $1 = email value)

// NOT this (vulnerable):
// SELECT * FROM "User" WHERE "email" = '${email}'
```

Combined with Zod validation (which ensures proper types before they reach Prisma), SQL injection is effectively impossible in this codebase.

---

## 9. Action Logging (Winston)

**What it is**: Every API request is logged with metadata about the user, platform, and device.

**What it protects against**: Provides an audit trail for investigating security incidents.

**Where**: `backend/src/config/logger.ts` (logger setup) + `backend/src/middleware/logger.middleware.ts` (request logging)

**Log format**:
```
2024-03-01 14:30:00 [INFO] POST /api/events | user=abc-123 | platform=ios | device=iPhone 15 | version=1.0.0
```

**Log storage**:
- Console output (development)
- File: `backend/logs/app.log` (max 5MB, rotated, 3 files kept)

The mobile app sends platform, device, and app version on every request via custom headers:
- `X-Platform`: ios, android, web
- `X-Device`: device model name
- `X-App-Version`: app version from `app.json`

**File**: `mobile/src/services/api.ts:20-23` — Axios interceptor adds these headers.

---

## 10. Sensitive Data Protection

### Environment variables
All secrets are stored in `.env` files and never committed to git:
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`, `DIRECT_URL`

The `.env.example` files contain empty values as templates.

### Password reset token security
- Token is a 32-byte cryptographically random hex string (`crypto.randomBytes(32)`)
- Expires after 30 minutes
- Cleared from database immediately after use
- `forgotPassword()` returns the same message whether the email exists or not (prevents email enumeration)

### Email verification code security
- 6-digit random code
- Expires after 15 minutes
- Cleared from database after successful verification

---

## Identified threats and mitigations

### Implemented

| Threat | Mitigation | Status |
|--------|------------|--------|
| Brute-force login | Rate limiting (5 req/15min on auth routes) | Implemented |
| Stolen JWT | Short expiry (15min access token) | Implemented |
| Password leak | bcrypt hashing (10 rounds) | Implemented |
| XSS | Helmet security headers | Implemented |
| Clickjacking | X-Frame-Options via Helmet | Implemented |
| SQL injection | Prisma parameterized queries + Zod validation | Implemented |
| Invalid input | Zod schemas on all routes | Implemented |
| Unauthorized access | JWT middleware + access control checks | Implemented |
| CSRF | Not applicable (API uses Bearer tokens, not cookies) | N/A |

### Not implemented (possible improvements)

| Threat | Possible mitigation | Why not implemented |
|--------|--------------------|--------------------|
| Token theft via device access | Encrypted token storage (Expo SecureStore) | AsyncStorage is sufficient for this scope |
| Refresh token reuse | Token blacklist / rotation with DB storage | Would add complexity; current approach is acceptable |
| DDoS | Cloud-level WAF (Cloudflare, AWS Shield) | Infrastructure-level concern, not application-level |
| Account takeover via email | 2FA (TOTP/SMS) | Beyond project scope |
| API key leakage | API key rotation + vault (HashiCorp Vault) | Only one API (Google), managed via env variables |
| Session fixation | Not applicable (stateless JWT, no server sessions) | N/A |
