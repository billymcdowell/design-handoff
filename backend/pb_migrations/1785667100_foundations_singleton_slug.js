/// <reference path="../pb_data/types.d.ts" />
/**
 * Greenfield single-tenant foundations: wipe rows, drop per-user owner,
 * add unique slug ("default" singleton). Any designer may write.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("foundations")

    // 1. Wipe all existing foundations data (no migration of user-scoped rows).
    const rows = app.findAllRecords(collection)
    for (const row of rows) {
      app.delete(row)
    }

    // 2. Drop owner relation + unique index.
    collection.indexes = []
    try {
      collection.fields.removeByName("owner")
    } catch (_) {
      // already removed
    }

    // 3. Add singleton slug.
    collection.fields.add(
      new TextField({
        id: "txt_foundations_slug",
        name: "slug",
        required: true,
        presentable: true,
        min: 1,
        max: 64,
        pattern: "^[a-z0-9_-]+$",
        help: "Singleton key. Always \"default\" for this single-tenant deploy.",
      }),
    )

    const dataField = collection.fields.getByName("data")
    dataField.help =
      "v2: sources[fileKey].tokens + catalog + history. Tokens keyed by Figma id (renames update name). Sync replaces one file slice; no-op syncs skip write."

    collection.listRule = '@request.auth.id != ""'
    collection.viewRule = '@request.auth.id != ""'
    collection.createRule =
      '@request.auth.role = "designer" && @request.body.slug = "default"'
    collection.updateRule = '@request.auth.role = "designer"'
    collection.deleteRule = '@request.auth.role = "designer"'

    collection.indexes = [
      "CREATE UNIQUE INDEX `idx_foundations_slug` ON `foundations` (`slug`)",
    ]

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("foundations")

    const rows = app.findAllRecords(collection)
    for (const row of rows) {
      app.delete(row)
    }

    collection.indexes = []
    try {
      collection.fields.removeByName("slug")
    } catch (_) {
      // already removed
    }

    collection.fields.add(
      new RelationField({
        name: "owner",
        required: true,
        maxSelect: 1,
        collectionId: "_pb_users_auth_",
        cascadeDelete: true,
        help: "Owning dashboard user. One foundations row per user; shared across all projects.",
      }),
    )

    collection.listRule = '@request.auth.id != ""'
    collection.viewRule = '@request.auth.id != ""'
    collection.createRule =
      '@request.auth.role = "designer" && @request.body.owner = @request.auth.id'
    collection.updateRule =
      '@request.auth.role = "designer" && owner = @request.auth.id'
    collection.deleteRule =
      '@request.auth.role = "designer" && owner = @request.auth.id'
    collection.indexes = [
      "CREATE UNIQUE INDEX `idx_foundations_owner` ON `foundations` (`owner`)",
    ]

    app.save(collection)
  },
)
