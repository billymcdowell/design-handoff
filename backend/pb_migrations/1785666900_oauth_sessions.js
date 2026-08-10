/// <reference path="../pb_data/types.d.ts" />
/**
 * Short-lived OAuth relay for the Figma plugin.
 *
 * The plugin cannot receive an OAuth redirect, so the web app completes
 * Microsoft login and writes the PocketBase JWT into a one-time session
 * record. Knowledge of the random record id is the capability token
 * (device-flow style): short TTL, single-use, never populated before the
 * OAuth exchange finishes.
 *
 * Rules:
 * - create / view / delete: public (guest) — plugin has no auth yet
 * - list: Admin only — prevents enumerating sessions/tokens
 * - update: authenticated only — callback writes the JWT after Microsoft login
 */
migrate(
  (app) => {
    const oauthSessions = new Collection({
      id: "oauthsessions0001",
      name: "oauth_sessions",
      type: "base",
      system: false,
      listRule: null,
      viewRule: "",
      createRule: "",
      updateRule: '@request.auth.id != ""',
      deleteRule: "",
      fields: [
        {
          id: "txt_oauth_sessions_token",
          name: "token",
          type: "text",
          required: false,
          min: 0,
          max: 4096,
          presentable: false,
          help: "PocketBase JWT written by /oauth/callback; empty until login completes",
        },
      ],
      indexes: [],
    })
    app.save(oauthSessions)

    // Allow client-supplied capability ids longer than the default 15 chars.
    const col = app.findCollectionByNameOrId("oauthsessions0001")
    const idField = col.fields.getByName("id")
    if (idField) {
      idField.min = 15
      idField.max = 64
    }
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("oauthsessions0001"))
    } catch (_) {
      try {
        app.delete(app.findCollectionByNameOrId("oauth_sessions"))
      } catch (__) {
        /* already gone */
      }
    }
  },
)
