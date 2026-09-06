/**
 * Narrow read capability over the migrated `media_inventory` D1 table.
 * Legacy (migration-produced) keys resolve only through this inventory:
 * prefix matching alone would serve any syntactically valid legacy key,
 * including keys that were never migrated. Feature modules receive this
 * store — never the raw D1 binding.
 */
export interface MediaInventoryRecord {
  readonly sha256: string;
  readonly byteSize: number;
  readonly contentType: string;
}

export interface MediaInventoryStore {
  getByObjectKey(objectKey: string): Promise<MediaInventoryRecord | null>;
  /**
   * Bulk inventory lookup for publication assembly: one bounded query per
   * 100-key chunk instead of one D1 read per media reference.
   */
  getManyByObjectKeys(objectKeys: string[]): Promise<Map<string, MediaInventoryRecord>>;
}

export function d1MediaInventoryStore(db: D1Database): MediaInventoryStore {
  return {
    async getByObjectKey(objectKey) {
      const row = await db.prepare(
        "SELECT sha256, byte_size AS byteSize, content_type AS contentType FROM media_inventory WHERE object_key = ?"
      ).bind(objectKey).first<{ sha256: string; byteSize: number; contentType: string }>();
      return row ?? null;
    },
    async getManyByObjectKeys(objectKeys) {
      const found = new Map<string, MediaInventoryRecord>();
      for (let offset = 0; offset < objectKeys.length; offset += 100) {
        const chunk = objectKeys.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await db.prepare(
          `SELECT object_key AS objectKey, sha256, byte_size AS byteSize, content_type AS contentType FROM media_inventory WHERE object_key IN (${placeholders})`
        ).bind(...chunk).all<{ objectKey: string; sha256: string; byteSize: number; contentType: string }>();
        for (const row of result.results ?? []) {
          found.set(row.objectKey, { sha256: row.sha256, byteSize: row.byteSize, contentType: row.contentType });
        }
      }
      return found;
    },
  };
}
