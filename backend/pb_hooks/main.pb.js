/// <reference path="../pb_data/types.d.ts" />

// New users (e.g. via Microsoft OAuth2, which only maps name/email/avatar)
// default to the "developer" role when none is set. Admins promote designers
// manually in PocketBase Admin — OAuth can never self-escalate.
onRecordCreate((e) => {
  if (!e.record.get("role")) {
    e.record.set("role", "developer")
  }
  e.next()
}, "users")

// oauth_sessions: never accept a token on create (plugin only opens an empty
// relay). Prevents planting a forged JWT without completing Microsoft login.
onRecordCreate((e) => {
  e.record.set("token", "")
  e.next()
}, "oauth_sessions")

// oauth_sessions: single-use — reject updates once a token is already set.
onRecordUpdate((e) => {
  const previous = e.record.originalCopy()
  if (previous && previous.getString("token")) {
    throw new BadRequestError("OAuth session already consumed.")
  }
  e.next()
}, "oauth_sessions")

// Expire abandoned oauth_sessions (~5 min TTL). Runs every minute.
cronAdd("cleanup_oauth_sessions", "* * * * *", () => {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace("T", " ")
  try {
    const records = $app.findRecordsByFilter(
      "oauth_sessions",
      "created < {:cutoff}",
      "",
      200,
      0,
      { cutoff },
    )
    for (const record of records) {
      try {
        $app.delete(record)
      } catch (_) {
        /* ignore per-record failures */
      }
    }
  } catch (_) {
    /* collection may not exist yet during first boot */
  }
})

// Serve the Vite build from pb_public. The second arg enables index.html
// fallback so React Router client routes (e.g. /projects/:id, /oauth/callback)
// work on refresh.
//
// Important: a custom catch-all that only calls e.next() for dotted paths
// intercepts PocketBase's built-in static handler and returns empty 200s
// (no Content-Type) for JS/CSS — which browsers reject as MIME failures.
routerAdd("GET", "/{path...}", $apis.static(`${__hooks}/../pb_public`, true))
