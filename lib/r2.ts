/**
 * Cloudflare R2 helpers for the Next.js app (server-side only).
 *
 * Screenshots moved off Supabase Storage — the free plan's 1 GB cap was
 * exhausted by uncompressed full-page PNGs. The crawler writes objects under
 * `${auditId}/`; this module removes them when an audit is deleted, which the
 * old code never did (audit rows were deleted but files were orphaned forever).
 *
 * Uses the native R2 binding rather than the S3 API: the app runs on Cloudflare
 * Workers, where @aws-sdk/client-s3 fails at request time, and the binding also
 * means no R2 credentials need to exist in the Worker at all. The binding is
 * declared as `SCREENSHOTS` in wrangler.jsonc. The crawler still uses S3, since
 * it runs on a plain VPS.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

/** Minimal structural type for the R2 binding, to avoid a types dependency. */
type R2Listed = {
  objects: { key: string }[]
  truncated: boolean
  cursor?: string
}
type R2BucketLike = {
  list(opts: { prefix?: string; cursor?: string; limit?: number }): Promise<R2Listed>
  delete(keys: string | string[]): Promise<void>
}

function getBucket(): R2BucketLike | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>
    return (env.SCREENSHOTS as R2BucketLike) ?? null
  } catch {
    return null
  }
}

export function isR2Configured(): boolean {
  return getBucket() !== null
}

/**
 * Audit ids are Postgres uuids. This is enforced rather than assumed because
 * the value becomes an object-key prefix: an empty or wildcard-ish auditId
 * would match every object in the bucket and delete the lot.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidAuditId(auditId: unknown): auditId is string {
  return typeof auditId === 'string' && UUID_RE.test(auditId)
}

/** R2 delete accepts at most 1000 keys per call. */
const DELETE_BATCH = 1000

/**
 * Delete every screenshot belonging to one audit.
 * Returns the number of objects removed.
 */
export async function deleteAuditScreenshots(auditId: string): Promise<number> {
  if (!isValidAuditId(auditId)) {
    throw new Error('Refusing to delete: auditId is not a valid uuid')
  }

  const bucket = getBucket()
  if (!bucket) throw new Error('R2 binding SCREENSHOTS is not available')

  const prefix = `${auditId}/`
  let deleted = 0
  let cursor: string | undefined

  do {
    const listed = await bucket.list({ prefix, cursor })
    const keys = listed.objects
      .map(o => o.key)
      .filter(k => typeof k === 'string' && k.startsWith(prefix))

    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH)
      await bucket.delete(batch)
      deleted += batch.length
    }

    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  return deleted
}
