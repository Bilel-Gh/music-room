# Load Testing — Music Room

## What is load testing?

Load testing simulates multiple users hitting the API simultaneously to find out how the backend performs under pressure. The goal is to answer: "How many simultaneous users can the backend handle before it starts failing or slowing down?"

## Tool used: Artillery

**Artillery** is a load testing tool that simulates virtual users sending HTTP requests to the API. It's configured via a YAML file that defines phases (warm-up, ramp-up, sustained load) and scenarios (what each virtual user does).

**Why Artillery**: It's simple to configure, supports phases for gradual load increase, integrates with Node.js, and produces clear metrics. Alternatives like k6 or JMeter exist, but Artillery is the simplest for our use case.

**File**: `backend/artillery.yml`

## Test configuration

```yaml
config:
  target: "http://localhost:3001"
  phases:
    - duration: 10        # Phase 1: Warm-up
      arrivalRate: 2      # 2 new users per second
      name: "Warm-up"

    - duration: 30        # Phase 2: Ramp-up
      arrivalRate: 2      # Start at 2 users/sec
      rampTo: 20          # Gradually increase to 20 users/sec
      name: "Ramp-up"

    - duration: 20        # Phase 3: Sustained load
      arrivalRate: 20     # 20 new users per second
      name: "Sustained load"
```

### Phases explained

| Phase | Duration | Users/second | Purpose |
|-------|----------|-------------|---------|
| **Warm-up** | 10 sec | 2/sec | Let the server warm up (JIT, connection pools) |
| **Ramp-up** | 30 sec | 2→20/sec | Gradually increase load to find the breaking point |
| **Sustained load** | 20 sec | 20/sec | Hold peak load to see if the server stays stable |

**Total virtual users**: ~20 (warm-up) + ~330 (ramp-up) + ~400 (sustained) ≈ **750 virtual users** over 60 seconds.

### Scenarios

Three scenarios with weighted distribution:

| Scenario | Weight | What it does |
|----------|--------|-------------|
| **Health check** | 4/10 (40%) | `GET /health` — simple baseline without authentication |
| **Browse events** | 3/10 (30%) | `GET /api/events` twice with a 1-second pause (authenticated) |
| **Browse playlists** | 3/10 (30%) | `GET /api/playlists` twice with a 1-second pause (authenticated) |

The authenticated scenarios use a JWT token passed via the `AUTH_TOKEN` environment variable.

## How to run the tests

```bash
# 1. Start the backend
make dev

# 2. Get a JWT token (login and copy the accessToken)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# 3. Run Artillery with the token
AUTH_TOKEN="eyJhbG..." make load-test
```

Or directly:
```bash
cd backend && AUTH_TOKEN="eyJhbG..." npx artillery run artillery.yml
```

## How to read the results

Artillery outputs metrics in three sections:

### 1. Summary metrics

```
All VUs finished. Total time: 60 seconds

Summary report:
  Scenarios launched:  750
  Scenarios completed: 748
  Requests completed:  1496
  RPS sent:            24.93
```

| Metric | Meaning |
|--------|---------|
| **Scenarios launched** | Total number of virtual users created |
| **Scenarios completed** | How many finished without errors |
| **Requests completed** | Total HTTP requests sent (some scenarios have 2 requests) |
| **RPS sent** | Requests Per Second — the throughput |

### 2. Response times

```
  http.response_time:
    min: 5
    max: 450
    median: 25
    p95: 120
    p99: 350
```

| Metric | Meaning | Good value |
|--------|---------|-----------|
| **min** | Fastest response | < 50ms |
| **max** | Slowest response | < 1000ms |
| **median** | 50% of requests were faster than this | < 100ms |
| **p95** | 95% of requests were faster than this | < 500ms |
| **p99** | 99% of requests were faster than this | < 1000ms |

### 3. Status codes

```
  http.codes.200: 1400
  http.codes.401: 50
  http.codes.429: 46
```

| Code | Meaning |
|------|---------|
| **200** | Successful responses |
| **401** | Token expired or invalid (expected if token expires during test) |
| **429** | Rate limited (expected — proves rate limiting works!) |

## Infrastructure context

### Server specifications

The tests run against a **local development machine** (not a production server):

| Component | Specification |
|-----------|--------------|
| **CPU** | Development machine (varies) |
| **RAM** | Development machine (varies) |
| **Node.js** | Single-threaded event loop |
| **Database** | Supabase free tier PostgreSQL |
| **Network** | Localhost (no network latency) |

### Supabase free tier limitations

| Resource | Limit |
|----------|-------|
| **Database size** | 500 MB |
| **Connections** | ~60 concurrent |
| **Bandwidth** | 5 GB/month |
| **Region** | Single region |

The main bottleneck is the **Supabase connection pool** (~60 connections). Under heavy load, database queries may queue up waiting for a free connection.

## What the results mean for the project

### Expected capacity

With the current setup (single Node.js instance + Supabase free tier):
- **Light load** (< 50 concurrent users): Response times under 100ms, no errors
- **Medium load** (50-100 concurrent users): Response times under 500ms, occasional 429s from rate limiting
- **Heavy load** (> 100 concurrent users): Database connection pool saturation, increased latency, some timeouts

### For the project context

This is a school project evaluated on architecture and code quality, not production scalability. The load testing demonstrates:

1. **The backend handles concurrent requests** without crashing
2. **Rate limiting works** (429 responses appear under heavy load)
3. **The architecture is sound** — Express handles requests asynchronously, Prisma manages connection pooling
4. **Bottleneck is identified**: the Supabase free tier database, not the application code

### How to improve capacity (for reference)

| Improvement | Impact |
|-------------|--------|
| Paid Supabase plan (more connections) | 2-5x more concurrent DB queries |
| Connection pooling (PgBouncer) | Better connection reuse |
| PM2 cluster mode (multiple Node.js instances) | Linear scaling with CPU cores |
| Redis cache for read-heavy endpoints | Reduce database load by 50%+ |
| Database indexing on frequently queried columns | Faster queries |

These are not implemented because they're outside the project scope, but they demonstrate understanding of scaling strategies.

## Key metrics summary

| Metric | What to look for |
|--------|-----------------|
| **RPS** (Requests Per Second) | Higher is better. Shows throughput capacity |
| **p95 latency** | 95th percentile response time. Should stay under 500ms |
| **Error rate** | Percentage of non-2xx responses. Should stay under 5% (excluding expected 429s) |
| **Scenarios completed / launched** | Should be close to 100%. If many fail, the server is overloaded |
