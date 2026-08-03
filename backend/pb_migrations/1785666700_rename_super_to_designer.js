/// <reference path="../pb_data/types.d.ts" />
/**
 * Rename users.role value "super" → "designer" and update all write API rules.
 *
 * Designers publish via the Figma plugin / manage in the web app.
 * Developers remain read-only.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users")
    const roleField = users.fields.getByName("role")
    roleField.values = ["designer", "developer"]
    app.save(users)

    const existing = app.findAllRecords(users)
    for (const record of existing) {
      if (record.getString("role") === "super") {
        record.set("role", "designer")
        app.save(record)
      }
    }

    const isDesigner = '@request.auth.role = "designer"'
    const authed = '@request.auth.id != ""'

    const projects = app.findCollectionByNameOrId("projects")
    projects.listRule = authed
    projects.viewRule = authed
    projects.createRule =
      isDesigner + " && @request.body.owner = @request.auth.id"
    projects.updateRule = isDesigner
    projects.deleteRule = isDesigner
    app.save(projects)

    const sections = app.findCollectionByNameOrId("sections")
    sections.listRule = authed
    sections.viewRule = authed
    sections.createRule = isDesigner
    sections.updateRule = isDesigner
    sections.deleteRule = isDesigner
    app.save(sections)

    const frames = app.findCollectionByNameOrId("frames")
    frames.listRule = authed
    frames.viewRule = authed
    frames.createRule = isDesigner
    frames.updateRule = isDesigner
    frames.deleteRule = isDesigner
    app.save(frames)

    const layers = app.findCollectionByNameOrId("layers")
    layers.listRule = authed
    layers.viewRule = authed
    layers.createRule = isDesigner
    layers.updateRule = isDesigner
    layers.deleteRule = isDesigner
    app.save(layers)

    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.listRule = authed
    layerDetails.viewRule = authed
    layerDetails.createRule = isDesigner
    layerDetails.updateRule = isDesigner
    layerDetails.deleteRule = isDesigner
    app.save(layerDetails)

    const foundations = app.findCollectionByNameOrId("foundations")
    foundations.listRule = authed
    foundations.viewRule = authed
    foundations.createRule =
      isDesigner + " && @request.body.owner = @request.auth.id"
    foundations.updateRule = isDesigner + " && owner = @request.auth.id"
    foundations.deleteRule = isDesigner + " && owner = @request.auth.id"
    app.save(foundations)
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users")
    const roleField = users.fields.getByName("role")
    roleField.values = ["super", "developer"]
    app.save(users)

    const existing = app.findAllRecords(users)
    for (const record of existing) {
      if (record.getString("role") === "designer") {
        record.set("role", "super")
        app.save(record)
      }
    }

    const isSuper = '@request.auth.role = "super"'
    const authed = '@request.auth.id != ""'

    const projects = app.findCollectionByNameOrId("projects")
    projects.createRule =
      isSuper + " && @request.body.owner = @request.auth.id"
    projects.updateRule = isSuper
    projects.deleteRule = isSuper
    app.save(projects)

    const sections = app.findCollectionByNameOrId("sections")
    sections.createRule = isSuper
    sections.updateRule = isSuper
    sections.deleteRule = isSuper
    app.save(sections)

    const frames = app.findCollectionByNameOrId("frames")
    frames.createRule = isSuper
    frames.updateRule = isSuper
    frames.deleteRule = isSuper
    app.save(frames)

    const layers = app.findCollectionByNameOrId("layers")
    layers.createRule = isSuper
    layers.updateRule = isSuper
    layers.deleteRule = isSuper
    app.save(layers)

    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.createRule = isSuper
    layerDetails.updateRule = isSuper
    layerDetails.deleteRule = isSuper
    app.save(layerDetails)

    const foundations = app.findCollectionByNameOrId("foundations")
    foundations.createRule =
      isSuper + " && @request.body.owner = @request.auth.id"
    foundations.updateRule = isSuper + " && owner = @request.auth.id"
    foundations.deleteRule = isSuper + " && owner = @request.auth.id"
    app.save(foundations)
  },
)
