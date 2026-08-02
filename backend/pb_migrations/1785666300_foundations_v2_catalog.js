/// <reference path="../pb_data/types.d.ts" />
/**
 * Foundations v2 catalog: update field help to match schema.json and clear
 * non-v2 payload blobs (no backwards compatibility — re-sync from Figma).
 *
 * PocketBase limits field help to 300 characters.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("foundations")

    const dataField = collection.fields.getByName("data")
    dataField.help =
      "v2 mirror: sources[fileKey].tokens + catalog + history (initial|diff|source_removed). Categories: color, typography, number, shadow, blur, grid, other. Sync replaces one file slice."

    const variablesCount = collection.fields.getByName("variables_count")
    variablesCount.help =
      "Catalog tokens with origin=variable (all synced files)."

    const stylesCount = collection.fields.getByName("styles_count")
    stylesCount.help =
      "Catalog tokens with origin paint|text|effect|grid (all synced files)."

    app.save(collection)

    // Wipe pre-v2 JSON so the app does not render the old variables/styles shape.
    const empty = {
      version: 2,
      sources: {},
      catalog: {},
      history: [],
    }
    const rows = app.findAllRecords(collection)
    for (const row of rows) {
      const raw = row.get("data")
      let version = 0
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        version = Number(raw.version) || 0
      }
      if (version === 2) continue
      row.set("data", empty)
      row.set("variables_count", 0)
      row.set("styles_count", 0)
      app.save(row)
    }
  },
  (app) => {
    // Help text rollback only — cannot restore wiped v1 payloads.
    const collection = app.findCollectionByNameOrId("foundations")
    const dataField = collection.fields.getByName("data")
    dataField.help =
      "Multi-file merged tokens by Figma fileKey with flat variables/styles and capped history."
    const variablesCount = collection.fields.getByName("variables_count")
    variablesCount.help = "Total variable count across flattened sources."
    const stylesCount = collection.fields.getByName("styles_count")
    stylesCount.help = "Total style count across flattened sources."
    app.save(collection)
  },
)
