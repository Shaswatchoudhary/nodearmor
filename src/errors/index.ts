// ─────────────────────────────────────────────────────────────
// This file has two jobs:
//   1. Re-export everything from ApiError.ts (the base + helpers)
//   2. Define all the pre-built HTTP error classes
//
// WHY PRE-BUILT CLASSES?
// Instead of writing:
//   throw new ApiError(404, "NOT_FOUND", "User not found")
// You write:
//   throw new NotFound("User not found")
//
// The status code and machine-readable code are baked into each class.
// This prevents mistakes like accidentally using status 403 when you
// meant 401, or typing "Not_Found" instead of "NOT_FOUND".
// ─────────────────────────────────────────────────────────────

// Re-export the base class and all helper functions.
// Consumers of nodearmor/errors get everything from this one import.
export {
  ApiError,
  isApiError,
  toResponse,
  createError
} from "./ApiError";

// Import ApiError for use in the class definitions below.
// This is a separate import because we need it as a value (to extend),
// not just as a type.
import { ApiError } from "./ApiError";


// ── Type alias ────────────────────────────────────────────────
// Shorthand for the optional meta parameter type.
// Every error class uses this — defining it once keeps the code DRY.
// "DRY" = Don't Repeat Yourself.
type Meta = Record<string, unknown> | undefined;


// ─────────────────────────────────────────────────────────────
// 4XX CLIENT ERRORS
// These mean the client (frontend / API consumer) did something wrong.
// They should be handled and shown to the user in a meaningful way.
// ─────────────────────────────────────────────────────────────


// ── 400 Bad Request ───────────────────────────────────────────
// The request was malformed or had invalid data.
// Use when the input fails validation that is NOT handled by guard()
// — for example, a date range where end is before start (both valid
// dates individually, but invalid as a combination).
//
// Example:
//   if (endDate < startDate) throw new BadRequest("End date must be after start date")
export class BadRequest extends ApiError {
  constructor(message: string, meta?: Meta) {
    // super() calls ApiError's constructor with the fixed status and code
    super(400, "BAD_REQUEST", message, meta);
    // Update the name for cleaner logging — shows "BadRequest" not "ApiError"
    this.name = "BadRequest";
  }
}


// ── 401 Unauthorized ──────────────────────────────────────────
// The request requires authentication but none was provided,
// OR the provided credentials (token, password) are invalid.
//
// NAMING NOTE: Despite being called "Unauthorized", HTTP 401 actually
// means "not authenticated" (you need to log in first).
// HTTP 403 (Forbidden) means "authenticated but not allowed".
// This naming confusion is a historical mistake in the HTTP spec.
//
// Examples:
//   if (!token)       throw new Unauthorized("Authentication required")
//   if (!tokenValid)  throw new Unauthorized("Token expired or invalid")
//   if (!passwordMatch) throw new Unauthorized("Invalid email or password")
export class Unauthorized extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(401, "UNAUTHORIZED", message, meta);
    this.name = "Unauthorized";
  }
}


// ── 402 Payment Required ──────────────────────────────────────
// The request requires payment or a paid subscription.
// Use for paywalled features in SaaS applications.
//
// Example:
//   if (user.plan === "free" && feature.requiresPro) {
//     throw new PaymentRequired("This feature requires a Pro plan")
//   }
export class PaymentRequired extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(402, "PAYMENT_REQUIRED", message, meta);
    this.name = "PaymentRequired";
  }
}


// ── 403 Forbidden ─────────────────────────────────────────────
// The user IS authenticated (logged in) but does NOT have permission
// to perform this action.
//
// The key difference from 401:
//   401 = "Who are you? Please log in."
//   403 = "I know who you are. You're not allowed to do this."
//
// Examples:
//   if (user.role !== "admin")    throw new Forbidden("Admin access required")
//   if (post.authorId !== userId) throw new Forbidden("You can only edit your own posts")
export class Forbidden extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(403, "FORBIDDEN", message, meta);
    this.name = "Forbidden";
  }
}


// ── 404 Not Found ─────────────────────────────────────────────
// The requested resource does not exist.
// This is the most commonly used error class.
//
// BEST PRACTICE: Include the resource ID in meta so the frontend
// can display it in the error message.
//
// Examples:
//   throw new NotFound("User not found", { userId: req.params.id })
//   throw new NotFound("Post not found", { postId: req.params.id })
//   throw new NotFound("Product not found")
export class NotFound extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(404, "NOT_FOUND", message, meta);
    this.name = "NotFound";
  }
}


// ── 405 Method Not Allowed ────────────────────────────────────
// The HTTP method used is not supported for this endpoint.
// Example: sending a POST request to an endpoint that only accepts GET.
// Express handles this automatically in most cases, but you may need
// it in custom routing logic.
export class MethodNotAllowed extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(405, "METHOD_NOT_ALLOWED", message, meta);
    this.name = "MethodNotAllowed";
  }
}


// ── 409 Conflict ──────────────────────────────────────────────
// The request conflicts with the current state of the server.
// Most commonly used when a unique constraint would be violated.
//
// Including "field" in meta is extremely useful — the frontend
// can use it to highlight exactly which input field caused the conflict.
//
// Examples:
//   throw new Conflict("Email already registered",  { field: "email" })
//   throw new Conflict("Username already taken",    { field: "username" })
//   throw new Conflict("Order already processed",   { orderId: order.id })
export class Conflict extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(409, "CONFLICT", message, meta);
    this.name = "Conflict";
  }
}


// ── 410 Gone ──────────────────────────────────────────────────
// The resource existed in the past but has been permanently deleted.
// Unlike 404 (which is ambiguous — maybe it never existed),
// 410 specifically tells the client "this used to exist, but no longer does."
// Useful for soft-deleted resources or deprecated API endpoints.
//
// Example:
//   if (user.deletedAt) throw new Gone("This account has been permanently deleted")
export class Gone extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(410, "GONE", message, meta);
    this.name = "Gone";
  }
}


// ── 422 Unprocessable Entity ──────────────────────────────────
// The request body is syntactically correct (valid JSON) but
// semantically invalid — it fails business logic validation.
//
// The difference from 400:
//   400 Bad Request = the request format itself is wrong
//   422 Unprocessable = the format is fine, but the content breaks rules
//
// Example:
//   // Both dates are valid individually, but the range is impossible
//   if (req.body.endDate < req.body.startDate) {
//     throw new UnprocessableEntity("End date must be after start date", {
//       startDate: req.body.startDate,
//       endDate: req.body.endDate,
//     })
//   }
export class UnprocessableEntity extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(422, "UNPROCESSABLE_ENTITY", message, meta);
    this.name = "UnprocessableEntity";
  }
}


// ── 429 Too Many Requests ─────────────────────────────────────
// The user has sent too many requests in a given time window.
// Used with rate limiting middleware.
//
// Including retryAfter in meta is excellent practice — the frontend
// can show "Please wait X seconds before trying again."
//
// Example:
//   throw new TooManyRequests("Rate limit exceeded. Try again in 60 seconds.", {
//     retryAfter: 60,
//     limit: 100,
//     windowMs: 60000,
//   })
export class TooManyRequests extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(429, "TOO_MANY_REQUESTS", message, meta);
    this.name = "TooManyRequests";
  }
}


// ─────────────────────────────────────────────────────────────
// 5XX SERVER ERRORS
// These mean something went wrong on the SERVER side.
// The client did nothing wrong.
// Never include internal details (stack traces, DB errors) in
// 5xx responses — log them server-side only.
// ─────────────────────────────────────────────────────────────


// ── 500 Internal Server Error ─────────────────────────────────
// An unexpected error occurred on the server.
// This should rarely be thrown explicitly — it is usually the fallback
// in your error handler when isApiError(err) returns false.
//
// If you ARE throwing it explicitly, something unexpected happened
// that you caught but cannot recover from.
//
// Example:
//   try {
//     await externalPaymentService.charge(amount)
//   } catch (err) {
//     logger.error(err) // log the real error
//     throw new InternalServerError("Payment processing failed") // safe message to client
//   }
export class InternalServerError extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(500, "INTERNAL_SERVER_ERROR", message, meta);
    this.name = "InternalServerError";
  }
}


// ── 503 Service Unavailable ───────────────────────────────────
// The server is temporarily unable to handle the request.
// Use when a critical dependency (database, cache, external API) is down.
//
// Including retryAfter tells clients how long to wait before retrying.
//
// Example:
//   catch (dbError) {
//     logger.error("Database connection failed", dbError)
//     throw new ServiceUnavailable("Database temporarily unavailable", {
//       retryAfter: 30
//     })
//   }
export class ServiceUnavailable extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(503, "SERVICE_UNAVAILABLE", message, meta);
    this.name = "ServiceUnavailable";
  }
}


// ── 502 Bad Gateway ───────────────────────────────────────────
// The server, while acting as a gateway or proxy, received an
// invalid response from the upstream server.
export class BadGateway extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(502, "BAD_GATEWAY", message, meta);
    this.name = "BadGateway";
  }
}


// ── 504 Gateway Timeout ───────────────────────────────────────
// The server, while acting as a gateway or proxy, did not receive
// a timely response from the upstream server.
export class GatewayTimeout extends ApiError {
  constructor(message: string, meta?: Meta) {
    super(504, "GATEWAY_TIMEOUT", message, meta);
    this.name = "GatewayTimeout";
  }
}