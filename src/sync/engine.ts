import type { SQLiteDatabase } from 'expo-sqlite'

import { api } from '../lib/api'
import {
  acceptMutationResult,
  applyBootstrap,
  outboxForTahfiz,
} from '../db/database'

export interface SyncSummary {
  pushed: number
  conflicts: number
  rejected: number
  cursor: number
}

export async function syncTahfiz(db: SQLiteDatabase, tahfizId: number): Promise<SyncSummary> {
  const pending = await outboxForTahfiz(db, tahfizId)
  let conflicts = 0
  let rejected = 0
  let cursor = 0
  if (pending.length) {
    const response = await api.pushMutations(tahfizId, pending.map((mutation) => ({
      mutation_id: mutation.mutation_id,
      device_id: mutation.device_id,
      entity_type: mutation.entity_type,
      entity_key: mutation.entity_key,
      base_revision: mutation.base_revision,
      values: mutation.values,
      client_changed_at: mutation.client_changed_at,
    })))
    cursor = response.cursor
    for (const result of response.results) {
      const mutation = pending.find((item) => item.mutation_id === result.mutation_id)
      if (!mutation) continue
      await acceptMutationResult(db, mutation, result)
      if (result.status === 'conflict') conflicts += 1
      if (result.status === 'rejected') rejected += 1
    }
  }

  // Bootstrap is intentionally authoritative and bounded to 90 days. It also
  // repairs missed cursors after long offline periods or a restored backup.
  const snapshot = await api.bootstrap(tahfizId)
  await applyBootstrap(db, snapshot)
  cursor = snapshot.cursor
  return { pushed: pending.length, conflicts, rejected, cursor }
}
