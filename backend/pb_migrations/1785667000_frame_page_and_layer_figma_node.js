/// <reference path="../pb_data/types.d.ts" />
/**
 * - frames.page_name: Figma page the screen was published from
 * - layers.figma_node_id: raw Figma node id for deep links (Open in Figma)
 * - layer_details.component: component/instance identity + variants
 */
migrate(
  (app) => {
    const frames = app.findCollectionByNameOrId("frames")
    frames.fields.add(
      new TextField({
        id: "txt_frames_page_name",
        name: "page_name",
        required: false,
        presentable: false,
        min: 0,
        max: 255,
        pattern: "",
      }),
    )
    app.save(frames)

    const layers = app.findCollectionByNameOrId("layers")
    layers.fields.add(
      new TextField({
        id: "txt_layers_figma_node_id",
        name: "figma_node_id",
        required: false,
        presentable: false,
        min: 0,
        max: 64,
        pattern: "",
      }),
    )
    app.save(layers)

    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.fields.add(
      new JSONField({
        id: "json_layer_details_component",
        name: "component",
        required: false,
        presentable: false,
      }),
    )
    app.save(layerDetails)
  },
  (app) => {
    const frames = app.findCollectionByNameOrId("frames")
    frames.fields.removeById("txt_frames_page_name")
    app.save(frames)

    const layers = app.findCollectionByNameOrId("layers")
    layers.fields.removeById("txt_layers_figma_node_id")
    app.save(layers)

    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.fields.removeById("json_layer_details_component")
    app.save(layerDetails)
  },
)
