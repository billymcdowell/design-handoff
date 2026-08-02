/// <reference path="../pb_data/types.d.ts" />
/**
 * Add global user roles (super | developer) and open list/view to all
 * authenticated users. Only supers can create/update/delete content.
 *
 * Existing users are promoted to "super" so current designers keep write access.
 * New users default to "developer" (set in Admin when creating accounts).
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users")

    users.fields.add(
      new SelectField({
        id: "sel_users_role",
        name: "role",
        required: false,
        maxSelect: 1,
        values: ["super", "developer"],
      }),
    )
    app.save(users)

    // Promote everyone who already exists so current owners keep write access.
    const existing = app.findAllRecords(users)
    for (const record of existing) {
      if (!record.getString("role")) {
        record.set("role", "super")
        app.save(record)
      }
    }

    // Lock role as required for new accounts (Admin must pick super | developer).
    const roleField = users.fields.getByName("role")
    roleField.required = true

    // Prevent self-escalation via the users API (Admin / manageRule still can).
    const baseUpdate = users.updateRule || 'id = @request.auth.id'
    users.updateRule =
      "(" +
      baseUpdate +
      ") && (@request.body.role:isset = false || @request.body.role = role)"

    app.save(users)

    const authed = '@request.auth.id != ""'
    const isSuper = '@request.auth.role = "super"'

    const projects = app.findCollectionByNameOrId("projects")
    projects.listRule = authed
    projects.viewRule = authed
    projects.createRule =
      isSuper + " && @request.body.owner = @request.auth.id"
    projects.updateRule = isSuper
    projects.deleteRule = isSuper
    app.save(projects)

    const frames = app.findCollectionByNameOrId("frames")
    frames.listRule = authed
    frames.viewRule = authed
    frames.createRule = isSuper
    frames.updateRule = isSuper
    frames.deleteRule = isSuper
    app.save(frames)

    const layers = app.findCollectionByNameOrId("layers")
    layers.listRule = authed
    layers.viewRule = authed
    layers.createRule = isSuper
    layers.updateRule = isSuper
    layers.deleteRule = isSuper
    app.save(layers)

    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.listRule = authed
    layerDetails.viewRule = authed
    layerDetails.createRule = isSuper
    layerDetails.updateRule = isSuper
    layerDetails.deleteRule = isSuper
    app.save(layerDetails)

    const foundations = app.findCollectionByNameOrId("foundations")
    foundations.listRule = authed
    foundations.viewRule = authed
    foundations.createRule =
      isSuper + " && @request.body.owner = @request.auth.id"
    foundations.updateRule = isSuper + " && owner = @request.auth.id"
    foundations.deleteRule = isSuper + " && owner = @request.auth.id"
    app.save(foundations)
  },
  (app) => {
    const ownerScoped = (ownerExpr) => {
      return {
        listRule: '@request.auth.id != "" && ' + ownerExpr,
        viewRule: '@request.auth.id != "" && ' + ownerExpr,
        createRule: '@request.auth.id != "" && ' + ownerExpr,
        updateRule: ownerExpr,
        deleteRule: ownerExpr,
      }
    }

    const projects = app.findCollectionByNameOrId("projects")
    projects.listRule = '@request.auth.id != "" && owner = @request.auth.id'
    projects.viewRule = '@request.auth.id != "" && owner = @request.auth.id'
    projects.createRule = '@request.auth.id != ""'
    projects.updateRule = "owner = @request.auth.id"
    projects.deleteRule = "owner = @request.auth.id"
    app.save(projects)

    const frameRules = ownerScoped("project.owner = @request.auth.id")
    const frames = app.findCollectionByNameOrId("frames")
    frames.listRule = frameRules.listRule
    frames.viewRule = frameRules.viewRule
    frames.createRule = frameRules.createRule
    frames.updateRule = frameRules.updateRule
    frames.deleteRule = frameRules.deleteRule
    app.save(frames)

    const layerRules = ownerScoped("frame.project.owner = @request.auth.id")
    const layers = app.findCollectionByNameOrId("layers")
    layers.listRule = layerRules.listRule
    layers.viewRule = layerRules.viewRule
    layers.createRule = layerRules.createRule
    layers.updateRule = layerRules.updateRule
    layers.deleteRule = layerRules.deleteRule
    app.save(layers)

    const detailRules = ownerScoped(
      "layer.frame.project.owner = @request.auth.id",
    )
    const layerDetails = app.findCollectionByNameOrId("layer_details")
    layerDetails.listRule = detailRules.listRule
    layerDetails.viewRule = detailRules.viewRule
    layerDetails.createRule = detailRules.createRule
    layerDetails.updateRule = detailRules.updateRule
    layerDetails.deleteRule = detailRules.deleteRule
    app.save(layerDetails)

    const foundations = app.findCollectionByNameOrId("foundations")
    foundations.listRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    foundations.viewRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    foundations.createRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    foundations.updateRule = "owner = @request.auth.id"
    foundations.deleteRule = "owner = @request.auth.id"
    app.save(foundations)

    const users = app.findCollectionByNameOrId("users")
    users.fields.removeByName("role")
    // Best-effort restore of a simple self-update rule.
    users.updateRule = "id = @request.auth.id"
    app.save(users)
  },
)
