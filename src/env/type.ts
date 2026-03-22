// ─────────────────────────────────────────────────────────────
// This file defines the SHAPES of things — not the logic.
// Think of it as a contract: "this is what valid input looks like."
// TypeScript uses these types to catch mistakes before you run the code.
// ─────────────────────────────────────────────────────────────

// ── EnvFieldType ──────────────────────────────────────────────
// This is the list of ALL allowed types for an env variable.
// When you write  { type: "number" }  TypeScript will only allow
// one of these five strings — any typo becomes a compile error.
export type EnvFieldType = "string" | "number" | "boolean" | "url" | "email";


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
  // The union type means it can be any of these three JS primitives.
  default?: string | number | boolean;

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
//
// Read it as: "IF T is 'number', the output type is number.
//              IF T is 'boolean', the output type is boolean.
//              Otherwise (string, url, email), the output type is string."
//
// This is what makes env.PORT a number and env.DEBUG a boolean
// in your IDE — without you ever writing those types manually.
type ResolveType<T extends EnvFieldType> =
  T extends "number" ? number :
  T extends "boolean" ? boolean :
  string; // string, url, and email all stay as JavaScript strings


// ── ParsedEnv ─────────────────────────────────────────────────
// This is the RETURN TYPE of envault().
// It is a "mapped type" — it reads your schema and generates a new type
// where every key maps to the correct JavaScript type.
//
// Example: if your schema is { PORT: { type: "number" } }
// then ParsedEnv will produce the type: { PORT: number }
//
// The conditional inside handles optional fields:
//   - if required: false → the type is T | undefined
//   - if required is true (or not set) → the type is just T
export type ParsedEnv<S extends EnvSchema> = {
  [K in keyof S]:          // for every key K in your schema S...
  S[K]["required"] extends false
  ? ResolveType<S[K]["type"]> | undefined   // optional → can be undefined
  : ResolveType<S[K]["type"]>;              // required → always the type
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