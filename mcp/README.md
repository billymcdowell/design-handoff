# Design Handoff MCP

Local [Model Context Protocol](https://modelcontextprotocol.io/) server that lets an AI pull **all specs for a design-handoff frame** (layout, styles, typography, CSS / Tailwind / React) from PocketBase.

## Prerequisites

1. Design Handoff running locally (or remotely), e.g. `http://localhost:8090`
2. A PocketBase **user JWT** with at least `developer` role (read access)

### Getting a token

1. Sign in to the app at your PocketBase origin (designer or developer account)
2. Open DevTools → Network, copy the `Authorization` header value from an API request (the JWT)

## Install

```bash
cd mcp
npm install
npm run build   # optional; produces dist/ for node
```

## Cursor config

Add to your Cursor MCP settings (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "design-handoff": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/design-handoff/mcp/src/index.ts"],
      "env": {
        "DESIGN_HANDOFF_URL": "http://localhost:8090",
        "DESIGN_HANDOFF_TOKEN": "<pb auth token>"
      }
    }
  }
}
```

Or after `npm run build`:

```json
{
  "mcpServers": {
    "design-handoff": {
      "command": "node",
      "args": ["/absolute/path/to/design-handoff/mcp/dist/index.js"],
      "env": {
        "DESIGN_HANDOFF_URL": "http://localhost:8090",
        "DESIGN_HANDOFF_TOKEN": "<pb auth token>"
      }
    }
  }
}
```

Restart Cursor (or reload MCP servers) after saving.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_design_specs` | Primary: pass a `/frame/{frameId}` URL (or `frame_id`) → full layer tree + specs |
| `list_projects` | Discover projects without a URL |
| `list_frames` | List frames in a project (includes `url_path`) |
| `get_layer_specs` | Specs for one layer (drill-down) |

### Example

User pastes:

`http://localhost:8090/frame/abc123def456789?projectId=proj00011122233`

The model calls `get_design_specs` with that URL and receives JSON with `frame`, `project`, `layer_count`, and `layers[]` each with `specs.layout` / `styles` / `typography` / `code`.

Optional args on `get_design_specs` / `get_layer_specs`:

- `include_code: false` — omit generated code to shrink large frames
- `code_formats: ["css"]` — only include selected formats

## Env

| Variable | Required | Description |
| --- | --- | --- |
| `DESIGN_HANDOFF_URL` | yes | PocketBase origin, no trailing slash |
| `DESIGN_HANDOFF_TOKEN` | yes | User JWT (`Authorization` bearer value) |

## Dev

```bash
cd mcp
npm install
npm run typecheck
npm run dev   # stdio server (for MCP clients, not interactive use)
```
