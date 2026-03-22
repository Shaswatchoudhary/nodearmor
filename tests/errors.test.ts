// tests/errors.test.ts
// ─────────────────────────────────────────────────────────────
// Tests for ApiError, all error classes, isApiError(), and toResponse().
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  ApiError,
  isApiError,
  toResponse,
  createError,
  BadRequest,
  Unauthorized,
  PaymentRequired,
  Forbidden,
  NotFound,
  MethodNotAllowed,
  Conflict,
  Gone,
  UnprocessableEntity,
  TooManyRequests,
  InternalServerError,
  ServiceUnavailable,
} from "../src/errors";


// ═══════════════════════════════════════════════════════════════
describe("ApiError base class", () => {

  it("stores status, code, and message correctly", () => {
    const err = new ApiError(404, "NOT_FOUND", "User not found");

    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("User not found");
  });

  it("stores optional meta when provided", () => {
    const err = new ApiError(404, "NOT_FOUND", "User not found", { userId: "abc" });

    expect(err.meta).toEqual({ userId: "abc" });
  });

  it("meta is undefined when not provided", () => {
    const err = new ApiError(404, "NOT_FOUND", "User not found");

    expect(err.meta).toBeUndefined();
  });

  it("is an instance of the built-in Error class", () => {
    // This matters because catch blocks catch Error instances.
    // If this fails, try/catch and error handlers will not work correctly.
    const err = new ApiError(500, "INTERNAL", "Something went wrong");

    expect(err instanceof Error).toBe(true);
  });

  it("has a stack trace (inherits from Error)", () => {
    const err = new ApiError(500, "INTERNAL", "Something went wrong");

    // stack is set by the Error parent class constructor
    expect(typeof err.stack).toBe("string");
    expect(err.stack!.length).toBeGreaterThan(0);
  });

  it("has the isApiError brand property set to true", () => {
    const err = new ApiError(400, "BAD_REQUEST", "Bad input");

    // This is what isApiError() uses as a fallback check
    expect(err.isApiError).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
describe("Pre-built error classes", () => {

  // We test all 11 classes with a data-driven approach.
  // Instead of writing 11 identical describe blocks, we define
  // the expected values in an array and loop over them.
  // This is cleaner and easier to maintain.
  const cases = [
    { Class: BadRequest, status: 400, code: "BAD_REQUEST" },
    { Class: Unauthorized, status: 401, code: "UNAUTHORIZED" },
    { Class: PaymentRequired, status: 402, code: "PAYMENT_REQUIRED" },
    { Class: Forbidden, status: 403, code: "FORBIDDEN" },
    { Class: NotFound, status: 404, code: "NOT_FOUND" },
    { Class: MethodNotAllowed, status: 405, code: "METHOD_NOT_ALLOWED" },
    { Class: Conflict, status: 409, code: "CONFLICT" },
    { Class: Gone, status: 410, code: "GONE" },
    { Class: UnprocessableEntity, status: 422, code: "UNPROCESSABLE_ENTITY" },
    { Class: TooManyRequests, status: 429, code: "TOO_MANY_REQUESTS" },
    { Class: InternalServerError, status: 500, code: "INTERNAL_SERVER_ERROR" },
    { Class: ServiceUnavailable, status: 503, code: "SERVICE_UNAVAILABLE" },
  ];

  // Loop over every class and run the same three checks for each
  for (const { Class, status, code } of cases) {

    it(`${Class.name} has correct status ${status} and code "${code}"`, () => {
      const err = new Class("Test message");

      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
      expect(err.message).toBe("Test message");
    });

    it(`${Class.name} is an instance of ApiError`, () => {
      const err = new Class("Test message");

      // instanceof works because of Object.setPrototypeOf() in ApiError
      expect(err instanceof ApiError).toBe(true);
    });

    it(`${Class.name} accepts optional meta`, () => {
      const err = new Class("Test message", { detail: "extra info" });

      expect(err.meta).toEqual({ detail: "extra info" });
    });
  }
});


// ═══════════════════════════════════════════════════════════════
describe("isApiError()", () => {

  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError(500, "ERR", "msg"))).toBe(true);
  });

  it("returns true for subclass instances (NotFound, Conflict etc.)", () => {
    expect(isApiError(new NotFound("Not found"))).toBe(true);
    expect(isApiError(new Conflict("Conflict"))).toBe(true);
    expect(isApiError(new Unauthorized("Unauthorized"))).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isApiError(new Error("plain error"))).toBe(false);
  });

  it("returns false for a plain string", () => {
    expect(isApiError("some error string")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isApiError(404)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isApiError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isApiError(undefined)).toBe(false);
  });

  it("returns false for a plain object without the brand property", () => {
    expect(isApiError({ status: 404, code: "NOT_FOUND" })).toBe(false);
  });

  it("works correctly in a try/catch block", () => {
    // This simulates how it is used in a real error handler
    let caught: unknown;

    try {
      throw new NotFound("User not found", { id: "123" });
    } catch (err) {
      caught = err;
    }

    // isApiError() should narrow the type so we can access .status
    if (isApiError(caught)) {
      expect(caught.status).toBe(404);
      expect(caught.code).toBe("NOT_FOUND");
      expect(caught.meta).toEqual({ id: "123" });
    } else {
      // This branch should never run — fail the test if it does
      throw new Error("Expected caught to be an ApiError");
    }
  });
});


// ═══════════════════════════════════════════════════════════════
describe("toResponse()", () => {

  it("serializes status, code, and message", () => {
    const err = new NotFound("User not found");
    const response = toResponse(err);

    expect(response.status).toBe(404);
    expect(response.code).toBe("NOT_FOUND");
    expect(response.message).toBe("User not found");
  });

  it("includes meta when it has content", () => {
    const err = new Conflict("Email taken", { field: "email" });
    const response = toResponse(err);

    expect(response.meta).toEqual({ field: "email" });
  });

  it("omits meta when it is undefined", () => {
    const err = new NotFound("Not found");
    const response = toResponse(err);

    // The meta key should not exist at all — not even as undefined
    expect("meta" in response).toBe(false);
  });

  it("omits meta when it is an empty object", () => {
    // createError with an empty meta object
    const err = new ApiError(400, "ERR", "msg", {});
    const response = toResponse(err);

    // Empty meta should be treated the same as no meta
    expect("meta" in response).toBe(false);
  });

  it("does not include stack trace in the response", () => {
    const err = new InternalServerError("Server crashed");
    const response = toResponse(err);

    // Stack trace should NEVER be sent to clients — security risk
    expect("stack" in response).toBe(false);
  });

  it("returns a plain JSON-serializable object", () => {
    const err = new TooManyRequests("Slow down", { retryAfter: 60 });
    const response = toResponse(err);

    // JSON.stringify should not throw — the object is fully serializable
    expect(() => JSON.stringify(response)).not.toThrow();

    // Parse it back and check the values survived the round-trip
    const parsed = JSON.parse(JSON.stringify(response));
    expect(parsed.status).toBe(429);
    expect(parsed.code).toBe("TOO_MANY_REQUESTS");
    expect(parsed.meta.retryAfter).toBe(60);
  });
});


// ═══════════════════════════════════════════════════════════════
describe("createError()", () => {

  it("creates an ApiError with the given status and code", () => {
    const err = createError(418, "IM_A_TEAPOT", "I refuse to brew coffee");

    expect(err.status).toBe(418);
    expect(err.code).toBe("IM_A_TEAPOT");
    expect(err.message).toBe("I refuse to brew coffee");
  });

  it("createError result passes isApiError check", () => {
    const err = createError(418, "IM_A_TEAPOT", "Teapot error");

    expect(isApiError(err)).toBe(true);
  });

  it("accepts optional meta", () => {
    const err = createError(451, "UNAVAILABLE_FOR_LEGAL_REASONS", "Blocked", {
      country: "XX",
      reason: "court order",
    });

    expect(err.meta).toEqual({ country: "XX", reason: "court order" });
  });
});