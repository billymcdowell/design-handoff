/// <reference path="../pb_data/types.d.ts" />

// Serve the Vite build from pb_public. The second arg enables index.html
// fallback so React Router client routes (e.g. /projects/:id) work on refresh.
//
// Important: a custom catch-all that only calls e.next() for dotted paths
// intercepts PocketBase's built-in static handler and returns empty 200s
// (no Content-Type) for JS/CSS — which browsers reject as MIME failures.
routerAdd("GET", "/{path...}", $apis.static(`${__hooks}/../pb_public`, true))
