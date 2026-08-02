import { defineConfig, loadEnv } from "vite"

// Builds the Figma **main thread** bundle (sandbox, no DOM) as a single IIFE
// script → dist/code.js. No runtime imports, no code-splitting.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(
        env.VITE_API_URL || "http://localhost:8090",
      ),
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2017",
      minify: false,
      lib: {
        entry: "src/main/main.ts",
        formats: ["iife"],
        // Must be a legal JS identifier (IIFE global). Display name lives in manifest.json.
        name: "DesignHandoff",
        fileName: () => "code.js",
      },
    },
  }
})
