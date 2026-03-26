// ─────────────────────────────────────────────────────────────
// This module provides Express middleware for validating incoming
// requests using Zod schemas.
//
// IT SOLVES THREE PROBLEMS:
//   1. Boilerplate: no more try/catch (Schema.parse) in every route.
//   2. Consistency: every validation error has the exact same JSON shape.
//   3. Type Safety: req.body/query/params are automatically typed after validation.
// ─────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { formatZodError, ValidationIssue } from "./formatError";


// ── GuardOptions ──────────────────────────────────────────────
// Configuration for how the guard behaves when validation fails.
export interface GuardOptions {
  // The HTTP status code to send on failure. Default: 400.
  status?: number;

  // A custom function to format the error response.
  // Useful if you need a specific JSON shape for your frontend.
  formatError?: (issues: ValidationIssue[]) => any;
}


// ── Target ────────────────────────────────────────────────────
// Which part of the Express Request object we are validating.
export type GuardTarget = "body" | "query" | "params" | "headers";


// ── guard() ───────────────────────────────────────────────────
// The primary middleware factory.
// Returns an Express middleware that validates req[target] against the schema.
export function guard<T extends z.ZodTypeAny>(
  schema: T,
  target: GuardTarget = "body",
  options: GuardOptions = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Attempt to parse the data from the target
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      // Validation failed.
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "root",
        message: issue.message,
        code: issue.code,
      }));

      // Use custom formatter if provided, otherwise use default
      const errorBody = options.formatError
        ? options.formatError(issues)
        : formatZodError(result.error);

      // Send the error response and STOP (do not call next)
      return res.status(options.status || 400).json(errorBody);
    }

    // Validation passed.
    // Overwrite the request object with the parsed (and possibly coerced/defaulted) data.
    // This ensures that downstream handlers use the cleaned data.
    req[target] = result.data;

    // Move to the next middleware/handler
    next();
  };
}


// ── guardAll() ────────────────────────────────────────────────
// Validates multiple parts of the request at once.
// Example: guardAll({ body: UserSchema, query: PaginationSchema })
export function guardAll(
  targets: Partial<Record<GuardTarget, z.ZodTypeAny>>,
  options: GuardOptions = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const allIssues: ValidationIssue[] = [];
    const parsedData: Record<string, any> = {};

    // Loop through each target we want to validate
    for (const [target, schema] of Object.entries(targets)) {
      if (!schema) continue;

      const result = schema.safeParse(req[target as GuardTarget]);

      if (!result.success) {
        // Collect issues with target prefix for clarity when multiple targets fail
        // e.g. "body.email" instead of just "email"
        allIssues.push(
          ...result.error.issues.map((issue) => ({
            field: `${target}.${issue.path.join(".")}`.replace(/\.$/, "") || target,
            message: issue.message,
            code: issue.code,
          }))
        );
      } else {
        // Save parsed data to apply later only if all targets pass
        parsedData[target] = result.data;
      }
    }

    if (allIssues.length > 0) {
      // Use custom formatter if provided, otherwise use default shape
      const errorBody = options.formatError
        ? options.formatError(allIssues)
        : {
            status: options.status || 400,
            code: "VALIDATION_FAILED",
            message: "Request validation failed",
            issues: allIssues,
          };

      return res.status(options.status || 400).json(errorBody);
    }

    // All targets passed — update the request object with cleaned data
    for (const [target, data] of Object.entries(parsedData)) {
      (req as any)[target] = data;
    }

    next();
  };
}


// ── createGuard() ─────────────────────────────────────────────
// Creates a customized version of the guard() function with defaults pre-applied.
// Useful for internal APIs that want to use 422 instead of 400 globally.
export function createGuard(defaultOptions: GuardOptions) {
  return <T extends z.ZodTypeAny>(
    schema: T,
    target: GuardTarget = "body",
    options: GuardOptions = {}
  ) => {
    // Merge default options with specific call options
    return guard(schema, target, { ...defaultOptions, ...options });
  };
}