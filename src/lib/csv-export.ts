import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export async function shareCsv(
  fileName: string,
  headers: string[],
  rows: unknown[][],
) {
  if (!await Sharing.isAvailableAsync()) throw new Error('مشاركة الملفات غير متاحة على هذا الجهاز')
  const file = new File(Paths.cache, `${Date.now()}-${fileName}`)
  file.create()
  file.write(`\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`)
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'حفظ أو مشاركة التقرير',
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
  })
}
