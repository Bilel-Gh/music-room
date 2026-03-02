# JWT Authentication Flow — Music Room

## What is JWT?

JWT (JSON Web Token) is a way to prove who you are without the server needing to remember you. After login, the server gives you a signed token containing your user ID and email. On every following request, you send this token back, and the server verifies the signature to confirm it's legit.

Think of it as a concert wristband: you show your ID once at the entrance (login), get a wristband (JWT), and then just show the wristband to get in anywhere.

## The two tokens

Music Room uses two tokens:

| Token | Lifetime | Purpose | Secret |
|-------|----------|---------|--------|
| **Access Token** | 15 minutes | Used on every API request | `JWT_SECRET` |
| **Refresh Token** | 7 days | Used to get a new access token when it expires | `JWT_REFRESH_SECRET` |

Both tokens contain the same payload: `{ userId, email }`.

Why two tokens? The access token is short-lived for security: if someone steals it, they only have 15 minutes. But we don't want users to re-login every 15 minutes, so the refresh token (stored securely on the device) can request a new access token silently.

## Flow diagrams

### Registration

```
Mobile                          Backend                         Database
  │                                │                                │
  │  POST /api/auth/register       │                                │
  │  { email, password, name }     │                                │
  │───────────────────────────────▶│                                │
  │                                │  Check if email exists          │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Hash password (bcrypt, 10     │
  │                                │  rounds)                       │
  │                                │                                │
  │                                │  Generate 6-digit verification │
  │                                │  code (15min expiry)           │
  │                                │                                │
  │                                │  Create user in DB             │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Generate access token (15m)   │
  │                                │  Generate refresh token (7d)   │
  │                                │                                │
  │  { user, accessToken,          │                                │
  │    refreshToken }              │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Store tokens in AsyncStorage  │                                │
  │  Navigate to email verification│                                │
```

**Files involved**:
- `backend/src/routes/auth.routes.ts` — Route definition with Zod validation
- `backend/src/controllers/auth.controller.ts` — `register()` function
- `backend/src/services/auth.service.ts:26-56` — Registration logic (hash, create, tokens)
- `backend/src/schemas/auth.schema.ts` — `registerSchema` (email, password >=8 chars, name >=2 chars)

### Login

```
Mobile                          Backend                         Database
  │                                │                                │
  │  POST /api/auth/login          │                                │
  │  { email, password }           │                                │
  │───────────────────────────────▶│                                │
  │                                │  Find user by email            │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  bcrypt.compare(password,      │
  │                                │                  user.password)│
  │                                │                                │
  │                                │  If invalid → 401              │
  │                                │  If valid  → generate tokens   │
  │                                │                                │
  │  { user, accessToken,          │                                │
  │    refreshToken }              │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Store tokens in AsyncStorage  │                                │
  │  Parse userId from JWT payload │                                │
  │  Navigate to Home              │                                │
```

**Files involved**:
- `backend/src/services/auth.service.ts:58-75` — `login()` function
- `mobile/src/store/authStore.ts` — `setTokens()` stores in AsyncStorage and parses JWT

### Authenticated request (every API call)

```
Mobile                          Backend
  │                                │
  │  GET /api/events               │
  │  Authorization: Bearer <token> │
  │  X-Platform: ios               │
  │  X-Device: iPhone 15           │
  │  X-App-Version: 1.0.0          │
  │───────────────────────────────▶│
  │                                │
  │                      ┌─────────┴─────────┐
  │                      │ auth.middleware.ts │
  │                      │                   │
  │                      │ 1. Extract token  │
  │                      │    from header    │
  │                      │                   │
  │                      │ 2. jwt.verify()   │
  │                      │    with JWT_SECRET│
  │                      │                   │
  │                      │ 3. Attach payload │
  │                      │    to req.user    │
  │                      │    { userId,      │
  │                      │      email }      │
  │                      │                   │
  │                      │ If invalid:       │
  │                      │ → 401 response    │
  │                      └─────────┬─────────┘
  │                                │
  │                                │  Continue to controller...
  │                                │  req.user.userId is available
```

**File**: `backend/src/middleware/auth.middleware.ts` — 22 lines, checks `Authorization: Bearer <token>`, verifies signature, attaches `{ userId, email }` to `req.user`.

### Token refresh (when access token expires)

```
Mobile                          Backend                         Database
  │                                │                                │
  │  Any API call fails with 401   │                                │
  │  (access token expired)        │                                │
  │                                │                                │
  │  Axios interceptor catches 401 │                                │
  │                                │                                │
  │  POST /api/auth/refresh        │                                │
  │  { refreshToken }              │                                │
  │───────────────────────────────▶│                                │
  │                                │  jwt.verify(refreshToken,      │
  │                                │           JWT_REFRESH_SECRET)  │
  │                                │                                │
  │                                │  If invalid → 401              │
  │                                │                                │
  │                                │  Find user by payload.userId   │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Generate new token pair       │
  │                                │                                │
  │  { accessToken, refreshToken } │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Update stored tokens          │                                │
  │  Retry original request        │                                │
  │  with new access token         │                                │
```

**Files involved**:
- `mobile/src/services/api.ts:29-57` — Axios response interceptor catches 401, calls refresh, retries
- `backend/src/services/auth.service.ts:77-93` — `refreshToken()` verifies old refresh token, generates new pair

### Email verification

```
Mobile                          Backend                         Database
  │                                │                                │
  │  POST /api/auth/verify-email   │                                │
  │  { email, code: "123456" }     │                                │
  │───────────────────────────────▶│                                │
  │                                │  Find user by email            │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Check: code matches?          │
  │                                │  Check: not expired (15min)?   │
  │                                │                                │
  │                                │  Update user:                  │
  │                                │  emailVerified = true          │
  │                                │  verificationCode = null       │
  │                                │───────────────────────────────▶│
  │                                │                                │
  │  { message: "Email verified" } │                                │
  │◀───────────────────────────────│                                │
```

**File**: `backend/src/services/auth.service.ts:95-123` — `verifyEmail()` function.

Note: In development, the verification code is logged to the console (`console.log`) instead of being sent by email. This is intentional — the email service would be a production dependency.

### Password reset

```
1. POST /api/auth/forgot-password { email }
   → Generates a random 32-byte hex token (30min expiry)
   → Logs token to console (no email sent in dev)
   → Always returns same message (doesn't reveal if email exists)

2. POST /api/auth/reset-password { token, password }
   → Finds user with matching non-expired token
   → Hashes new password with bcrypt
   → Clears reset token from database
```

**File**: `backend/src/services/auth.service.ts:125-167` — `forgotPassword()` and `resetPassword()`.

## Token structure

Both tokens are standard JWTs with three parts: `header.payload.signature`

**Payload**:
```json
{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "iat": 1709312400,
  "exp": 1709313300
}
```

- `iat` (issued at): when the token was created
- `exp` (expiration): when it becomes invalid (15 min for access, 7 days for refresh)

The signature is created using HMAC-SHA256 with the secret key. If anyone modifies the payload, the signature won't match, and `jwt.verify()` will reject it.

## Token storage on mobile

Tokens are stored in **AsyncStorage** (React Native's local key-value store):

```
asyncStorage:
  auth_access_token  → "eyJhbGciOiJIUzI1..."
  auth_refresh_token → "eyJhbGciOiJIUzI1..."
```

On app startup, `authStore.loadTokens()` reads these from AsyncStorage and restores the session without requiring a new login.

**File**: `mobile/src/store/authStore.ts` — Zustand store with `setTokens()`, `logout()`, and `loadTokens()`.

## Security considerations

- **Access token in memory + AsyncStorage**: The Zustand store holds the current token in memory for fast access, and persists to AsyncStorage for session restoration
- **No token in URL**: Tokens are always in the `Authorization` header, never in query parameters
- **Refresh token rotation**: Each refresh generates a completely new pair of tokens
- **Secret separation**: Access and refresh tokens use different secrets (`JWT_SECRET` vs `JWT_REFRESH_SECRET`)
