/// <reference path="../pb_data/types.d.ts" />
/**
 * Enable PocketBase Batch Web API for the plugin publish path.
 * Layers / layer_details are written in chunks of ≤50 JSON creates;
 * frame PNG uploads stay as individual multipart POSTs (not batched).
 *
 * Tuning notes (Dashboard → Settings → Application → Batch):
 * - maxRequests 50  — matches plugin chunk size
 * - timeout 30s     — JSON layer batches can be large; 3s default is too tight
 * - maxBodySize 0   — fall back to ~128MB (frame images are NOT sent via batch)
 */
migrate(
  (app) => {
    const settings = app.settings()
    settings.batch.enabled = true
    settings.batch.maxRequests = 50
    settings.batch.timeout = 30
    settings.batch.maxBodySize = 0
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.batch.enabled = false
    settings.batch.maxRequests = 50
    settings.batch.timeout = 3
    settings.batch.maxBodySize = 0
    app.save(settings)
  },
)
