import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

import { openEncryptedDatabase } from '../db/database'
import { getActiveTahfiz, getSavedUser } from '../lib/session-store'
import { syncTahfiz } from './engine'

const BACKGROUND_SYNC_TASK = 'zamzam-background-sync-v1'

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const user = await getSavedUser()
  if (!user) return BackgroundTask.BackgroundTaskResult.Success
  const db = await openEncryptedDatabase()
  try {
    const membershipIds = user.memberships
      .filter((membership) => membership.tahfiz_status === 'active')
      .map((membership) => membership.tahfiz_id)
    const activeTahfiz = await getActiveTahfiz()
    const tahfizIds = membershipIds.length
      ? membershipIds
      : user.global_role === 'super_admin' && activeTahfiz
        ? [activeTahfiz]
        : []
    for (const tahfizId of tahfizIds) await syncTahfiz(db, tahfizId)
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  } finally {
    await db.closeAsync()
  }
})

export async function setBackgroundSyncEnabled(enabled: boolean) {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)
  if (enabled && !registered) {
    const status = await BackgroundTask.getStatusAsync()
    if (status === BackgroundTask.BackgroundTaskStatus.Available) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 60 })
    }
  } else if (!enabled && registered) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK)
  }
}
