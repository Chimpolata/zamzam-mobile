import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

import { API_BASE, api } from './api'
import { getAccessToken } from './session-store'

export async function shareDatabaseExport({
  path,
  fileName,
  tahfizId,
}: {
  path: '/tahfiz/export-db' | '/export-db'
  fileName: string
  tahfizId?: number
}) {
  // Refresh an expired access token before the native downloader takes over.
  await api.me(tahfizId)
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('انتهت جلسة الدخول')
  if (!await Sharing.isAvailableAsync()) throw new Error('مشاركة الملفات غير متاحة على هذا الجهاز')

  const destination = new File(Paths.cache, `${Date.now()}-${fileName}`)
  const downloaded = await File.downloadFileAsync(`${API_BASE}${path}`, destination, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(tahfizId ? { 'X-Tahfiz-ID': String(tahfizId) } : {}),
    },
  })
  await Sharing.shareAsync(downloaded.uri, {
    dialogTitle: 'حفظ أو مشاركة نسخة قاعدة البيانات',
    mimeType: 'application/vnd.sqlite3',
    UTI: 'public.database',
  })
}
