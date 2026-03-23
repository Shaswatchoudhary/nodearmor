// src/env/index.ts
// ─────────────────────────────────────────────────────────────
// This file contains the envault() function — the core of the env module.
// It does three things:
//   1. Reads a .env file and loads values into process.env
//   2. Validates every variable in your schema
//   3. Returns a typed, clean object you can use throughout your app
// ─────────────────────────────────────────────────────────────

// "fs" is Node.js's built-in file system module.
// We use it to read the .env file from disk.
// The "* as fs" syntax imports the whole module under the name "fs".
import * as fs from "fs";

// "path" is Node.js's built-in path utilities module.
// We use path.resolve() to turn a relative path like ".env"
// into an absolute path like "/Users/you/myproject/.env".
import * as path from "path";

// We import our types from the types file.
// "import type" means these are only used at compile time (TypeScript).
// They are erased completely when the code runs — zero runtime cost.
import type { EnvSchema, ParsedEnv, EnvaultOptions, EnvField } from "./type";


// ── loadDotenv ────────────────────────────────────────────────
// This function reads a .env file and pushes each key-value pair
// into process.env — the global object Node.js uses for environment variables.
//
// WHY THIS EXISTS:
// A .env file is just a plain text file. Node.js does NOT read it automatically.
// Someone has to read the file and set process.env[key] = value manually.
// This is all dotenv does — and this is all we do here, with no extra package.
//
// The parameter filePath is the absolute path to the .env file.
function loadDotenv(filePath: string): void {

  // fs.existsSync() checks if the file exists on disk.
  // If the file does not exist, we silently return — no error.
  // This is intentional: in production, you typically have no .env file.
  // Variables come from the server environment (e.g. Railway, AWS) instead.
  if (!fs.existsSync(filePath)) return;

  // fs.readFileSync() reads the entire file as a single string.
  // "utf-8" tells Node the file is text, not binary data.
  // .split("\n") breaks that string into an array of lines.
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");

  // Loop through each line in the .env file.
  for (const line of lines) {

    // .trim() removes whitespace from both ends of the string.
    const trimmed = line.trim();

    // Skip empty lines and comment lines (lines starting with #).
    // .env files use # for comments, just like bash scripts.
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Find the position of the first = sign.
    // We use indexOf instead of split("=") because values can contain = signs.
    // Example: DATABASE_URL=postgres://user:pass=word@host/db
    // indexOf("=") gives us 12. split("=") would split at every = sign.
    const eqIndex = trimmed.indexOf("=");

    // If there is no = sign on this line, it is not a valid key=value pair.
    // Skip it silently.
    if (eqIndex === -1) continue;

    // Everything before the first = is the key. .trim() removes extra spaces.
    // Example line: "  PORT = 3000  " → key becomes "PORT"
    const key = trimmed.slice(0, eqIndex).trim();

    // Everything after the first = is the value.
    // .trim() removes whitespace, then we remove optional surrounding quotes.
    // The regex /^['"]|['"]$/g removes a leading or trailing ' or " character.
    // This allows: PORT="3000" or PORT='3000' or PORT=3000 — all work the same.
    const val = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    // IMPORTANT: we only set the variable if it is NOT already in process.env.
    // This means real environment variables (set on the server) always win
    // over values from the .env file. This is the correct behavior — your
    // production server's DATABASE_URL should override any .env file value.
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}


// ── isValidUrl ────────────────────────────────────────────────
// Checks if a string is a valid URL using the built-in URL constructor.
// The URL constructor throws an error for invalid URLs — we catch that error
// and return false instead of letting it crash the program.
// Returns true for valid URLs like "https://api.example.com".
// Returns false for invalid values like "not-a-url" or "example".
function isValidUrl(value: string): boolean {
  try {
    new URL(value); // If this line throws, the URL is invalid
    return true;    // No throw = valid URL
  } catch {
    return false;   // Threw an error = invalid URL
  }
}


// ── isValidEmail ──────────────────────────────────────────────
// Checks if a string looks like an email address using a regular expression.
// This is intentionally a simple check (not RFC 5322 compliant) —
// it catches obvious mistakes like "notanemail" or "missing@" without
// being so strict that valid emails get rejected.
//
// The regex broken down:
//   ^          = start of string
//   [^\s@]+    = one or more characters that are NOT whitespace or @
//   @          = must contain exactly one @ sign
//   [^\s@]+    = one or more characters after @
//   \.         = must contain a dot
//   [^\s@]+    = one or more characters after the dot
//   $          = end of string
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


// ── envault ───────────────────────────────────────────────────
// The main exported function. This is what developers call in their projects.
//
// GENERICS EXPLAINED:
// The <S extends EnvSchema> part is a TypeScript generic.
// It means: "S can be any type, as long as it extends EnvSchema."
// This lets TypeScript REMEMBER the exact shape of your schema
// so it can compute the correct return type automatically.
//
// Example: if you pass { PORT: { type: "number" } }
// TypeScript knows S = { PORT: { type: "number" } }
// and therefore the return type is { PORT: number }
export function envault<S extends EnvSchema>(
  schema: S,                    // The schema object you define
  options: EnvaultOptions = {}  // Optional config — defaults to empty object
): ParsedEnv<S> {               // Return type is computed from your schema

  // Destructure options with defaults.
  // If the developer did not pass dotenv, default to true (load .env file).
  // If they did not pass exitOnError, default to true (exit the process on failure).
  const { dotenv = true, exitOnError = true } = options;

  // If dotenv loading is enabled, figure out the path and load it.
  if (dotenv) {
    const envFile =
      typeof dotenv === "string"
        ? dotenv                                          // custom path: use as-is
        : path.resolve(process.cwd(), ".env");           // default: .env in project root

    // path.resolve() + process.cwd() = the folder where you run "node" from.
    // This is almost always your project root folder.
    loadDotenv(envFile);
  }

  // This array collects every validation error found.
  // We collect ALL errors before stopping — so the developer sees
  // all missing variables at once, not just the first one.
  const errors: string[] = [];

  // This object will hold the final validated, type-converted values.
  // We use unknown here because we are filling it dynamically in the loop.
  // At the end, we cast it to ParsedEnv<S> which is the correct typed shape.
  const result: Record<string, unknown> = {};

  // Loop through every key-value pair in the schema the developer provided.
  // Object.entries() turns { PORT: {...}, DB: {...} } into:
  // [["PORT", {...}], ["DB", {...}]]
  for (const [key, field] of Object.entries(schema) as [string, EnvField][]) {

    // Look up this variable in process.env.
    // process.env[key] is either a string or undefined.
    const raw = process.env[key];

    // Determine if this field is required.
    // If required is explicitly set to false, it is optional.
    // If required is true or undefined (not set), it is required.
    const isRequired = field.required !== false;

    // ── Missing variable check ────────────────────────────
    // If raw is undefined (not set) or an empty string, the variable is missing.
    if (raw === undefined || raw === "") {

      // If a default value was provided, use it and move to the next field.
      if (field.default !== undefined) {
        result[key] = field.default;
        continue;
      }

      // If the field is required and has no default, record an error.
      if (isRequired) {
        errors.push(
          field.message ?? `Missing required variable: "${key}"`
        );
      } else {
        // Optional field with no default and no value → set to undefined.
        result[key] = undefined;
      }

      // Move to the next field regardless
      continue;
    }

    // Prepare a display value for error messages.
    // If it is a secret, we mask it to avoid leaking sensitive data in logs.
    const displayValue = field.isSecret ? "********" : `"${raw}"`;

    // ── Type validation and coercion ──────────────────────
    // "raw" is now guaranteed to be a non-empty string.
    // We now check the type and convert it to the correct JavaScript type.

    // ── number ────────────────────────────────────────────
    if (field.type === "number") {

      // Number() converts a string to a number.
      // Number("3000") = 3000  ← valid
      // Number("abc")  = NaN   ← invalid (NaN = Not a Number)
      const num = Number(raw);

      // isNaN() checks if the conversion failed.
      if (isNaN(num)) {
        errors.push(
          field.message ?? `"${key}" must be a valid number, got: ${displayValue}`
        );
        continue; // Skip min/max checks — there is nothing to check
      }

      // Check the min boundary if one was set.
      if (field.min !== undefined && num < field.min) {
        errors.push(
          field.message ?? `"${key}" must be >= ${field.min}, got: ${num}`
        );
        continue;
      }

      // Check the max boundary if one was set.
      if (field.max !== undefined && num > field.max) {
        errors.push(
          field.message ?? `"${key}" must be <= ${field.max}, got: ${num}`
        );
        continue;
      }

      // All checks passed — store the real number (not the string).
      result[key] = num;
    }
    // ── boolean ───────────────────────────────────────────
    else if (field.type === "boolean") {

      // Only these four strings are valid boolean representations.
      // .toLowerCase() ensures "True", "TRUE", "TRUE" all work.
      const valid = ["true", "false", "1", "0"];
      if (!valid.includes(raw.toLowerCase())) {
        errors.push(
          field.message ?? `"${key}" must be true/false/1/0, got: ${displayValue}`
        );
        continue;
      }

      // Convert to a real JavaScript boolean.
      // "true" and "1" → true. "false" and "0" → false.
      result[key] = raw === "true" || raw === "1";
    }

    // ── url ───────────────────────────────────────────────
    else if (field.type === "url") {
      if (!isValidUrl(raw)) {
        errors.push(
          field.message ?? `"${key}" must be a valid URL, got: ${displayValue}`
        );
        continue;
      }
      // Valid URL — store the string as-is (it stays a string, not a URL object)
      result[key] = raw;
    }

    // ── email ─────────────────────────────────────────────
    else if (field.type === "email") {
      if (!isValidEmail(raw)) {
        errors.push(
          field.message ?? `"${key}" must be a valid email, got: ${displayValue}`
        );
        continue;
      }
      result[key] = raw;
    }

    // ── json ──────────────────────────────────────────────
    else if (field.type === "json") {
      try {
        result[key] = JSON.parse(raw);
      } catch {
        errors.push(
          field.message ?? `"${key}" must be a valid JSON string, got: ${displayValue}`
        );
        continue;
      }
    }

    // ── array ─────────────────────────────────────────────
    else if (field.type === "array") {
      // Split by comma and trim each element. Filter out empty strings.
      result[key] = raw.split(",").map(s => s.trim()).filter(Boolean);
    }

    // ── string (and fallthrough) ──────────────────────────
    else {
      result[key] = raw;
    }

    // ── enum check ────────────────────────────────────────
    if (field.enum && !field.enum.includes(raw)) {
      errors.push(
        field.message ??
        `"${key}" must be one of [${field.enum.join(", ")}], got: ${displayValue}`
      );
      continue;
    }

    // ── custom validation ─────────────────────────────────
    if (field.validate) {
      const validationResult = field.validate(result[key]);
      if (validationResult !== true) {
        const customMessage = typeof validationResult === "string" 
          ? validationResult 
          : `Invalid value for "${key}"`;
        errors.push(field.message ?? customMessage);
        continue;
      }
    }
  }

  // ── Error reporting ───────────────────────────────────────
  // If we collected any errors, now is when we report them.
  if (errors.length > 0) {

    // Build a formatted error message listing every problem.
    // .map() creates a new array, here adding "  ✗ " before each error.
    // .join("\n") turns the array into a single string with newlines between items.
    const message = [
      "",
      " nodearmor/env — validation failed:",
      "",
      ...errors.map((e) => `  ✗  ${e}`),
      "",
    ].join("\n");

    if (exitOnError) {
      // console.error() prints to stderr (the error output stream).
      // This keeps it separate from normal stdout logs.
      console.error(message);

      // process.exit(1) immediately stops the entire Node.js process.
      // Exit code 1 means "failed" — it is the standard Unix convention.
      // Your app will never start. This is the "fail fast" principle:
      // better to crash loudly at startup than silently misbehave later.
      process.exit(1);
    } else {
      // When exitOnError is false (used in tests), throw an Error instead.
      // The test can catch this error with expect(() => ...).toThrow()
      throw new Error(message);
    }
  }

  // ── Return ────────────────────────────────────────────────
  // All validations passed. Return the result object.
  // "as ParsedEnv<S>" is a TypeScript type assertion — we are telling
  // TypeScript: "trust us, this object has the correct shape."
  // We know this is safe because our loop above built it correctly.
  return result as ParsedEnv<S>;
}