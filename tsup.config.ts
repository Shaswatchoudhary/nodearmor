import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "index": "src/index.ts",
    "env/index": "src/env/index.ts",
    "hash/index": "src/hash/index.ts",
    "guard/index": "src/guard/index.ts",
    "errors/index": "src/errors/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Mark argon2 as external — it is a native C++ package with its own
  // compiled binaries. It cannot and should not be bundled into dist/.
  // When a developer installs nodearmor, npm installs argon2 separately
  // and Node.js loads it at runtime from node_modules.
  external: ["argon2"],
});