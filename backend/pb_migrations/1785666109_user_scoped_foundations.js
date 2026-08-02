/// <reference path="../pb_data/types.d.ts" />
/**
 * Move foundations from 1:1-with-project to 1:1-with-user so every project
 * shares the same design-token set.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("project_foundations")
    const projectsCol = app.findCollectionByNameOrId("projects")

    // 1. Add owner relation; relax project so we can remap rows.
    collection.fields.add(
      new RelationField({
        name: "owner",
        required: false,
        maxSelect: 1,
        collectionId: "_pb_users_auth_",
        cascadeDelete: true,
      }),
    )
    const projectField = collection.fields.getByName("project")
    projectField.required = false
    collection.indexes = []
    app.save(collection)

    // 2. Copy project.owner → foundations.owner; keep one row per user.
    const foundations = app.findAllRecords(collection)
    /** @type {Record<string, core.Record>} */
    const keptByOwner = {}

    for (const f of foundations) {
      const projectId = f.getString("project")
      let ownerId = ""
      if (projectId) {
        try {
          const project = app.findRecordById(projectsCol, projectId)
          ownerId = project.getString("owner")
        } catch (_) {
          ownerId = ""
        }
      }

      if (!ownerId) {
        app.delete(f)
        continue
      }

      const existing = keptByOwner[ownerId]
      if (existing) {
        const preferNew =
          String(f.get("updated")) > String(existing.get("updated"))
        if (preferNew) {
          app.delete(existing)
          f.set("owner", ownerId)
          app.save(f)
          keptByOwner[ownerId] = f
        } else {
          app.delete(f)
        }
      } else {
        f.set("owner", ownerId)
        app.save(f)
        keptByOwner[ownerId] = f
      }
    }

    // 3. Drop project relation, rename collection, lock owner uniqueness + rules.
    collection.fields.removeByName("project")
    const ownerField = collection.fields.getByName("owner")
    ownerField.required = true
    collection.name = "foundations"
    collection.listRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    collection.viewRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    collection.createRule =
      '@request.auth.id != "" && owner = @request.auth.id'
    collection.updateRule = "owner = @request.auth.id"
    collection.deleteRule = "owner = @request.auth.id"
    collection.indexes = [
      "CREATE UNIQUE INDEX `idx_foundations_owner` ON `foundations` (`owner`)",
    ]
    app.save(collection)
  },
  (app) => {
    // Best-effort rollback: restore project-scoped collection shape.
    // Existing owner-scoped data cannot be mapped back to specific projects.
    const collection = app.findCollectionByNameOrId("foundations")
    collection.name = "project_foundations"
    collection.fields.removeByName("owner")
    collection.fields.add(
      new RelationField({
        name: "project",
        required: true,
        maxSelect: 1,
        collectionId: "projects0000001",
        cascadeDelete: true,
      }),
    )
    collection.listRule =
      '@request.auth.id != "" && project.owner = @request.auth.id'
    collection.viewRule =
      '@request.auth.id != "" && project.owner = @request.auth.id'
    collection.createRule =
      '@request.auth.id != "" && project.owner = @request.auth.id'
    collection.updateRule = "project.owner = @request.auth.id"
    collection.deleteRule = "project.owner = @request.auth.id"
    collection.indexes = [
      "CREATE UNIQUE INDEX `idx_project_foundations_project` ON `project_foundations` (`project`)",
    ]
    app.save(collection)
  },
)
