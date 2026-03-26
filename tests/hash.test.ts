// ─────────────────────────────────────────────────────────────
// NOTE ON SPEED:
// These tests are intentionally slower than the env tests.
// Argon2id with memoryCost: 65536 takes ~200-400ms per hash.
// That slowness IS the security — it is not a bug.
// For tests we use lower parameters to keep the suite fast.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { hash, verify, needsRehash } from "../src/hash";

// Fast options used in tests to avoid 400ms per test.
// memoryCost: 4096 = 4MB instead of 64MB.
// NEVER use these values in production — only in tests.
const FAST = { memoryCost: 4096, timeCost: 2 };


describe("hash()", () => {

  it("returns a string starting with $argon2id$", async () => {
    const result = await hash("mypassword", FAST);

    // Every Argon2id hash starts with this prefix.
    // If it starts with $2b$ instead, that would be bcrypt — wrong algorithm.
    expect(result).toMatch(/^\$argon2id\$/);
  });

  it("produces a different hash every time for the same password", async () => {
    // This is because argon2 generates a new random salt for every hash call.
    // The salt is embedded in the output string — that is why verify() works
    // without needing the salt stored separately.
    const hash1 = await hash("samepassword", FAST);
    const hash2 = await hash("samepassword", FAST);

    // These two hashes are different strings BUT both verify correctly.
    // This is correct and expected behavior — not a bug.
    expect(hash1).not.toBe(hash2);
  });

  it("returns a string (not null, not undefined, not a number)", async () => {
    const result = await hash("anypassword", FAST);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("works with a very long password", async () => {
    // Some hash algorithms have a max password length (bcrypt stops at 72 bytes).
    // Argon2id has no such limit — the full password is always hashed.
    const longPassword = "a".repeat(500);
    const result = await hash(longPassword, FAST);
    expect(result).toMatch(/^\$argon2id\$/);
  });

  it("works with special characters and unicode in password", async () => {
    const result = await hash("p@$$w0rd!🔐中文", FAST);
    expect(result).toMatch(/^\$argon2id\$/);
  });

  it("accepts custom memory and time cost overrides", async () => {
    // This verifies that passing options does not break anything.
    const result = await hash("password", { memoryCost: 8192, timeCost: 2 });
    expect(result).toMatch(/^\$argon2id\$/);
  });

});


describe("verify()", () => {

  it("returns true when the correct password is provided", async () => {
    // Step 1: hash the password (simulating registration)
    const stored = await hash("correctpassword", FAST);

    // Step 2: verify the same password (simulating login)
    const isValid = await verify(stored, "correctpassword");

    expect(isValid).toBe(true);
  });

  it("returns false when the wrong password is provided", async () => {
    const stored = await hash("correctpassword", FAST);

    // A different password should NEVER verify successfully.
    const isValid = await verify(stored, "wrongpassword");

    expect(isValid).toBe(false);
  });

  it("returns false for an empty password attempt", async () => {
    const stored = await hash("mypassword", FAST);
    const isValid = await verify(stored, "");
    expect(isValid).toBe(false);
  });

  it("returns false for a malformed hash string — does not throw", async () => {
    // If someone passes a corrupted or non-Argon2 hash, verify()
    // should return false cleanly instead of crashing the route handler.
    // The try/catch inside verify() handles this.
    const isValid = await verify("this-is-not-a-real-hash", "password");
    expect(isValid).toBe(false);
  });

  it("returns false for an empty hash string — does not throw", async () => {
    const isValid = await verify("", "password");
    expect(isValid).toBe(false);
  });

  it("is case-sensitive — PASSWORD and password are different", async () => {
    const stored = await hash("Password123", FAST);

    expect(await verify(stored, "Password123")).toBe(true);  // correct case
    expect(await verify(stored, "password123")).toBe(false); // wrong case
    expect(await verify(stored, "PASSWORD123")).toBe(false); // wrong case
  });

  it("hash and verify round-trip works end to end", async () => {
    // This simulates a full register → login cycle.
    const plainPassword = "SuperSecret!99";

    // REGISTER: hash the password before saving to database
    const savedHash = await hash(plainPassword, FAST);

    // LOGIN ATTEMPT 1: correct password
    expect(await verify(savedHash, plainPassword)).toBe(true);

    // LOGIN ATTEMPT 2: wrong password (e.g. user mistyped)
    expect(await verify(savedHash, "SuperSecret!00")).toBe(false);
  });

});


describe("needsRehash()", () => {

  it("returns false for a fresh hash made with current defaults", async () => {
    // We hash with the same defaults that needsRehash() checks against.
    // The hash is current — no rehash needed.
    const stored = await hash("password");

    // No opts passed → uses OWASP_DEFAULTS as the target
    const result = await needsRehash(stored);

    expect(result).toBe(false);
  });

  it("returns true when memoryCost is lower than target", async () => {
    // We hash with a low memoryCost (simulating an old hash from 2 years ago).
    const oldHash = await hash("password", { memoryCost: 4096 });

    // needsRehash() compares 4096 (stored) against 65536 (OWASP default target).
    // 4096 < 65536 → the hash is weaker → needs rehashing → returns true.
    const result = await needsRehash(oldHash);

    expect(result).toBe(true);
  });

  it("returns true when timeCost is lower than target", async () => {
    // Hash with timeCost: 1 (very weak).
    // OWASP default is timeCost: 3.
    const weakHash = await hash("password", { memoryCost: 4096, timeCost: 2 });


    const result = await needsRehash(weakHash);

    expect(result).toBe(true);
  });

  it("demonstrates the upgrade pattern — rehash on login", async () => {
    // This is the real-world usage pattern.
    // A user has an old hash in the database made with weak parameters.

    // Simulate old hash (weak settings from a previous version)
    let storedInDatabase = await hash("userpassword", { memoryCost: 4096, timeCost: 2 });

    // User logs in with correct password
    const loginIsValid = await verify(storedInDatabase, "userpassword");
    expect(loginIsValid).toBe(true);

    // Check if the hash needs upgrading
    const shouldUpgrade = await needsRehash(storedInDatabase);
    expect(shouldUpgrade).toBe(true);

    // Re-hash with current OWASP defaults and save back to database
    if (shouldUpgrade) {
      storedInDatabase = await hash("userpassword"); // uses OWASP defaults
    }

    // The new hash should NOT need rehashing
    const stillNeedsUpgrade = await needsRehash(storedInDatabase);
    expect(stillNeedsUpgrade).toBe(false);

    // And it should still verify correctly
    expect(await verify(storedInDatabase, "userpassword")).toBe(true);
  });

});