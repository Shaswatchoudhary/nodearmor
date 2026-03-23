// ─────────────────────────────────────────────────────────────
// This file defines the SHAPES of things — not the logic.
// Think of it as a contract: "this is what valid input looks like."
// TypeScript uses these types to catch mistakes before you run the code.
// ─────────────────────────────────────────────────────────────

// ── EnvFieldType ──────────────────────────────────────────────
// This is the list of ALL allowed types for an env variable.
// When you write  { type: "number" }  TypeScript will only allow
// one of these seven strings — any typo becomes a compile error.
export type EnvFieldType = "string" | "number" | "boolean" | "url" | "email" | "array" | "json";


// ── EnvField ──────────────────────────────────────────────────
// This is the shape of ONE field in your schema.
// Every key in your schema must look like this object.
// The ? after a property means it is optional.
export interface EnvField {

  // What kind of value this variable should be.
  // Required — you must always tell us the type.
  type: EnvFieldType;

  // Whether this variable must exist in the environment.
  // If you do not write required, it defaults to true (handled in index.ts).
  required?: boolean;

  // A fallback value if the variable is missing entirely.
  // If default is set and the variable is missing, no error is thrown.
  // The union type means it can be any of these JS primitives, arrays, or objects.
  default?: string | number | boolean | any[] | Record<string, any>;

  // A custom error message that replaces the default one.
  // Example: instead of 'Missing required variable: "DB"'
  // you can write: 'Set DATABASE_URL to your PostgreSQL connection string'
  message?: string;

  // A list of the only allowed values for this variable.
  // Only works on type: "string".
  // If the value is not in this array, validation fails.
  enum?: string[];

  // Minimum allowed value. Only works on type: "number".
  // If the number is below this, validation fails.
  min?: number;

  // Maximum allowed value. Only works on type: "number".
  // If the number is above this, validation fails.
  max?: number;

  // A custom validation function.
  // Should return true if valid, or a string (error message) if invalid.
  validate?: (value: any) => boolean | string;

  // If true, the value will be masked in error messages to prevent leaking secrets.
  isSecret?: boolean;
}


// ── EnvSchema ─────────────────────────────────────────────────
// This is the shape of the WHOLE schema you pass to envault().
// Record<string, EnvField> means:
//   - keys are strings  (e.g. "PORT", "DATABASE_URL")
//   - values are EnvField objects (the rules for each variable)
export type EnvSchema = Record<string, EnvField>;


// ── ResolveType ───────────────────────────────────────────────
// This is a TypeScript "conditional type" — it maps each EnvFieldType
// to its corresponding JavaScript type.
type ResolveType<T extends EnvFieldType> =
  T extends "number" ? number :
  T extends "boolean" ? boolean :
  T extends "array" ? string[] :
  T extends "json" ? any :
  string;


// ── ParsedEnv ─────────────────────────────────────────────────
// This is the RETURN TYPE of envault().
// It is a "mapped type" — it reads your schema and generates a new type
// where every key maps to the correct JavaScript type.
//
// The conditional logic:
//   1. If the field HAS a default value, it is NEVER undefined at runtime.
//   2. If it has NO default AND required is false, it CAN be undefined.
//   3. Otherwise (required: true or not set), it is ALWAYS the type.
export type ParsedEnv<S extends EnvSchema> = {
  [K in keyof S]:
  S[K] extends { default: any }
  ? ResolveType<S[K]["type"]>
  : S[K]["required"] extends false
    ? ResolveType<S[K]["type"]> | undefined
    : ResolveType<S[K]["type"]>;
};


// ── EnvaultOptions ────────────────────────────────────────────
// The second argument you can pass to envault().
// Both fields are optional — you only set them when you need to.
export interface EnvaultOptions {

  // Whether to auto-load a .env file before validation.
  //   true (default) → loads .env from the current working directory
  //   false          → skips loading any .env file
  //   "path/to/.env" → loads a .env file from a custom path
  dotenv?: boolean | string;

  // What to do when validation fails.
  //   true (default) → print error to console and call process.exit(1)
  //                    This stops your app immediately. Recommended for production.
  //   false          → throw an Error instead of exiting.
  //                    Useful in tests so the test can catch the error.
  exitOnError?: boolean;
}