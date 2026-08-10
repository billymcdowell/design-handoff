/// <reference path="../pb_data/types.d.ts" />
/**
 * Figma instance/node ids (especially nested INSTANCE path ids like
 * `I1:2;3:4;5:6`) can exceed 64 chars. Batch layer creates were failing
 * validation on layers.figma_node_id. Raise the max on layers + library_components.
 */
migrate(
  (app) => {
    const layers = app.findCollectionByNameOrId("layers")
    const layerField = layers.fields.getByName("figma_node_id")
    layerField.max = 512
    layerField.help =
      "Raw Figma node id for deep links (may be long for nested instances)."
    app.save(layers)

    try {
      const libraryComponents = app.findCollectionByNameOrId("library_components")
      const libField = libraryComponents.fields.getByName("figma_node_id")
      libField.max = 512
      libField.help =
        "Raw Figma node id for deep links (may be long for nested instances)."
      app.save(libraryComponents)
    } catch (_) {
      // collection may not exist yet on partial deploys
    }
  },
  (app) => {
    const layers = app.findCollectionByNameOrId("layers")
    const layerField = layers.fields.getByName("figma_node_id")
    layerField.max = 64
    layerField.help = ""
    app.save(layers)

    try {
      const libraryComponents = app.findCollectionByNameOrId("library_components")
      const libField = libraryComponents.fields.getByName("figma_node_id")
      libField.max = 64
      libField.help = "Raw Figma node id for deep links."
      app.save(libraryComponents)
    } catch (_) {
      /* ignore */
    }
  },
)
