#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { getDesignSpecs } from "./tools/get-design-specs.js"
import { getLayerSpecs } from "./tools/get-layer-specs.js"
import { listFrames } from "./tools/list-frames.js"
import { listProjects } from "./tools/list-projects.js"

const codeFormatSchema = z.enum(["css", "tailwind", "react"])

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  }
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  }
}

const server = new McpServer({
  name: "design-handoff",
  version: "0.1.0",
})

server.tool(
  "get_design_specs",
  "Fetch all layer specs for a design-handoff frame. Prefer this when the user shares a /frame/{frameId} URL. Returns frame metadata plus every layer with layout, styles, typography, and generated code (CSS/Tailwind/React). Use include_code=false to shrink large payloads; use get_layer_specs to drill into one node.",
  {
    url: z
      .string()
      .optional()
      .describe(
        "Design-handoff frame URL or path, e.g. http://localhost:8090/frame/{frameId}?projectId=… or /frame/{frameId}"
      ),
    frame_id: z
      .string()
      .optional()
      .describe("PocketBase frames record id (15-char). Use instead of url."),
    include_code: z
      .boolean()
      .optional()
      .describe("Include generated CSS/Tailwind/React (default true)"),
    code_formats: z
      .array(codeFormatSchema)
      .optional()
      .describe("Which code formats to include when include_code is true (default: all)"),
  },
  async (args) => {
    try {
      return jsonResult(await getDesignSpecs(args))
    } catch (err) {
      return errorResult(err)
    }
  }
)

server.tool(
  "list_projects",
  "List design-handoff projects visible to the authenticated user (id, name, frame_count). Use when the user has not shared a frame URL yet.",
  async () => {
    try {
      return jsonResult(await listProjects())
    } catch (err) {
      return errorResult(err)
    }
  }
)

server.tool(
  "list_frames",
  "List frames (screen versions) in a project. Each item includes a url_path you can pass to get_design_specs.",
  {
    project_id: z.string().describe("PocketBase projects record id"),
  },
  async ({ project_id }) => {
    try {
      return jsonResult(await listFrames(project_id))
    } catch (err) {
      return errorResult(err)
    }
  }
)

server.tool(
  "get_layer_specs",
  "Fetch specs for a single layer by id. Use after get_design_specs when focusing on one node, or when the full frame payload is too large.",
  {
    layer_id: z.string().describe("PocketBase layers record id"),
    include_code: z
      .boolean()
      .optional()
      .describe("Include generated CSS/Tailwind/React (default true)"),
    code_formats: z
      .array(codeFormatSchema)
      .optional()
      .describe("Which code formats to include when include_code is true (default: all)"),
  },
  async (args) => {
    try {
      return jsonResult(await getLayerSpecs(args))
    } catch (err) {
      return errorResult(err)
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
