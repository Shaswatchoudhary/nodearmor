// src/errors/ApiError.ts
// ─────────────────────────────────────────────────────────────
// This file defines the BASE class that all nodearmor errors extend.
// Think of it as the foundation — every specific error (NotFound,
// Unauthorized, Conflict etc.) is built on top of this.
//
// WHY A CUSTOM ERROR CLASS AT ALL?
// JavaScript's built-in Error class only has a "message" field.
// An HTTP API needs more than that — it needs a status code (404, 401),
// a machine-readable code ("NOT_FOUND", "UNAUTHORIZED") so the frontend
// can handle errors programmatically, and optional context data (the meta
// field) like which field failed or which resource was missing.
//
// WHY NOT JUST USE AN OBJECT?
// Because "throw" only works cleanly with Error instances.
// Express's error handling middleware (the 4-argument function) only
// receives errors that were thrown or passed to next(err).
// A thrown plain object works but loses the stack trace and does not
// integrate with logging libraries like Pino or Winston correctly.
// ─────────────────────────────────────────────────────────────


// ── ApiError ──────────────────────────────────────────────────
// The base class for all nodearmor HTTP errors.
// It extends the built-in JavaScript Error class so it integrates
// correctly with try/catch, error handlers, and logging libraries.
export class ApiError extends Error {

  // This property is a "brand" — a marker that uniquely identifies
  // instances of ApiError even across different module boundaries.
  //
  // WHY NOT JUST USE instanceof?
  // instanceof can fail in certain situations:
  //   - When the error crosses a module boundary in some bundlers
  //   - When the package is loaded twice (version conflicts)
  //   - In some test environments with module isolation
  //
  // The "as const" makes this exactly the literal type "true",
  // not just "boolean". The isApiError() function checks for this property
  // as a fallback when instanceof fails.
  public readonly isApiError = true as const;

  constructor(
    // The HTTP status code to send in the response.
    // Examples: 400, 401, 403, 404, 409, 422, 429, 500, 503
    // "public readonly" means it is automatically stored as this.status
    // and cannot be changed after construction.
    public readonly status: number,

    // A machine-readable identifier for this type of error.
    // Always SCREAMING_SNAKE_CASE by convention.
    // Examples: "NOT_FOUND", "UNAUTHORIZED", "TOO_MANY_REQUESTS"
    // Frontend code uses this to decide how to handle each error type
    // without parsing the human-readable message string.
    public readonly code: string,

    // The human-readable error message.
    // This is passed to the parent Error class via super(message).
    // It becomes this.message — the standard Error property.
    message: string,

    // Optional structured context about what went wrong.
    // Record<string, unknown> means an object with string keys and any values.
    // Examples:
    //   new NotFound("User not found", { userId: "abc-123" })
    //   new Conflict("Email taken",    { field: "email" })
    //   new BadRequest("Invalid date", { field: "dob", received: "not-a-date" })
    // This data is included in the JSON response under the "meta" key.
    public readonly meta?: Record<string, unknown>
  ) {

    // super() calls the parent Error constructor with the message.
    // This sets this.message and this.stack (the stack trace).
    // "super" must be called before accessing "this" in a subclass.
    super(message);

    // Set the name to the actual class name for cleaner error logging.
    // Without this, all errors show as "Error" in logs.
    // With this, they show as "ApiError", "NotFound", etc.
    this.name = "ApiError";

    // CRITICAL: Restore the prototype chain.
    // This is a TypeScript/JavaScript quirk when extending built-in classes.
    //
    // The problem: when TypeScript compiles "extends Error" to ES5,
    // the prototype chain gets broken. "instanceof ApiError" returns false
    // even for valid ApiError instances, because the object's prototype
    // points to Error, not ApiError.
    //
    // The fix: Object.setPrototypeOf() manually repairs the chain.
    // new.target.prototype is the prototype of whatever class is actually
    // being constructed — works correctly for subclasses too.
    // (e.g. when "new NotFound()" runs, new.target is NotFound)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}


// ── isApiError() ──────────────────────────────────────────────
// A TypeScript type guard that checks if an unknown value is an ApiError.
//
// WHAT IS A TYPE GUARD?
// A function that returns "value is SomeType" is a type guard.
// When you call it inside an if(), TypeScript narrows the type:
//
//   if (isApiError(err)) {
//     err.status   // TypeScript knows .status exists here
//     err.code     // TypeScript knows .code exists here
//   }
//
// USE THIS IN YOUR ERROR HANDLER MIDDLEWARE:
//   app.use((err, req, res, next) => {
//     if (isApiError(err)) {
//       return res.status(err.status).json(toResponse(err));
//     }
//     // Unknown error — log it, send generic 500
//   });
//
// WHY TWO CHECKS?
// The first check (instanceof) is the fast, normal path.
// The second check (isApiError === true) is the fallback for edge cases
// where instanceof breaks (explained in the property comment above).
export function isApiError(err: unknown): err is ApiError {
  return (
    // Normal case: check if it is an instance of ApiError
    err instanceof ApiError ||
    (
      // Fallback: check if it is an object with our brand property
      typeof err === "object" &&
      err !== null &&           // null is typeof "object" — exclude it
      (err as ApiError).isApiError === true
    )
  );
}


// ── toResponse() ──────────────────────────────────────────────
// Converts an ApiError into a plain JSON-safe object for sending to clients.
//
// WHY NOT JUST USE JSON.stringify(err)?
// Error objects do not serialize well with JSON.stringify().
// The message, stack, and custom properties are often lost.
// This function explicitly picks the fields we want in the response.
//
// WHY NOT INCLUDE THE STACK TRACE?
// The stack trace contains file paths and line numbers from your server.
// Sending it to clients is a security risk — it reveals your internal
// code structure to potential attackers. We log it server-side only.
//
// The return type Record<string, unknown> means "an object" — we use
// this instead of a specific interface because the meta field is optional
// and we conditionally include it.
export function toResponse(err: ApiError): Record<string, unknown> {

  // Start with the three fields that are always present
  const response: Record<string, unknown> = {
    status: err.status,   // e.g. 404
    code: err.code,     // e.g. "NOT_FOUND"
    message: err.message,  // e.g. "User not found"
  };

  // Only include meta if it exists AND has at least one key.
  // We do not want to send { meta: {} } or { meta: undefined } to clients.
  // Object.keys().length > 0 checks that the object is not empty.
  if (err.meta && Object.keys(err.meta).length > 0) {
    response.meta = err.meta;
  }

  return response;
}


// ── createError() ─────────────────────────────────────────────
// Creates a one-off ApiError with any status code and code string.
// Use this when none of the pre-built classes fit your use case.
//
// Example:
//   throw createError(418, "IM_A_TEAPOT", "I refuse to brew coffee");
//   throw createError(451, "UNAVAILABLE_FOR_LEGAL_REASONS", "Blocked in your region");
export function createError(
  status: number,
  code: string,
  message: string,
  meta?: Record<string, unknown>
): ApiError {
  return new ApiError(status, code, message, meta);
}