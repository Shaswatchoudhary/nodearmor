// src/guard/formatError.ts
// ─────────────────────────────────────────────────────────────
// This file has one job: take a Zod validation error and convert
// it into a clean, consistent HTTP response object.
//
// WHY THIS IS A SEPARATE FILE:
// The formatting logic is reused by guard(), guardAll(), and createGuard().
// Keeping it separate means we test it once and use it everywhere.
// If we ever want to change the error shape, we change it in one place.
// ─────────────────────────────────────────────────────────────

// ZodError is the type of error Zod throws when validation fails.
import type { ZodError } from "zod";


// ── ValidationIssue ───────────────────────────────────────────
// The shape of a single validation problem.
export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}


// ── ValidationErrorResponse ───────────────────────────────────
// The complete HTTP response body when validation fails.
export interface ValidationErrorResponse {
  status: number;
  code: string;
  message: string;
  issues: ValidationIssue[];
}


// ── formatZodError ────────────────────────────────────────────
// Converts a raw ZodError into our clean ValidationErrorResponse shape.
export function formatZodError(err: ZodError): ValidationErrorResponse {
  return {
    status: 400,
    code: "VALIDATION_FAILED",
    message: "Request validation failed",
    issues: err.issues.map((issue) => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
      code: issue.code,
    })),
  };
}
