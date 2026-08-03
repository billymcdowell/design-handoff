/// <reference path="../pb_data/types.d.ts" />
/**
 * Add frames.content_hash so the plugin can skip uploading an unchanged
 * screen (same project + name) instead of creating a duplicate version.
 */
migrate(
  (app) => {
    const frames = app.findCollectionByNameOrId("frames")
    frames.fields.add(
      new TextField({
        id: "txt_frames_content_hash",
        name: "content_hash",
        required: false,
        presentable: false,
        min: 0,
        max: 128,
        pattern: "",
      }),
    )
    app.save(frames)
  },
  (app) => {
    const frames = app.findCollectionByNameOrId("frames")
    frames.fields.removeById("txt_frames_content_hash")
    app.save(frames)
  },
)
