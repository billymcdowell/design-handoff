/// <reference path="../pb_data/types.d.ts" />
/**
 * Product feedback about Design Handoff itself.
 * Any authenticated user can create; only PocketBase Admin can list/view/update/delete.
 *
 * Note: do not index autodate columns here unless they are declared as fields —
 * PocketBase applies indexes before auto-injecting created/updated.
 */
migrate(
  (app) => {
    const authed = '@request.auth.id != ""'
    // Regular users must author as themselves; Admins may use a linked users id
    // (and also bypass rules entirely when authenticated as _superusers).
    const createOk =
      '(@request.body.author = @request.auth.id || @request.auth.collectionName = "_superusers")'

    const feedback = new Collection({
      id: "feedback00000001",
      name: "feedback",
      type: "base",
      system: false,
      // null = Admin only (API rules bypassed for _superusers)
      listRule: null,
      viewRule: null,
      createRule: authed + " && " + createOk,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          id: "rel_feedback_author",
          name: "author",
          type: "relation",
          required: true,
          collectionId: "_pb_users_auth_",
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          id: "sel_feedback_type",
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["bug", "idea", "ux"],
        },
        {
          id: "txt_feedback_message",
          name: "message",
          type: "text",
          required: true,
          min: 1,
          max: 5000,
          presentable: true,
        },
        {
          id: "txt_feedback_page",
          name: "page",
          type: "text",
          required: false,
          max: 2000,
          help: "URL or path where feedback was submitted",
        },
      ],
      indexes: [
        "CREATE INDEX `idx_feedback_author` ON `feedback` (`author`)",
      ],
    })
    app.save(feedback)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("feedback00000001"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("feedback"))
      } catch (__) {
        /* already gone */
      }
    }
  },
)
