// ─────────────────────────────────────────────────────────────
// Tests for the envault() function.
// We use Vitest — it has the same API as Jest but runs much faster.
//
// HOW TO RUN:
//   pnpm test              ← runs all tests once
//   pnpm test:watch        ← re-runs tests every time you save a file
//   pnpm test:coverage     ← runs tests + shows which lines are tested
// ─────────────────────────────────────────────────────────────

// Import the test functions from Vitest.
//   describe = groups related tests together under one label
//   it       = defines one individual test case
//   expect   = makes an assertion (checks if something is true)
//   beforeEach = runs a function before EACH test in the describe block
import { describe, it, expect, beforeEach } from "vitest";

// Import the function we are testing.
import { envault } from "../src/env";

// ── Shared option shorthand ────────────────────────────────────
// We use these options in almost every test:
//   dotenv: false     → do not try to load a .env file during tests
//   exitOnError: false → throw an Error instead of process.exit(1)
//                        so our tests can catch and check the error
const NO_DOTENV = { dotenv: false, exitOnError: false };


// ── describe block ────────────────────────────────────────────
// "describe" groups related tests. The string label shows up in the output.
describe("envault()", () => {

  // beforeEach runs this function before EVERY "it" test in this describe block.
  // We use it to clean process.env so one test does not pollute the next.
  // If test A sets process.env.PORT = "3000" and test B forgets to set it,
  // test B would accidentally use test A's value — giving a false pass.
  beforeEach(() => {
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
    delete process.env.DEBUG;
    delete process.env.NODE_ENV;
    delete process.env.SMTP_EMAIL;
    delete process.env.API_URL;
  });

  // ── String type ─────────────────────────────────────────────
  describe("type: string", () => {

    it("returns the value as a string", () => {
      process.env.DATABASE_URL = "postgres://localhost/mydb";

      const env = envault(
        { DATABASE_URL: { type: "string" } },
        NO_DOTENV
      );

      // .toBe() checks strict equality (===)
      expect(env.DATABASE_URL).toBe("postgres://localhost/mydb");
    });

    it("throws when a required string is missing", () => {
      // We do NOT set process.env.DATABASE_URL here.
      // expect(...).toThrow() checks that calling the function throws an error.
      expect(() =>
        envault({ DATABASE_URL: { type: "string" } }, NO_DOTENV)
      ).toThrow();
    });

    it("uses the custom error message when provided", () => {
      expect(() =>
        envault(
          { DATABASE_URL: { type: "string", message: "Please set DATABASE_URL" } },
          NO_DOTENV
        )
        // .toThrow("text") checks that the error message CONTAINS that text
      ).toThrow("Please set DATABASE_URL");
    });
  });

  // ── Number type ──────────────────────────────────────────────
  describe("type: number", () => {

    it("converts a string number to a real JavaScript number", () => {
      process.env.PORT = "3000";

      const env = envault({ PORT: { type: "number" } }, NO_DOTENV);

      // toBe(3000) checks it is the number 3000, not the string "3000"
      expect(env.PORT).toBe(3000);

      // Double-check the JavaScript type is "number" not "string"
      expect(typeof env.PORT).toBe("number");
    });

    it("throws when the value is not a valid number", () => {
      process.env.PORT = "not-a-number";

      expect(() =>
        envault({ PORT: { type: "number" } }, NO_DOTENV)
      ).toThrow();
    });

    it("throws when value is below min", () => {
      process.env.PORT = "80"; // Below min of 1000

      expect(() =>
        envault({ PORT: { type: "number", min: 1000 } }, NO_DOTENV)
      ).toThrow();
    });

    it("throws when value is above max", () => {
      process.env.PORT = "99999"; // Above max of 65535

      expect(() =>
        envault({ PORT: { type: "number", max: 65535 } }, NO_DOTENV)
      ).toThrow();
    });

    it("accepts a value within min and max range", () => {
      process.env.PORT = "3000";

      const env = envault(
        { PORT: { type: "number", min: 1000, max: 9999 } },
        NO_DOTENV
      );
      expect(env.PORT).toBe(3000);
    });
  });

  // ── Boolean type ─────────────────────────────────────────────
  describe("type: boolean", () => {

    it('converts "true" to boolean true', () => {
      process.env.DEBUG = "true";
      const env = envault({ DEBUG: { type: "boolean" } }, NO_DOTENV);
      expect(env.DEBUG).toBe(true);
    });

    it('converts "1" to boolean true', () => {
      process.env.DEBUG = "1";
      const env = envault({ DEBUG: { type: "boolean" } }, NO_DOTENV);
      expect(env.DEBUG).toBe(true);
    });

    it('converts "false" to boolean false', () => {
      process.env.DEBUG = "false";
      const env = envault({ DEBUG: { type: "boolean" } }, NO_DOTENV);
      expect(env.DEBUG).toBe(false);
    });

    it('converts "0" to boolean false', () => {
      process.env.DEBUG = "0";
      const env = envault({ DEBUG: { type: "boolean" } }, NO_DOTENV);
      expect(env.DEBUG).toBe(false);
    });

    it('throws for invalid boolean value like "yes"', () => {
      process.env.DEBUG = "yes"; // Only true/false/1/0 are valid

      expect(() =>
        envault({ DEBUG: { type: "boolean" } }, NO_DOTENV)
      ).toThrow();
    });
  });

  // ── URL type ─────────────────────────────────────────────────
  describe("type: url", () => {

    it("accepts a valid HTTPS URL", () => {
      process.env.API_URL = "https://api.example.com";
      const env = envault({ API_URL: { type: "url" } }, NO_DOTENV);
      expect(env.API_URL).toBe("https://api.example.com");
    });

    it("throws for a plain string that is not a URL", () => {
      process.env.API_URL = "not-a-url";

      expect(() =>
        envault({ API_URL: { type: "url" } }, NO_DOTENV)
      ).toThrow();
    });

    it("throws for a URL missing the protocol", () => {
      process.env.API_URL = "api.example.com"; // no https://

      expect(() =>
        envault({ API_URL: { type: "url" } }, NO_DOTENV)
      ).toThrow();
    });
  });

  // ── Email type ───────────────────────────────────────────────
  describe("type: email", () => {

    it("accepts a valid email address", () => {
      process.env.SMTP_EMAIL = "hello@example.com";
      const env = envault({ SMTP_EMAIL: { type: "email" } }, NO_DOTENV);
      expect(env.SMTP_EMAIL).toBe("hello@example.com");
    });

    it("throws for a string missing the @ symbol", () => {
      process.env.SMTP_EMAIL = "notanemail";

      expect(() =>
        envault({ SMTP_EMAIL: { type: "email" } }, NO_DOTENV)
      ).toThrow();
    });
  });

  // ── Default values ───────────────────────────────────────────
  describe("default values", () => {

    it("uses the default when the variable is not set", () => {
      // process.env.PORT is NOT set — we deleted it in beforeEach
      const env = envault(
        { PORT: { type: "number", default: 8080 } },
        NO_DOTENV
      );
      expect(env.PORT).toBe(8080); // Got the default
    });

    it("uses the real value over the default when variable IS set", () => {
      process.env.PORT = "5000"; // Explicitly set

      const env = envault(
        { PORT: { type: "number", default: 8080 } },
        NO_DOTENV
      );
      expect(env.PORT).toBe(5000); // Real value wins over default
    });
  });

  // ── Optional fields ──────────────────────────────────────────
  describe("required: false", () => {

    it("returns undefined for missing optional field", () => {
      // process.env.SMTP_EMAIL is NOT set
      const env = envault(
        { SMTP_EMAIL: { type: "email", required: false } },
        NO_DOTENV
      );
      // .toBeUndefined() checks that the value is exactly undefined
      expect(env.SMTP_EMAIL).toBeUndefined();
    });

    it("returns the value when optional field IS set", () => {
      process.env.SMTP_EMAIL = "admin@example.com";

      const env = envault(
        { SMTP_EMAIL: { type: "email", required: false } },
        NO_DOTENV
      );
      expect(env.SMTP_EMAIL).toBe("admin@example.com");
    });
  });

  // ── Enum validation ──────────────────────────────────────────
  describe("enum validation", () => {

    it("accepts a value that is in the allowed list", () => {
      process.env.NODE_ENV = "production";

      const env = envault(
        { NODE_ENV: { type: "string", enum: ["development", "production", "test"] } },
        NO_DOTENV
      );
      expect(env.NODE_ENV).toBe("production");
    });

    it("throws for a value not in the allowed list", () => {
      process.env.NODE_ENV = "staging"; // Not in the enum list

      expect(() =>
        envault(
          { NODE_ENV: { type: "string", enum: ["development", "production", "test"] } },
          NO_DOTENV
        )
      ).toThrow();
    });
  });

  // ── Multiple errors ──────────────────────────────────────────
  describe("multiple validation errors", () => {

    it("collects all errors before throwing — not just the first one", () => {
      // Both PORT and DATABASE_URL are missing

      let errorMessage = "";
      try {
        envault(
          {
            PORT: { type: "number" },
            DATABASE_URL: { type: "string" },
          },
          NO_DOTENV
        );
      } catch (err) {
        // Capture the error message so we can check it
        errorMessage = (err as Error).message;
      }

      // The error message should mention BOTH missing variables
      expect(errorMessage).toContain("PORT");
      expect(errorMessage).toContain("DATABASE_URL");
    });
  });

  // ── Array type ──────────────────────────────────────────────
  describe("type: array", () => {
    it("converts a comma-separated string to an array of strings", () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000, https://example.com";
      const env = envault({ ALLOWED_ORIGINS: { type: "array" } }, NO_DOTENV);
      expect(env.ALLOWED_ORIGINS).toEqual(["http://localhost:3000", "https://example.com"]);
    });

    it("handles empty strings and spaces correctly", () => {
      process.env.ALLOWED_ORIGINS = "a, , b,,c ";
      const env = envault({ ALLOWED_ORIGINS: { type: "array" } }, NO_DOTENV);
      expect(env.ALLOWED_ORIGINS).toEqual(["a", "b", "c"]);
    });
  });

  // ── JSON type ───────────────────────────────────────────────
  describe("type: json", () => {
    it("parses a JSON string into an object", () => {
      process.env.CONFIG = '{"port": 80, "host": "localhost"}';
      const env = envault({ CONFIG: { type: "json" } }, NO_DOTENV);
      expect(env.CONFIG).toEqual({ port: 80, host: "localhost" });
    });

    it("throws for invalid JSON", () => {
      process.env.CONFIG = '{"invalid": json';
      expect(() => envault({ CONFIG: { type: "json" } }, NO_DOTENV)).toThrow();
    });
  });

  // ── Custom validation ───────────────────────────────────────
  describe("validate function", () => {
    it("passes when the validate function returns true", () => {
      process.env.PORT = "3000";
      const env = envault({
        PORT: {
          type: "number",
          validate: (val) => (val as number) % 2 === 0 // only even ports
        }
      }, NO_DOTENV);
      expect(env.PORT).toBe(3000);
    });

    it("throws when the validate function returns false", () => {
      process.env.PORT = "3001";
      expect(() => envault({
        PORT: {
          type: "number",
          validate: (val) => (val as number) % 2 === 0
        }
      }, NO_DOTENV)).toThrow();
    });

    it("uses the custom error message returned by the validate function", () => {
      process.env.PORT = "3001";
      expect(() => envault({
        PORT: {
          type: "number",
          validate: (val) => (val as number) % 2 === 0 ? true : "Port must be even"
        }
      }, NO_DOTENV)).toThrow("Port must be even");
    });
  });

  // ── Secret masking ──────────────────────────────────────────
  describe("isSecret: true", () => {
    it("masks the value in error messages", () => {
      process.env.API_KEY = "super-secret-123";
      // Intentionally fail by setting wrong type
      let errorMessage = "";
      try {
        envault({
          API_KEY: {
            type: "number",
            isSecret: true
          }
        }, NO_DOTENV);
      } catch (err) {
        errorMessage = (err as Error).message;
      }
      expect(errorMessage).toContain("********");
      expect(errorMessage).not.toContain("super-secret-123");
    });
  });
});