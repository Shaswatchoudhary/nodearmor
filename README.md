

<div align="center">

# nodearmor

**Complete backend safety for Node.js — from the first line your app runs to the last response it sends.**

[![npm version](https://img.shields.io/npm/v/nodearmor.svg?style=flat-square)](https://www.npmjs.com/package/nodearmor)
[![npm downloads](https://img.shields.io/npm/dm/nodearmor.svg?style=flat-square)](https://www.npmjs.com/package/nodearmor)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-black.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-black.svg?style=flat-square)](https://nodejs.org)

</div>

---

## The Problem

Every Node.js backend project ends up installing the same three packages, reading three different docs, and wiring them together differently every single time:
```bash
npm install bcrypt
npm install joi
# ...copy-paste AppError class from some tutorial
```

Then the code looks like this in every route, in every project:
```typescript
// ❌ What everyone writes today

import bcrypt from "bcrypt";

app.post("/register", async (req, res) => {
  if (!req.body.email || !req.body.email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!req.body.password || req.body.password.length < 8) {
    return res.status(400).json({ error: "Password too short" });
  }

  const exists = await db.users.findOne({ email: req.body.email });
  if (exists) return res.status(409).json({ error: "Email taken" });

  const hash = await bcrypt.hash(req.body.password, 12);
  await db.users.create({ email: req.body.email, password: hash });
  res.status(201).json({ message: "Created" });
});
```

No TypeScript types on `req.body`. Inconsistent error shapes. bcrypt is a 1999 algorithm. Validation copy-pasted in every route. AppError written from scratch in every project.

**nodearmor fixes all of this with one install.**

---

## The Solution
```bash
npm install nodearmor zod
```
```typescript
// ✅ With nodearmor

import { envault }  from "nodearmor/env";
import { hash }     from "nodearmor/hash";
import { guard }    from "nodearmor/guard";
import { Conflict } from "nodearmor/errors";
import { z }        from "zod";

export const env = envault({
  DATABASE_URL: { type: "string" },
  PORT:         { type: "number", default: 3000 },
  NODE_ENV:     { type: "string", enum: ["development", "production", "test"] },
});

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

app.post("/register",
  guard(RegisterSchema),
  async (req, res) => {
    const { email, password } = req.body; // fully typed

    const exists = await db.users.findOne({ email });
    if (exists) throw new Conflict("Email already registered", { field: "email" });

    const passwordHash = await hash(password);
    await db.users.create({ email, password: passwordHash });
    res.status(201).json({ message: "Created" });
  }
);

app.listen(env.PORT);
```

---

## What Is Inside

One package. Four independent modules. Install once, import only what you need.

| Module | Import | What It Does | Replaces |
|--------|--------|--------------|---------|
| **env** | `nodearmor/env` | Type-safe env validation at startup | dotenv + manual checks |
| **hash** | `nodearmor/hash` | Argon2id password hashing | bcrypt |
| **guard** | `nodearmor/guard` | Zod-powered request validation | joi / express-validator |
| **errors** | `nodearmor/errors` | Typed HTTP error classes | copy-pasted AppError |

---

## Installation
```bash
npm install nodearmor zod
```

> `zod` is a peer dependency required for `nodearmor/guard`. All other dependencies are bundled automatically.

---

## Module 1 — env

Validates your environment variables the moment your app starts. If anything is wrong, the process exits immediately with a clear message before any server starts or database connects.
```typescript
import { envault } from "nodearmor/env";

export const env = envault({
  DATABASE_URL: { type: "string",  message: "Set DATABASE_URL to your PostgreSQL connection string" },
  PORT:         { type: "number",  default: 3000, min: 1000, max: 65535 },
  DEBUG:        { type: "boolean", default: false },
  NODE_ENV:     { type: "string",  enum: ["development", "production", "test"] },
  API_BASE_URL: { type: "url" },
  ADMIN_EMAIL:  { type: "email" },
  STRIPE_KEY:   { type: "string",  required: false },
});

// All values are correctly typed — no casting needed anywhere
env.PORT          // number
env.DEBUG         // boolean
env.NODE_ENV      // string
env.STRIPE_KEY    // string | undefined
```

If validation fails, the app exits immediately with this output:
```
nodearmor/env — validation failed:

  ✗  Missing required variable: "DATABASE_URL"
  ✗  "PORT" must be >= 1000, got: 80
  ✗  "NODE_ENV" must be one of [development, production, test], got: "staging"
```

### envault Options
```typescript
envault(schema, {
  dotenv: true,             // Load .env from project root (default: true)
  dotenv: "./config/.env",  // Load from a custom path
  exitOnError: true,        // process.exit(1) on failure (default: true)
  exitOnError: false,       // Throw an Error instead — useful in tests
})
```

### Supported Field Types

| Type | Raw Input | Output Type | Extra Options |
|------|-----------|-------------|---------------|
| `string` | Any text | `string` | `enum`, `required`, `default`, `message` |
| `number` | `"3000"` | `number` | `min`, `max`, `default`, `message` |
| `boolean` | `"true"` or `"1"` | `boolean` | `default`, `message` |
| `url` | `"https://api.example.com"` | `string` | `required`, `message` |
| `email` | `"user@example.com"` | `string` | `required`, `message` |

---

## Module 2 — hash

Argon2id password hashing with OWASP 2025 recommended defaults baked in. Identical API to bcrypt — just more secure.
```typescript
import { hash, verify, needsRehash } from "nodearmor/hash";

// Hash a password — use in your register route
const stored = await hash(plainPassword);
// Returns: "$argon2id$v=19$m=65536,t=3,p=1$..."

// Verify a password — use in your login route
const isValid = await verify(stored, plainPassword);
// Returns: true or false

// Check if a hash needs upgrading — use after successful login
if (await needsRehash(stored)) {
  const newHash = await hash(plainPassword);
  await db.users.updateHash(userId, newHash);
}
```

### Why Argon2id Over bcrypt

| | bcrypt | nodearmor/hash |
|---|--------|----------------|
| Year designed | 1999 | 2015 (PHC winner) |
| Memory-hard | ❌ CPU-only | ✅ 64 MB RAM per attempt |
| GPU resistance | ❌ Fully parallelizable | ✅ RAM is the bottleneck |
| OWASP 2025 recommendation | ⚠️ Acceptable | ✅ Recommended |
| API complexity | Simple | Identical |

Memory-hard means a GPU with 16 GB RAM can only run 250 parallel attacks instead of thousands. The cost of an attack scales with RAM, not just CPU.

### Migrating From bcrypt

No forced password resets. Users migrate transparently on their next successful login.
```typescript
import bcrypt from "bcrypt";
import { hash, verify } from "nodearmor/hash";

async function login(email: string, password: string) {
  const user = await db.users.findByEmail(email);

  let isValid = false;

  if (user.passwordHash.startsWith("$2b$")) {
    // Old bcrypt hash — verify with bcrypt
    isValid = await bcrypt.compare(password, user.passwordHash);
    if (isValid) {
      // Silently upgrade to Argon2id on next login
      await db.users.updateHash(user.id, await hash(password));
    }
  } else {
    // New Argon2id hash
    isValid = await verify(user.passwordHash, password);
  }

  if (!isValid) throw new Unauthorized("Invalid credentials");
  return issueToken(user);
}
```

### Custom Options
```typescript
const stored = await hash(password, {
  memoryCost: 131072, // 128 MB — for high-security environments
  timeCost:   4,
  parallelism: 2,
});
```

---

## Module 3 — guard

Zod-powered request validation middleware. One line replaces 15–20 lines of manual validation boilerplate in every route. Works with Express, Fastify, and any framework that follows the standard middleware signature.
```typescript
import { guard, guardAll, createGuard } from "nodearmor/guard";
import { z } from "zod";
```

### Validate Request Body
```typescript
const CreateUserSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(["user", "admin"]).default("user"),
});

app.post("/users", guard(CreateUserSchema), async (req, res) => {
  // req.body is fully typed — TypeScript knows every field and its type
  const { name, email, password, role } = req.body;
  // ... create user
});
```

### Validate Query Parameters
```typescript
const PaginationSchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort:  z.enum(["asc", "desc"]).default("asc"),
});

// GET /users?page=2&limit=50
app.get("/users", guard(PaginationSchema, "query"), async (req, res) => {
  const { page, limit, sort } = req.query; // page and limit are real numbers
});
```

### Validate URL Parameters
```typescript
const IdSchema = z.object({
  id: z.string().uuid("User ID must be a valid UUID"),
});

// GET /users/550e8400-e29b-41d4-a716-446655440000
app.get("/users/:id", guard(IdSchema, "params"), async (req, res) => {
  const { id } = req.params; // guaranteed to be a valid UUID string
});
```

### Validate Multiple Targets at Once
```typescript
app.get("/search",
  guardAll({ query: SearchSchema, body: FilterSchema }),
  handler
);
```

### Custom Error Format
```typescript
// Create a guard with your own error shape — use once, apply everywhere
const myGuard = createGuard({
  status: 422,
  formatError: (issues) => ({
    success: false,
    errors:  issues.map(i => ({ path: i.field, msg: i.message })),
  }),
});

app.post("/users", myGuard(CreateUserSchema), handler);
```

### Default Validation Error Response

When validation fails, guard automatically sends this response — no code needed in your route:
```json
{
  "status": 400,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "issues": [
    { "field": "email",    "message": "Invalid email",                              "code": "invalid_string" },
    { "field": "password", "message": "String must contain at least 8 character(s)", "code": "too_small" }
  ]
}
```

---

## Module 4 — errors

Typed HTTP error classes that produce a consistent response shape across every route. Write your error handler once and it handles everything.
```typescript
import {
  BadRequest, Unauthorized, PaymentRequired, Forbidden,
  NotFound, MethodNotAllowed, Conflict, Gone,
  UnprocessableEntity, TooManyRequests,
  InternalServerError, ServiceUnavailable,
  isApiError, toResponse, createError,
} from "nodearmor/errors";
```

### Throwing Errors in Routes
```typescript
// 404 — resource not found
throw new NotFound("User not found", { userId: req.params.id });

// 409 — duplicate resource
throw new Conflict("Email already registered", { field: "email" });

// 401 — not authenticated
throw new Unauthorized("Token expired or invalid");

// 403 — authenticated but not allowed
throw new Forbidden("Admin access required");

// 429 — rate limit
throw new TooManyRequests("Too many requests", { retryAfter: 60 });

// Custom status code not in the list
throw createError(451, "UNAVAILABLE_FOR_LEGAL_REASONS", "Blocked in your region");
```

### The Universal Error Handler

Write this once in your app. It handles every error from every route automatically.
```typescript
import { isApiError, toResponse } from "nodearmor/errors";

app.use((err, req, res, next) => {
  if (isApiError(err)) {
    // Known API error — safe to send to client
    return res.status(err.status).json(toResponse(err));
  }

  // Unknown error — log full details server-side, hide from client
  console.error("[UNHANDLED ERROR]", err);
  res.status(500).json({
    status:  500,
    code:    "INTERNAL_SERVER_ERROR",
    message: "Something went wrong. Please try again.",
  });
});
```

### Error Response Shape

Every nodearmor error serializes to this consistent shape:
```json
{
  "status":  409,
  "code":    "CONFLICT",
  "message": "Email already registered",
  "meta":    { "field": "email" }
}
```

`meta` is only included when provided. The `stack` trace is never sent to clients.

### All Error Classes

| Class | Status | Code |
|-------|--------|------|
| `BadRequest` | 400 | `BAD_REQUEST` |
| `Unauthorized` | 401 | `UNAUTHORIZED` |
| `PaymentRequired` | 402 | `PAYMENT_REQUIRED` |
| `Forbidden` | 403 | `FORBIDDEN` |
| `NotFound` | 404 | `NOT_FOUND` |
| `MethodNotAllowed` | 405 | `METHOD_NOT_ALLOWED` |
| `Conflict` | 409 | `CONFLICT` |
| `Gone` | 410 | `GONE` |
| `UnprocessableEntity` | 422 | `UNPROCESSABLE_ENTITY` |
| `TooManyRequests` | 429 | `TOO_MANY_REQUESTS` |
| `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` |
| `ServiceUnavailable` | 503 | `SERVICE_UNAVAILABLE` |

---

## Complete Example — A Full Auth Route
```typescript
// src/env.ts
import { envault } from "nodearmor/env";

export const env = envault({
  DATABASE_URL: { type: "string" },
  PORT:         { type: "number", default: 3000 },
  JWT_SECRET:   { type: "string" },
  NODE_ENV:     { type: "string", enum: ["development", "production", "test"] },
});


// src/middleware/errorHandler.ts
import { isApiError, toResponse } from "nodearmor/errors";
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (isApiError(err)) {
    return res.status(err.status).json(toResponse(err));
  }
  console.error("[UNHANDLED]", err);
  res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "Server error" });
}


// src/routes/auth.ts
import { Router }                          from "express";
import { z }                               from "zod";
import { hash, verify }                    from "nodearmor/hash";
import { guard }                           from "nodearmor/guard";
import { Conflict, Unauthorized, NotFound } from "nodearmor/errors";

const router = Router();

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

router.post("/register", guard(RegisterSchema), async (req, res) => {
  const { email, password, name } = req.body;

  const existing = await db.users.findByEmail(email);
  if (existing) throw new Conflict("Email already registered", { field: "email" });

  const passwordHash = await hash(password);
  const user = await db.users.create({ email, name, password: passwordHash });

  res.status(201).json({ id: user.id, email: user.email });
});

router.post("/login", guard(LoginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await db.users.findByEmail(email);
  if (!user) throw new Unauthorized("Invalid email or password");

  const isValid = await verify(user.passwordHash, password);
  if (!isValid) throw new Unauthorized("Invalid email or password");

  res.json({ token: issueToken(user) });
});

export default router;


// src/app.ts
import express       from "express";
import { env }       from "./env";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes    from "./routes/auth";

const app = express();
app.use(express.json());
app.use("/auth", authRoutes);
app.use(errorHandler); // must be last

app.listen(env.PORT, () => {
  console.log(`[${env.NODE_ENV}] Server running on port ${env.PORT}`);
});
```

---

## Why Not Three Separate Packages?

| | 3 Separate Packages | nodearmor |
|---|--------------------|-----------| 
| Install command | `npm install bcrypt joi` + copy-paste | `npm install nodearmor zod` |
| Versions to track | 3 changelogs | 1 changelog |
| Docs to read | 3 different docs | 1 doc |
| TypeScript support | Mixed — some need `@types/*` | Native throughout |
| Error shapes | Inconsistent per project | Always `status + code + message + meta` |
| Password algorithm | bcrypt (1999) | Argon2id (OWASP 2025) |

---

## Requirements

- Node.js 18 or higher
- TypeScript 5+ (optional but recommended)
- zod 3+ (peer dependency — required for `nodearmor/guard`)

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes with tests
4. Run `npm test` — all tests must pass
5. Open a pull request against `develop`

---

## License

MIT — see [LICENSE](LICENSE) for full text.

---

<div align="center">

**nodearmor** — built for developers who are tired of wiring the same three packages together on every project.

</div>