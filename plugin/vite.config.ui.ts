import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { viteSingleFile } from "vite-plugin-singlefile"

// Builds the plugin **UI iframe** (React + DOM) and inlines every asset into a
// single self-contained file → dist/index.html (required by Figma).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    root: "src/ui",
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(
        env.VITE_API_URL || "http://localhost:8090",
      ),
    },
    plugins: [react(), viteSingleFile()],
    build: {
      outDir: "../../dist",
      emptyOutDir: false,
      target: "es2017",
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
    },
  }
})
