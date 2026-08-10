/// <reference path="../pb_data/types.d.ts" />
/**
 * Components library catalog (org singleton meta + per-component rows with previews).
 * - component_libraries: slug=default meta (sources + history)
 * - library_components: one row per synced COMPONENT / COMPONENT_SET
 */
migrate(
  (app) => {
    const authed = '@request.auth.id != ""'
    const designer = '@request.auth.role = "designer"'

    const componentLibraries = new Collection({
      id: "complibraries001",
      name: "component_libraries",
      type: "base",
      system: false,
      listRule: authed,
      viewRule: authed,
      createRule: designer + ' && @request.body.slug = "default"',
      updateRule: designer,
      deleteRule: designer,
      fields: [
        {
          id: "txt_complib_slug",
          name: "slug",
          type: "text",
          required: true,
          presentable: true,
          min: 1,
          max: 64,
          pattern: "^[a-z0-9_-]+$",
          help: 'Singleton key. Always "default" for this single-tenant deploy.',
        },
        {
          id: "json_complib_data",
          name: "data",
          type: "json",
          required: true,
          maxSize: 20000000,
          help: "sources[fileKey].componentKeys + history. Sync replaces one file slice.",
        },
        {
          id: "num_complib_components_count",
          name: "components_count",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
          help: "Total library_components rows across all sources.",
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_component_libraries_slug` ON `component_libraries` (`slug`)",
      ],
    })
    app.save(componentLibraries)

    const libraryComponents = new Collection({
      id: "libcomponents001",
      name: "library_components",
      type: "base",
      system: false,
      listRule: authed,
      viewRule: authed,
      createRule: designer,
      updateRule: designer,
      deleteRule: designer,
      fields: [
        {
          id: "txt_libcomp_key",
          name: "key",
          type: "text",
          required: true,
          presentable: true,
          min: 1,
          max: 128,
          help: "Figma componentKey (set key or standalone main key).",
        },
        {
          id: "txt_libcomp_name",
          name: "name",
          type: "text",
          required: true,
          presentable: true,
          min: 1,
          max: 255,
        },
        {
          id: "sel_libcomp_kind",
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["COMPONENT", "COMPONENT_SET"],
        },
        {
          id: "txt_libcomp_file_key",
          name: "file_key",
          type: "text",
          required: true,
          min: 1,
          max: 128,
        },
        {
          id: "txt_libcomp_file_name",
          name: "file_name",
          type: "text",
          required: true,
          min: 1,
          max: 255,
        },
        {
          id: "txt_libcomp_figma_node_id",
          name: "figma_node_id",
          type: "text",
          required: false,
          max: 64,
          help: "Raw Figma node id for deep links.",
        },
        {
          id: "file_libcomp_preview",
          name: "preview",
          type: "file",
          required: false,
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml",
          ],
          protected: false,
        },
        {
          id: "json_libcomp_variants",
          name: "variants",
          type: "json",
          required: false,
          maxSize: 2000000,
          help: "Variant entries: key, name, properties, figma_node_id.",
        },
        {
          id: "json_libcomp_tokens_used",
          name: "tokens_used",
          type: "json",
          required: false,
          maxSize: 2000000,
          help: "Bound variable/style refs {id,name} from the component tree.",
        },
        {
          id: "txt_libcomp_description",
          name: "description",
          type: "text",
          required: false,
          max: 5000,
          help: "Figma description (editable docs later).",
        },
        {
          id: "txt_libcomp_content_hash",
          name: "content_hash",
          type: "text",
          required: false,
          max: 128,
          help: "Fingerprint to skip no-op sync upserts.",
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_library_components_key` ON `library_components` (`key`)",
        "CREATE INDEX `idx_library_components_file_key` ON `library_components` (`file_key`)",
        "CREATE INDEX `idx_library_components_name` ON `library_components` (`name`)",
      ],
    })
    app.save(libraryComponents)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("libcomponents001"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("library_components"))
      } catch (__) {
        /* already gone */
      }
    }
    try {
      app.delete(app.findCollectionByNameOrId("complibraries001"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("component_libraries"))
      } catch (__) {
        /* already gone */
      }
    }
  },
)
