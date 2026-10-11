import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const viteEntrypoint = resolve(projectRoot, "node_modules/vite/bin/vite.js");
const serverEntrypoint = resolve(projectRoot, "server.js");
const sharedEnv = { ...process.env, NODE_ENV: "development" };
const children = [];
let stopping = false;
let exitCode = 0;

function startChild(command, args, env = sharedEnv) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", () => {
    console.error("[dev] A PawSupply development process could not start.");
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (signal || (code ?? 1) !== 0) {
      console.error("[dev] A PawSupply development process stopped unexpectedly.");
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  const timer = setTimeout(() => process.exit(exitCode || 1), 5000);
  timer.unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startChild(process.execPath, [serverEntrypoint, "--api-only"], { ...sharedEnv, API_PORT: "3001" });
startChild(process.execPath, [viteEntrypoint, "--host", "0.0.0.0", "--port", "3000", "--strictPort"]);
