// tests/guard.test.ts
// ─────────────────────────────────────────────────────────────
// Tests for guard(), guardAll(), and createGuard().
//
// TESTING MIDDLEWARE IS DIFFERENT:
// Middleware functions are not called directly — Express calls them.
// So in tests we create fake "mock" versions of req, res, and next
// and pass them in manually. This lets us test the middleware without
// needing a running Express server.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
// vi is Vitest's utility for creating mock (fake) functions
// vi.fn() creates a function that records how it was called

import { z } from "zod";
import { guard, guardAll, createGuard } from "../src/guard/";


// ── Mock helpers ──────────────────────────────────────────────
// These functions create fake Express objects we can inspect in tests.

// Creates a fake Request object with whatever body/query/params we give it.
// In a real Express app, Express builds this from the HTTP request.
// Here we build it ourselves for testing.
function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},      // default empty body
    query: {},      // default empty query
    params: {},      // default empty params
    headers: {},      // default empty headers
    ...overrides,     // override any of the above for specific tests
  } as unknown as import("express").Request;
}

// Creates a fake Response object.
// The real res object has many methods — we only need status() and json().
//
// vi.fn() creates a mock function that:
//   1. Records every time it was called
//   2. Records what arguments it was called with
//   3. We can check these recordings with .toHaveBeenCalledWith()
//
// status() returns "this" (the res object itself) so we can chain:
//   res.status(400).json({...})
//   ^^^^^^^^^^^^^ returns res, then .json() is called on res
function mockRes() {
  const res = {
    // statusCode tracks what status was set
    statusCode: 200,

    // status() sets the status code and returns res for chaining
    status: vi.fn().mockImplementation(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this; // return res so .json() can be chained after .status()
    }),

    // json() records what body was sent
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

// Creates a fake next() function.
// In Express, calling next() passes control to the next middleware.
// In tests, we check whether next() was called (validation passed)
// or NOT called (validation failed).
function mockNext() {
  return vi.fn();
}


// ── Shared schemas ────────────────────────────────────────────
// Reuse these across multiple tests — defined once here.

// A typical user registration schema
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

// A typical pagination schema with coercion
// z.coerce.number() converts "2" (string) to 2 (number) automatically
const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// A UUID validation schema for URL params
const IdSchema = z.object({
  id: z.string().uuid("ID must be a valid UUID"),
});


// ═══════════════════════════════════════════════════════════════
describe("guard()", () => {

  // ── Happy path — validation passes ──────────────────────────
  describe("when validation passes", () => {

    it("calls next() to pass control to the route handler", () => {
      const req = mockReq({ body: { email: "user@example.com", password: "password123", name: "Alice" } });
      const res = mockRes();
      const next = mockNext();

      // Call the middleware returned by guard()
      guard(RegisterSchema)(req, res as any, next);

      // next() should have been called exactly once — validation passed
      expect(next).toHaveBeenCalledOnce();

      // res.json() should NOT have been called — no error response sent
      expect(res.json).not.toHaveBeenCalled();
    });

    it("replaces req.body with the parsed (typed) data", () => {
      const req = mockReq({ body: { email: "user@example.com", password: "password123", name: "Alice" } });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema)(req, res as any, next);

      // After guard() runs, req.body should be the Zod-parsed object
      // (same values here, but TypeScript now knows the exact types)
      expect(req.body).toEqual({
        email: "user@example.com",
        password: "password123",
        name: "Alice",
      });
    });

    it("coerces string query params to numbers", () => {
      // All URL query params arrive as strings — "page=2" → req.query.page = "2"
      // Zod's z.coerce.number() converts them to real numbers
      const req = mockReq({ query: { page: "3", limit: "50" } });
      const res = mockRes();
      const next = mockNext();

      guard(PaginationSchema, "query")(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
      // After guard, these are real numbers, not strings
      expect((req.query as any).page).toBe(3);
      expect((req.query as any).limit).toBe(50);
    });

    it("applies Zod default values when fields are missing", () => {
      // PaginationSchema has default(1) for page and default(20) for limit
      // If the client sends an empty query string, defaults are applied
      const req = mockReq({ query: {} });
      const res = mockRes();
      const next = mockNext();

      guard(PaginationSchema, "query")(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
      // Defaults were applied
      expect((req.query as any).page).toBe(1);
      expect((req.query as any).limit).toBe(20);
    });

    it("validates URL params", () => {
      const req = mockReq({ params: { id: "550e8400-e29b-41d4-a716-446655440000" } });
      const res = mockRes();
      const next = mockNext();

      guard(IdSchema, "params")(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });


  // ── Validation fails ─────────────────────────────────────────
  describe("when validation fails", () => {

    it("sends a 400 response and does NOT call next()", () => {
      // Missing all required fields
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema)(req, res as any, next);

      // next() should NOT have been called — route handler blocked
      expect(next).not.toHaveBeenCalled();

      // res.status() should have been called with 400
      expect(res.status).toHaveBeenCalledWith(400);

      // res.json() should have been called with some body
      expect(res.json).toHaveBeenCalled();
    });

    it("response body contains status, code, message, and issues", () => {
      const req = mockReq({ body: { email: "not-an-email", password: "short" } });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema)(req, res as any, next);

      // Get what was passed to res.json()
      const responseBody = (res.json as any).mock.calls[0][0];

      // Check the structure of the error response
      expect(responseBody.status).toBe(400);
      expect(responseBody.code).toBe("VALIDATION_FAILED");
      expect(responseBody.message).toBe("Request validation failed");
      expect(Array.isArray(responseBody.issues)).toBe(true);
    });

    it("includes the field name and message in each issue", () => {
      const req = mockReq({ body: { email: "not-an-email", password: "short", name: "Alice" } });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema)(req, res as any, next);

      const { issues } = (res.json as any).mock.calls[0][0];

      // Find the email issue
      const emailIssue = issues.find((i: any) => i.field === "email");
      expect(emailIssue).toBeDefined();
      expect(emailIssue.message).toBe("Invalid email");

      // Find the password issue
      const passwordIssue = issues.find((i: any) => i.field === "password");
      expect(passwordIssue).toBeDefined();
    });

    it("reports ALL failing fields, not just the first one", () => {
      // All three fields are invalid
      const req = mockReq({ body: { email: "bad", password: "123", name: "" } });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema)(req, res as any, next);

      const { issues } = (res.json as any).mock.calls[0][0];

      // Should have at least 3 issues — one per failing field
      expect(issues.length).toBeGreaterThanOrEqual(3);
    });

    it("sends 422 when custom status is provided", () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();

      // Use status: 422 instead of default 400
      guard(RegisterSchema, "body", { status: 422 })(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(422);
    });

    it("uses custom formatError when provided", () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();

      guard(RegisterSchema, "body", {
        // Custom formatter returns a completely different shape
        formatError: (issues) => ({ errors: issues, count: issues.length }),
      })(req, res as any, next);

      const responseBody = (res.json as any).mock.calls[0][0];

      // Should have our custom shape, not the default
      expect(responseBody.errors).toBeDefined();
      expect(responseBody.count).toBeGreaterThan(0);
      // Should NOT have the default shape
      expect(responseBody.status).toBeUndefined();
    });

    it("rejects an invalid UUID in params", () => {
      const req = mockReq({ params: { id: "not-a-uuid" } });
      const res = mockRes();
      const next = mockNext();

      guard(IdSchema, "params")(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);

      const { issues } = (res.json as any).mock.calls[0][0];
      const idIssue = issues.find((i: any) => i.field === "id");
      expect(idIssue.message).toBe("ID must be a valid UUID");
    });
  });
});


// ═══════════════════════════════════════════════════════════════
describe("guardAll()", () => {

  it("validates multiple targets and calls next() when all pass", () => {
    const req = mockReq({
      body: { email: "user@example.com", password: "password123", name: "Alice" },
      query: { page: "1", limit: "10" },
    });
    const res = mockRes();
    const next = mockNext();

    guardAll({ body: RegisterSchema, query: PaginationSchema })(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("stops at the first failing target and does not call next()", () => {
    const req = mockReq({
      body: {},   // invalid — missing required fields
      query: { page: "1" },
    });
    const res = mockRes();
    const next = mockNext();

    guardAll({ body: RegisterSchema, query: PaginationSchema })(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});


// ═══════════════════════════════════════════════════════════════
describe("createGuard()", () => {

  it("creates a reusable guard with pre-configured options", () => {
    // Create a guard factory with custom status and formatter
    const myGuard = createGuard({
      status: 422,
      formatError: (issues) => ({ validationErrors: issues }),
    });

    const req = mockReq({ body: {} }); // invalid body
    const res = mockRes();
    const next = mockNext();

    // Use the custom guard — same as guard() but with opts pre-filled
    myGuard(RegisterSchema)(req, res as any, next);

    // Should use the custom status code
    expect(res.status).toHaveBeenCalledWith(422);

    // Should use the custom response shape
    const body = (res.json as any).mock.calls[0][0];
    expect(body.validationErrors).toBeDefined();
  });

  it("works correctly for valid input too", () => {
    const myGuard = createGuard({ status: 422 });

    const req = mockReq({ body: { email: "user@example.com", password: "password123", name: "Alice" } });
    const res = mockRes();
    const next = mockNext();

    myGuard(RegisterSchema)(req, res as any, next);

    // Valid input — next() called, no error response
    expect(next).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
  });
});