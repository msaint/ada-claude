import fs from "node:fs";

/** Minimal .env loader for CLI scripts (Next.js loads these itself at runtime). */
export function loadEnvFiles(files = [".env.local", ".env"]) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (m && process.env[m[1]] === undefined && m[2] !== "") process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
