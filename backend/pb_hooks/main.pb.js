/// <reference path="../pb_data/types.d.ts" />

// SPA fallback: serve the built index.html for any non-API, non-file route so
// React Router's client-side routes (e.g. /projects/:id) work on refresh.
routerAdd("GET", "/{path...}", (e) => {
  const p = e.request.url.path

  // Let the API and any request for a real file (has a dot) fall through to
  // PocketBase's own static file serving.
  if (p.startsWith("/api/") || p.startsWith("/_/") || p.includes(".")) {
    return e.next()
  }

  return e.fileFS($os.dirFS(`${__hooks}/../pb_public`), "index.html")
})
