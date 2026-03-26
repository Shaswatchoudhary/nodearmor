// ─────────────────────────────────────────────────────────────
// This module wraps the argon2 library to provide dead-simple
// password hashing using the Argon2id algorithm.
//
// WHY ARGON2id AND NOT BCRYPT?
// bcrypt was designed in 1999. It is CPU-only — a modern GPU with
// thousands of cores can attack bcrypt hashes in massive parallel.
//
// Argon2id is memory-hard — every single hash attempt requires a
// configurable amount of RAM (default: 64MB). An attacker with a
// GPU gets no parallelism advantage because each attempt needs 64MB.
// 16GB of GPU RAM ÷ 64MB = only 250 parallel attacks, not thousands.
//
// Argon2id won the international Password Hashing Competition in 2015
// and is the algorithm recommended by OWASP in 2025.
//
// WHAT THIS MODULE DOES:
//   hash()        → takes a plain password, returns an Argon2id hash string
//   verify()      → checks a plain password against a stored hash
//   needsRehash() → checks if a stored hash used weaker old parameters
// ─────────────────────────────────────────────────────────────

// argon2 is a native Node.js module — it has C++ code compiled on install.
// That is why installation takes 20-30 seconds. The C++ is what makes it fast.
// We import the entire module as "argon2" to access its functions and constants.
import argon2 from "argon2";


// ── OWASP_DEFAULTS ────────────────────────────────────────────
// These are the exact parameters recommended by OWASP (Open Web Application
// Security Project) as of 2025. OWASP reviews these annually and updates
// them as hardware gets faster.
//
// You should NOT change these unless you know what you are doing.
// The whole point of nodearmor is that these are already correct.
//
// "as const" tells TypeScript these values are fixed literals — they
// will never be reassigned. This gives better type inference.
const OWASP_DEFAULTS = {

  // argon2.argon2id is the numeric constant for the Argon2id variant.
  // There are three variants: argon2d, argon2i, argon2id.
  // argon2id is the recommended one — it combines the strengths of both.
  type: argon2.argon2id,

  // How much RAM (in kilobytes) each hash attempt requires.
  // 65536 KB = 64 MB. An attacker must dedicate 64MB of RAM per attempt.
  // OWASP minimum is 19MB (19456). We use 64MB for stronger protection.
  memoryCost: 65536,

  // How many times the algorithm iterates over the memory.
  // More iterations = slower = harder to attack. OWASP recommends at least 2.
  // We use 3 for a good balance between security and speed on a normal server.
  timeCost: 3,

  // How many parallel threads are used per hash.
  // 1 means single-threaded. This is the safe default for most servers.
  // Increasing this uses more CPU but does not significantly improve security.
  parallelism: 1,

} as const;


// ── HashOptions ───────────────────────────────────────────────
// The optional second argument for hash() and needsRehash().
// Developers only need this if they want to override the OWASP defaults —
// for example, on a high-security financial app that can afford more RAM.
export interface HashOptions {
  memoryCost?: number;  // RAM in KB per hash attempt
  timeCost?: number;  // Number of iterations
  parallelism?: number;  // Number of parallel threads
}


// ── hash() ────────────────────────────────────────────────────
// Takes a plain-text password and returns a safe hash string.
//
// The returned string looks like this:
//   $argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>
//   ^^^^^^^^                         ^^^^^^^^ ^^^^^^
//   algorithm                        random   the actual
//   identifier                       salt     hash
//
// This string is SELF-DESCRIBING — it contains the algorithm name,
// version, all parameters, the random salt, and the hash itself.
// This means you never need to store the salt separately in the database.
// You never need to remember what parameters you used.
// argon2.verify() reads all of this from the string automatically.
//
// ASYNC: password hashing is intentionally slow (64MB RAM + 3 iterations).
// We use async/await so Node.js can handle other requests while hashing.
export async function hash(
  password: string,     // The plain-text password from the user
  opts: HashOptions = {} // Optional override — defaults to OWASP settings
): Promise<string> {    // Returns a Promise that resolves to the hash string

  // Spread OWASP_DEFAULTS first, then spread opts on top.
  // This means opts values override the defaults, but only the ones provided.
  // If opts is empty {}, we use pure OWASP_DEFAULTS.
  return argon2.hash(password, { ...OWASP_DEFAULTS, ...opts });
}


// ── verify() ─────────────────────────────────────────────────
// Checks if a plain-text password matches a stored Argon2id hash.
//
// HOW IT WORKS:
// argon2.verify() reads the parameters embedded in the storedHash string
// (the $m=65536,t=3,p=1$ part), re-hashes the provided password with
// those exact same parameters and salt, then compares the result.
// If the two hashes match → the password is correct → returns true.
//
// IMPORTANT SECURITY NOTE:
// Never compare hashes with === or == yourself.
// Always use verify() which uses a constant-time comparison.
// A normal === comparison can leak timing information that attackers
// can use to guess the hash character by character (timing attack).
//
// WHY THE TRY/CATCH:
// If storedHash is malformed or not an Argon2 hash at all,
// argon2.verify() throws an error. We catch it and return false
// instead of letting the error crash the route handler.
export async function verify(
  storedHash: string,  // The hash string retrieved from your database
  password: string   // The plain-text password the user just entered
): Promise<boolean> {  // Returns true if the password is correct

  try {
    return await argon2.verify(storedHash, password);
  } catch {
    // Malformed hash → treat as "does not match" rather than throwing
    return false;
  }
}


// ── needsRehash() ─────────────────────────────────────────────
// Checks if a stored hash was created with weaker (outdated) parameters.
//
// WHY THIS EXISTS — THE MIGRATION PROBLEM:
// Suppose you ship nodearmor v1.0 with memoryCost: 65536 (64MB).
// Six months later, OWASP updates their recommendation to 128MB.
// You update OWASP_DEFAULTS in nodearmor.
// But all your existing users still have hashes made with 64MB settings.
// Those old hashes are weaker than your new standard.
//
// Solution: on every successful login, call needsRehash().
// If it returns true, re-hash the password with the new parameters
// and save the new hash. Over time, all users get upgraded automatically.
// No forced password resets. No breaking changes. Seamless.
//
// This also handles bcrypt → Argon2id migration (see the example in tests).
export async function needsRehash(
  storedHash: string,    // The hash from the database
  opts: HashOptions = {} // The target parameters (defaults to OWASP_DEFAULTS)
): Promise<boolean> {    // Returns true if the hash needs upgrading

  // argon2.needsRehash() reads the parameters embedded in the hash string
  // and compares them to the target parameters you provide.
  // If they are different → the hash is outdated → returns true.
  return argon2.needsRehash(storedHash, { ...OWASP_DEFAULTS, ...opts });
}