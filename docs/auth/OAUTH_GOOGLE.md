# Google OAuth Flow — Music Room

## What is OAuth?

OAuth is a way to let users log in with their Google account instead of creating a new password. The user clicks "Sign in with Google", gets redirected to Google's login page, and Google tells our backend "yes, this person is who they say they are". We never see or store the user's Google password.

## How it works — Mobile flow

The mobile app uses a specific flow because it can't do browser redirects the same way a web app does. Instead of redirecting to Google, the mobile app opens a browser modal, gets a Google ID token, and sends it to our backend for verification.

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  Mobile  │         │  Google  │         │ Backend  │         │ Database │
│  App     │         │  OAuth   │         │          │         │          │
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │                     │                    │                    │
     │  1. User taps       │                    │                    │
     │  "Sign in with      │                    │                    │
     │   Google"           │                    │                    │
     │                     │                    │                    │
     │  2. Open browser    │                    │                    │
     │  modal with Google  │                    │                    │
     │  login page         │                    │                    │
     │────────────────────▶│                    │                    │
     │                     │                    │                    │
     │  3. User enters     │                    │                    │
     │  Google credentials │                    │                    │
     │  (we never see      │                    │                    │
     │   these)            │                    │                    │
     │                     │                    │                    │
     │  4. Google returns   │                    │                    │
     │  an ID token        │                    │                    │
     │◀────────────────────│                    │                    │
     │                     │                    │                    │
     │  5. POST /api/auth/google/mobile         │                    │
     │  { idToken: "eyJ..." }                   │                    │
     │─────────────────────────────────────────▶│                    │
     │                     │                    │                    │
     │                     │  6. Verify token   │                    │
     │                     │  with Google API   │                    │
     │                     │◀───────────────────│                    │
     │                     │───────────────────▶│                    │
     │                     │                    │                    │
     │                     │                    │  7. Check: does    │
     │                     │                    │  this Google ID    │
     │                     │                    │  or email exist?   │
     │                     │                    │───────────────────▶│
     │                     │                    │◀───────────────────│
     │                     │                    │                    │
     │                     │                    │  8a. New user:     │
     │                     │                    │  create account    │
     │                     │                    │  8b. Existing email│
     │                     │                    │  : link Google ID  │
     │                     │                    │  8c. Known Google  │
     │                     │                    │  ID: just login    │
     │                     │                    │───────────────────▶│
     │                     │                    │                    │
     │                     │                    │  9. Generate JWT   │
     │                     │                    │  access + refresh  │
     │                     │                    │  tokens            │
     │                     │                    │                    │
     │  10. { user, accessToken, refreshToken } │                    │
     │◀─────────────────────────────────────────│                    │
     │                     │                    │                    │
     │  11. Store tokens   │                    │                    │
     │  in AsyncStorage    │                    │                    │
     │  Navigate to Home   │                    │                    │
```

## Step-by-step code walkthrough

### Step 1-4: Mobile opens Google login

**File**: `mobile/src/screens/LoginScreen.tsx`

The mobile app uses `expo-auth-session` to open a Google login modal. This library handles the browser popup and captures the Google response:

1. The app opens a browser window to Google's OAuth consent screen
2. The user logs in with their Google account
3. Google redirects back to the app with an ID token
4. The `expo-auth-session` library captures this token

The Google Client ID used here (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) must match the one configured in the Google Cloud Console.

### Step 5: Mobile sends token to backend

**File**: `mobile/src/screens/LoginScreen.tsx`

After getting the Google ID token, the mobile app sends it to our backend:

```
POST /api/auth/google/mobile
{ "idToken": "eyJhbGciOiJSUzI1NiIs..." }
```

### Step 6: Backend verifies with Google

**File**: `backend/src/services/auth.service.ts:195-238` — `googleMobileLogin()`

The backend calls Google's token verification API:

```
GET https://oauth2.googleapis.com/tokeninfo?id_token=eyJ...
```

Google responds with the decoded token payload:
```json
{
  "sub": "109876543210",          // Google user ID
  "email": "user@gmail.com",
  "email_verified": "true",
  "name": "John Doe",
  "aud": "123456789.apps.googleusercontent.com"  // Must match our client ID
}
```

The backend performs two critical checks:
1. **Audience check**: `payload.aud` must equal our `GOOGLE_CLIENT_ID`. This prevents tokens meant for other apps from being accepted.
2. **Email verified**: Google must have confirmed the email belongs to this person.

### Steps 7-8: Find or create user

**File**: `backend/src/services/auth.service.ts:212-232`

Three scenarios are handled:

| Scenario | What happens |
|----------|--------------|
| **Google ID already known** | User found by `googleId` → just login |
| **Email exists but no Google ID** | User found by `email` → link Google ID to existing account, mark email as verified |
| **Completely new user** | Create a new account with Google data (no password needed) |

This logic ensures that if someone registered with email/password first and later tries Google OAuth with the same email, their accounts are merged rather than duplicated.

### Step 9-11: Generate tokens and respond

Same as regular login: the backend generates a JWT access token (15min) and refresh token (7d), sends them to the mobile app, which stores them in AsyncStorage.

## Web OAuth flow (Passport.js)

There's also a traditional web OAuth flow using Passport.js for browser-based access:

```
Browser                         Backend                     Google
  │                                │                           │
  │  GET /api/auth/google          │                           │
  │───────────────────────────────▶│                           │
  │                                │  Redirect to Google       │
  │  302 Redirect                  │──────────────────────────▶│
  │◀───────────────────────────────│                           │
  │                                │                           │
  │  User logs in on Google        │                           │
  │───────────────────────────────────────────────────────────▶│
  │                                │                           │
  │                                │  Google callback with     │
  │                                │  profile data             │
  │  GET /api/auth/google/callback │◀──────────────────────────│
  │───────────────────────────────▶│                           │
  │                                │  Find/create user         │
  │                                │  Generate JWT tokens      │
  │                                │                           │
  │  Redirect with tokens          │                           │
  │◀───────────────────────────────│                           │
```

**File**: `backend/src/config/passport.ts` — Passport.js Google Strategy configuration.

The Passport strategy does the same user lookup logic (find by googleId or email, create if new). The main difference is that it's callback-based (Google redirects the browser back to `/api/auth/google/callback`).

## Linking Google to an existing account

Users who registered with email/password can later link their Google account:

```
PUT /api/auth/link-google
Authorization: Bearer <token>
{ "googleId": "109876543210" }
```

**File**: `backend/src/services/auth.service.ts:169-181` — `linkGoogle()`

This checks that the Google ID isn't already linked to another account (409 conflict), then updates the user's `googleId` field.

## Configuration required

| Variable | Where | Purpose |
|----------|-------|---------|
| `GOOGLE_CLIENT_ID` | Backend `.env` | Identifies our app to Google |
| `GOOGLE_CLIENT_SECRET` | Backend `.env` | Secret key for web OAuth callback |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Mobile `.env` | Same client ID for the mobile flow |

Both must point to the same Google Cloud project. The Google Cloud Console must have the OAuth consent screen configured with the correct redirect URIs.
