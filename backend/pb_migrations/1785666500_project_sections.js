/// <reference path="../pb_data/types.d.ts" />
/**
 * Add project sections so screens can be grouped inside a project.
 * - `sections` collection (project, name, sort_order)
 * - optional `frames.section` relation (cleared when section is deleted)
 */
migrate(
  (app) => {
    const authed = '@request.auth.id != ""'
    const isSuper = '@request.auth.role = "super"'

    const sections = new Collection({
      id: "sections00000001",
      name: "sections",
      type: "base",
      system: false,
      listRule: authed,
      viewRule: authed,
      createRule: isSuper,
      updateRule: isSuper,
      deleteRule: isSuper,
      fields: [
        {
          id: "rel_sections_project",
          name: "project",
          type: "relation",
          required: true,
          collectionId: "projects0000001",
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          id: "txt_sections_name",
          name: "name",
          type: "text",
          required: true,
          min: 1,
          presentable: true,
        },
        {
          id: "num_sections_sort_order",
          name: "sort_order",
          type: "number",
          required: false,
        },
      ],
      indexes: [
        "CREATE INDEX `idx_sections_project` ON `sections` (`project`)",
        "CREATE INDEX `idx_sections_project_sort` ON `sections` (`project`, `sort_order`)",
      ],
    })
    app.save(sections)

    const frames = app.findCollectionByNameOrId("frames")
    frames.fields.add(
      new RelationField({
        id: "rel_frames_section",
        name: "section",
        required: false,
        maxSelect: 1,
        collectionId: "sections00000001",
        cascadeDelete: false,
      }),
    )
    const indexes = Array.from(frames.indexes || [])
    if (!indexes.some((idx) => String(idx).includes("idx_frames_section"))) {
      indexes.push("CREATE INDEX `idx_frames_section` ON `frames` (`section`)")
      frames.indexes = indexes
    }
    app.save(frames)
  },
  (app) => {
    const frames = app.findCollectionByNameOrId("frames")
    try {
      frames.fields.removeById("rel_frames_section")
    } catch (_) {
      try {
        frames.fields.removeByName("section")
      } catch (__) {
        /* already gone */
      }
    }
    frames.indexes = Array.from(frames.indexes || []).filter(
      (idx) => !String(idx).includes("idx_frames_section"),
    )
    app.save(frames)

    try {
      app.delete(app.findCollectionByNameOrId("sections00000001"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("sections"))
      } catch (__) {
        /* already gone */
      }
    }
  },
)
