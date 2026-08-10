/// <reference path="../pb_data/types.d.ts" />
/**
 * Component catalog: page grouping, hidden flag, per-variant previews + inspect data.
 * - library_components.page_name / .hidden
 * - library_component_variants: one row per variant with preview + layers JSON
 */
migrate(
  (app) => {
    const authed = '@request.auth.id != ""'
    const designer = '@request.auth.role = "designer"'

    const libraryComponents = app.findCollectionByNameOrId("libcomponents001")
    libraryComponents.fields.add(
      new TextField({
        id: "txt_libcomp_page_name",
        name: "page_name",
        required: false,
        presentable: false,
        min: 0,
        max: 255,
        pattern: "",
      }),
    )
    libraryComponents.fields.add(
      new BoolField({
        id: "bool_libcomp_hidden",
        name: "hidden",
        required: false,
        presentable: false,
      }),
    )
    app.save(libraryComponents)

    const variants = new Collection({
      id: "libcompvariants01",
      name: "library_component_variants",
      type: "base",
      system: false,
      listRule: authed,
      viewRule: authed,
      createRule: designer,
      updateRule: designer,
      deleteRule: designer,
      fields: [
        {
          id: "rel_libcompvar_component",
          name: "library_component",
          type: "relation",
          required: true,
          collectionId: "libcomponents001",
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          id: "txt_libcompvar_key",
          name: "key",
          type: "text",
          required: true,
          presentable: true,
          min: 1,
          max: 128,
          help: "Figma variant / standalone component key.",
        },
        {
          id: "txt_libcompvar_name",
          name: "name",
          type: "text",
          required: true,
          presentable: true,
          min: 1,
          max: 255,
        },
        {
          id: "json_libcompvar_properties",
          name: "properties",
          type: "json",
          required: false,
          maxSize: 200000,
          help: "Variant property map from Figma (e.g. Size=md).",
        },
        {
          id: "txt_libcompvar_figma_node_id",
          name: "figma_node_id",
          type: "text",
          required: false,
          max: 512,
        },
        {
          id: "bool_libcompvar_is_default",
          name: "is_default",
          type: "bool",
          required: false,
        },
        {
          id: "file_libcompvar_preview",
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
          id: "num_libcompvar_width",
          name: "width",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        {
          id: "num_libcompvar_height",
          name: "height",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        {
          id: "json_libcompvar_layers",
          name: "layers",
          type: "json",
          required: false,
          maxSize: 20000000,
          help: "Flattened overlay layers (frame-relative geometry).",
        },
        {
          id: "json_libcompvar_layer_details",
          name: "layer_details",
          type: "json",
          required: false,
          maxSize: 20000000,
          help: "Map of figma node id → layout/styles/typography/code/component.",
        },
        {
          id: "txt_libcompvar_content_hash",
          name: "content_hash",
          type: "text",
          required: false,
          max: 128,
        },
      ],
      indexes: [
        "CREATE INDEX `idx_libcompvar_component` ON `library_component_variants` (`library_component`)",
        "CREATE UNIQUE INDEX `idx_libcompvar_component_key` ON `library_component_variants` (`library_component`, `key`)",
      ],
    })
    app.save(variants)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("libcompvariants01"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("library_component_variants"))
      } catch (__) {
        /* already gone */
      }
    }

    try {
      const libraryComponents = app.findCollectionByNameOrId("libcomponents001")
      libraryComponents.fields.removeById("txt_libcomp_page_name")
      libraryComponents.fields.removeById("bool_libcomp_hidden")
      app.save(libraryComponents)
    } catch (_) {
      /* collection may already be gone */
    }
  },
)
