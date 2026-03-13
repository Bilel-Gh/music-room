# Music Room

A real-time collaborative music platform with voting and playlist editing features.

## Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Supabase) via Prisma ORM
- **Mobile**: React Native (Expo) + TypeScript
- **Real-time**: Socket.io

## Prerequisites

- Node.js 18+
- npm
- A Supabase project (for PostgreSQL)

## Setup

1. Clone the repository:
```bash
git clone <repo-url>
cd music-room
```

2. Copy the environment file and fill in your values:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Install dependencies:
```bash
make install
```

4. Run database migrations:
```bash
make db-migrate
```

5. Start the dev server:
```bash
make dev
```

The server runs on `http://localhost:3001` by default.

6. Build the Android package and start it with the emulator :
```bash
make dev-android
```


## Available Commands

| Command | Description |
|---------|-------------|
| `make install` | Install backend dependencies |
| `make dev` | Start dev server with hot reload |
| `make build` | Build TypeScript to JavaScript |
| `make test` | Run tests |
| `make db-migrate` | Run Prisma migrations |
| `make db-studio` | Open Prisma Studio |
| `make clean` | Remove node_modules and dist |

## Environment Variables


For backend:
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection pooler URL |
| `DIRECT_URL` | Supabase direct connection URL (for migrations) |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_ANDROID_CLIENT_ID` | Google OAuth Android client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `PORT` | Server port (default: 3001) |
| `CLIENT_URL` | Frontend/mobile client URL for CORS |

For frontend:
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL for the backend |
| `DIRECT_URL` | URL for the backend |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` |  Google OAuth client ID  |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth Android client ID |

## Health Check

```bash
curl http://localhost:3001/health
```
