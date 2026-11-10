import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.COMMIT_REF ??
    execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
    }).trim();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_SHA__: JSON.stringify(
        command === "serve" ? "dev" : commit.slice(0, 7),
      ),
    },
  };
});
