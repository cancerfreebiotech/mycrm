// Recursive storage listing helper.
// Supabase Storage SDK's list(prefix) returns items at that level only —
// folders show up as items with metadata === null. To get every file we
// walk recursively.

const PAGE_LIMIT = 1000

export async function listAllRecursive(client, bucket, prefix = '') {
  const out = []
  let offset = 0
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: PAGE_LIMIT,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('Bucket not found')) return null
      throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name
      if (!item.metadata && !item.id) {
        // Folder — recurse
        const nested = await listAllRecursive(client, bucket, fullPath)
        if (nested) out.push(...nested)
      } else {
        out.push({
          name: fullPath,
          size: item.metadata?.size ?? 0,
          mimetype: item.metadata?.mimetype ?? 'application/octet-stream',
          updated_at: item.updated_at,
        })
      }
    }
    if (data.length < PAGE_LIMIT) break
    offset += data.length
  }
  return out
}
