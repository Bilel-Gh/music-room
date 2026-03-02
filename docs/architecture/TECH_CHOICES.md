# Technology Choices — Music Room

This document explains each technology used in the project, why it was chosen over alternatives, and what it brings concretely.

---

## Express.js

**What it is**: A minimal web framework for Node.js that handles HTTP routing and middleware.

**Why Express over alternatives**:
- **vs Fastify**: Express has a much larger ecosystem and community. More tutorials, more middleware packages, easier to debug. Fastify is faster but Express is fast enough for our scale.
- **vs NestJS**: NestJS adds heavy abstractions (decorators, modules, DI containers) that would be overkill for this project. We don't need a framework that forces architectural patterns — our Routes → Controllers → Services structure is simple enough.
- **vs Hapi**: Less popular, smaller community, fewer middleware options.

**What it brings to this project**:
- Simple middleware chain: `cors → helmet → rate-limit → json → auth → routes → error handler`
- Easy integration with Passport.js for OAuth, Socket.io for real-time, and swagger-ui for documentation
- The entire backend fits in ~40 files — Express stays out of the way

**Key file**: `backend/src/app.ts` — Express setup with all middleware and routes.

---

## TypeScript

**What it is**: A superset of JavaScript that adds static types, checked at compile time.

**Why TypeScript over plain JavaScript**:
- Catches bugs before runtime: if you pass a `string` where a `number` is expected, TypeScript tells you immediately
- Autocompletion in the IDE: when you type `user.`, you see all available fields
- Self-documenting code: types serve as live documentation that never goes out of date
- Prisma generates TypeScript types from the database schema, so database queries are type-safe

**What it brings to this project**:
- Typed Socket.io events (`ServerToClientEvents`, `ClientToServerEvents`) ensure the mobile and backend agree on the event format
- Zod schemas + TypeScript types give double validation: runtime (Zod) + compile time (TS)
- Shared confidence: if it compiles, the shapes are correct

**Used in**: Both backend and mobile (100% TypeScript, zero JavaScript files).

---

## Prisma

**What it is**: An ORM (Object-Relational Mapping) for Node.js/TypeScript that generates a type-safe database client from a schema file.

**Why Prisma over alternatives**:
- **vs Raw SQL**: Raw SQL is error-prone (typos, no type checking, SQL injection risk). Prisma generates typed methods like `prisma.user.findUnique({ where: { email } })`.
- **vs TypeORM**: TypeORM uses decorators and class-based models which add complexity. Prisma uses a simple schema file (`schema.prisma`) as the single source of truth.
- **vs Sequelize**: Sequelize's TypeScript support is an afterthought. Prisma was built for TypeScript from the start.
- **vs Knex**: Knex is a query builder, not a full ORM. We'd have to define types manually.

**What it brings to this project**:
- `prisma migrate dev` handles database migrations automatically
- `prisma.$transaction()` provides atomic operations for concurrent vote/reorder scenarios
- Auto-generated types: when the schema says `name String`, the TypeScript type includes `name: string`
- `@@unique([trackId, userId])` in the schema prevents double votes at the database level

**Key files**: `backend/prisma/schema.prisma` (schema), `backend/src/lib/prisma.ts` (client singleton).

---

## PostgreSQL (hosted on Supabase)

**What it is**: A relational database that stores all application data (users, events, playlists, votes...).

**Why PostgreSQL over alternatives**:
- **vs MySQL**: PostgreSQL has better support for JSON fields, UUIDs, and advanced constraints. Better performance for complex queries.
- **vs MongoDB**: Our data is highly relational (users have events, events have tracks, tracks have votes). A relational database is the natural choice. MongoDB would require manual joins and denormalization.
- **vs SQLite**: SQLite is file-based and doesn't support concurrent writes well. Not suitable for a multi-user backend.

**Why Supabase as a host**:
- Free tier with a real PostgreSQL database (not a toy database)
- Provides both a pooled connection URL (`DATABASE_URL`) and a direct URL (`DIRECT_URL`) for Prisma migrations
- **Important**: we only use Supabase as a database host. No Supabase SDK, no Supabase Auth, no Supabase Realtime. Prisma connects directly to the PostgreSQL URL.

---

## Socket.io

**What it is**: A library that enables real-time bidirectional communication between the backend and mobile clients via WebSockets.

**Why Socket.io over alternatives**:
- **vs Raw WebSockets**: Socket.io adds automatic reconnection, room management, and event-based messaging on top of WebSockets. With raw WS, we'd have to implement all of this manually.
- **vs Server-Sent Events (SSE)**: SSE is one-directional (server → client only). We need bidirectional communication for `joinEvent`, `leaveEvent` etc.
- **vs Pusher/Ably**: Third-party services with usage-based pricing. Socket.io is free and self-hosted.

**What it brings to this project**:
- **Rooms**: `event:{id}`, `playlist:{id}`, `user:{id}` — send updates only to relevant users
- **Typed events**: `ServerToClientEvents` and `ClientToServerEvents` interfaces ensure type safety
- **Auto-reconnect**: if the connection drops (mobile going to background), Socket.io reconnects automatically
- **Transport fallback**: tries WebSocket first, falls back to HTTP long-polling if needed

**Key files**: `backend/src/config/socket.ts` (server), `mobile/src/services/socket.ts` (client).

---

## Zod

**What it is**: A TypeScript-first schema validation library for runtime input validation.

**Why Zod over alternatives**:
- **vs Joi**: Joi predates TypeScript and doesn't infer types well. Zod was built for TypeScript — when you define a schema, you get the TypeScript type for free with `z.infer<typeof schema>`.
- **vs class-validator**: Requires decorators and classes. Zod works with plain objects.
- **vs express-validator**: Chain-based API that's verbose and harder to type.

**What it brings to this project**:
- Every API input is validated before reaching the controller: email format, password length, UUID format...
- Schema definition also gives the TypeScript type: `type RegisterInput = z.infer<typeof registerSchema>`
- Error messages are structured: `[{ field: "email", message: "Invalid email" }]`
- Prevents common attacks: SQL injection (no raw strings reach the DB), type confusion

**Key files**: `backend/src/schemas/` folder (auth, user, event, playlist schemas).

---

## React Native (Expo)

**What it is**: A framework for building native mobile apps using React and TypeScript. Expo is a toolkit on top of React Native that simplifies configuration.

**Why React Native over alternatives**:
- **vs Flutter**: The backend is already TypeScript. Using React Native means the entire stack is TypeScript — one language, shared knowledge, easier to maintain.
- **vs Native (Swift/Kotlin)**: Would require writing the app twice (iOS + Android). React Native produces one codebase for both platforms.
- **vs Ionic/Cordova**: These are essentially web apps wrapped in a WebView. React Native renders actual native components — better performance and native look.

**Why Expo specifically**:
- Zero native configuration needed: no Xcode/Android Studio setup for basic features
- Built-in access to device APIs: location (`expo-location`), auth sessions (`expo-auth-session`), device info (`expo-device`)
- `EXPO_PUBLIC_API_URL` environment variable makes backend configuration easy
- `npx expo start` launches the dev server with hot reload

**Key files**: `mobile/App.tsx` (entry point), `mobile/src/navigation/AppNavigator.tsx` (navigation tree).

---

## Zustand

**What it is**: A lightweight state management library for React — simpler than Redux, more powerful than Context alone.

**Why Zustand over alternatives**:
- **vs Redux**: Redux requires actions, reducers, dispatch, middleware... too much boilerplate for our needs. Zustand is a single function call to create a store.
- **vs React Context**: Context re-renders all consumers when any value changes. Zustand allows components to subscribe to specific slices of state.
- **vs MobX**: MobX uses observables and decorators. Zustand uses plain hooks — simpler mental model.

**What it brings to this project**:
- `useAuthStore` manages tokens, user ID, premium status, and persists them with AsyncStorage
- `useNetworkStore` tracks online/offline status for the offline mode bonus
- Simple API: `useAuthStore.getState().accessToken` works both inside and outside React components (important for Axios interceptors)

**Key files**: `mobile/src/store/authStore.ts`, `mobile/src/store/networkStore.ts`.

---

## Other tools

| Tool | Purpose | Why |
|------|---------|-----|
| **bcrypt** | Password hashing | Industry standard, 10 salt rounds, timing-attack resistant |
| **jsonwebtoken** | JWT creation/verification | The standard Node.js library for JWTs |
| **Passport.js** | Google OAuth | Handles the OAuth dance (redirects, callbacks, token exchange) |
| **helmet** | HTTP security headers | Adds CSP, HSTS, X-Frame-Options etc. in one line |
| **cors** | Cross-Origin Resource Sharing | Allows the mobile app to call the backend API |
| **express-rate-limit** | Rate limiting | Prevents brute-force attacks on login/register |
| **winston** | Structured logging | File + console output with timestamps, rotation, metadata |
| **swagger-jsdoc + swagger-ui-express** | API documentation | Auto-generates interactive docs from route annotations |
| **vitest + supertest** | Testing | Fast test runner + HTTP assertions for API tests |
| **Artillery** | Load testing | Simulates concurrent users to find performance limits |
