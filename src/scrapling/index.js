import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

// Prefer an explicit venv from env, else the standard project .venv.
const resolvePython = () => {
  const candidates = [
    process.env.SCRAPLING_PYTHON,
    path.join(projectRoot, ".venv", "bin", "python"),
    path.join(projectRoot, ".venv", "Scripts", "python.exe"), // Windows fallback
    "python3",
  ].filter(Boolean);
  return candidates;
};

const WORKER_PATH = path.join(projectRoot, "scripts", "scrapling_worker.py");

/**
 * Run the Scrapling Python worker synchronously (waits for child exit) and
 * return its parsed stdout JSON.
 *
 * @param {object} request  { url, js, proxy, headers, extract, timeout }
 * @returns {Promise<object>} worker result { ok, status, text, extracts, error }
 */
export const scraplingFetch = (request = {}) =>
  new Promise((resolve, reject) => {
    const pythonCandidates = resolvePython();
    // Find the first python binary that exists.
    const spawnIt = (remaining) => {
      if (remaining.length === 0) {
        reject(new Error("No usable Python interpreter found — set SCRAPLING_PYTHON or create .venv"));
        return;
      }
      const py = remaining[0];
      const child = spawn(py, [WORKER_PATH], {
        cwd: projectRoot,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));

      child.on("error", (err) => {
        // python binary not found / not executable -> try next candidate
        spawnIt(remaining.slice(1));
      });

      child.on("close", (code) => {
        const trimmed = stdout.trim();
        if (code === 0 && trimmed) {
          try {
            resolve(JSON.parse(trimmed));
            return;
          } catch {
            /* fall through to error below */
          }
        }
        let parsed = null;
        try {
          parsed = trimmed ? JSON.parse(trimmed) : null;
        } catch {
          /* ignore */
        }
        if (parsed) resolve(parsed);
        else reject(new Error(stderr.trim() || `scrapling worker exited with code ${code}`));
      });

      child.stdin.write(JSON.stringify(request));
      child.stdin.end();
    };

    spawnIt(pythonCandidates);
  });

export default scraplingFetch;
