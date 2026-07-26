import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'

import type {
  Attendance,
  Bootstrap,
  OutboxMutation,
  QuranProgress,
  Session,
  Student,
  SyncConflict,
} from '../types'

const DB_KEY_NAME = 'zamzam.db.key.v1'
const DATABASE_VERSION = 4

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_NAME)
  if (existing) return existing
  const bytes = await Crypto.getRandomBytesAsync(32)
  const key = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  await SecureStore.setItemAsync(DB_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  return key
}

export async function encryptedDatabaseName() {
  const key = await databaseKey()
  return `zamzam-mobile-${key.slice(0, 16)}.db`
}

async function newDatabaseKey() {
  const bytes = await Crypto.getRandomBytesAsync(32)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function migrateDatabase(db: SQLiteDatabase) {
  const key = await databaseKey()
  await db.execAsync(`PRAGMA key = "x'${key}'"`)
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  if ((row?.user_version ?? 0) >= DATABASE_VERSION) return
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tahfiz (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      attendance_statuses TEXT NOT NULL,
      attendance_status_colors TEXT NOT NULL DEFAULT '{}',
      excused_absence_streak_limit INTEGER NOT NULL DEFAULT 3,
      excused_absence_reset_statuses TEXT NOT NULL DEFAULT '["حاضر"]',
      attendance_streak_alert_enabled INTEGER NOT NULL DEFAULT 1,
      attendance_sheikh_selection_enabled INTEGER NOT NULL DEFAULT 1,
      attendance_streak_status TEXT NOT NULL DEFAULT 'غياب بعذر',
      progress_tracking_enabled INTEGER NOT NULL DEFAULT 0,
      week_start_day INTEGER NOT NULL DEFAULT 6,
      month_start_day INTEGER NOT NULL DEFAULT 1,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sheikhs (
      id INTEGER PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_mobile_sheikhs_tahfiz ON sheikhs(tahfiz_id);
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      student_code TEXT,
      birthday TEXT,
      registration_date TEXT,
      profile_pic TEXT,
      status TEXT NOT NULL,
      sheikh_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_mobile_students_tahfiz_sheikh ON students(tahfiz_id, sheikh_id, sort_order);
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0,
      reopened_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_mobile_sessions_tahfiz_date ON sessions(tahfiz_id, date);
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      sheikh_id INTEGER,
      status TEXT NOT NULL,
      notes TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0,
      UNIQUE(session_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS ix_mobile_attendance_session ON attendance(session_id, student_id);
    CREATE TABLE IF NOT EXISTS quran_progress (
      id INTEGER PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      sheikh_id INTEGER,
      category TEXT NOT NULL,
      range_type TEXT NOT NULL,
      from_surah INTEGER,
      from_ayah INTEGER,
      to_surah INTEGER,
      to_ayah INTEGER,
      from_page INTEGER,
      to_page INTEGER,
      quality_score INTEGER NOT NULL,
      mistakes INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      next_assignment TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0,
      UNIQUE(session_id, student_id, category)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      mutation_id TEXT PRIMARY KEY NOT NULL,
      tahfiz_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      base_revision INTEGER NOT NULL,
      values_json TEXT NOT NULL,
      client_changed_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      UNIQUE(tahfiz_id, entity_type, entity_key)
    );
    CREATE INDEX IF NOT EXISTS ix_mobile_outbox_tahfiz ON outbox(tahfiz_id, client_changed_at);
    CREATE TABLE IF NOT EXISTS conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tahfiz_id INTEGER NOT NULL,
      mutation_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      code TEXT NOT NULL,
      local_json TEXT NOT NULL,
      server_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tahfiz_id, mutation_id)
    );
  `)
  const tahfizColumns = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(tahfiz)')).map(column => column.name))
  if (!tahfizColumns.has('excused_absence_streak_limit')) {
    await db.execAsync('ALTER TABLE tahfiz ADD COLUMN excused_absence_streak_limit INTEGER NOT NULL DEFAULT 3')
  }
  if (!tahfizColumns.has('attendance_status_colors')) {
    await db.execAsync(`ALTER TABLE tahfiz ADD COLUMN attendance_status_colors TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!tahfizColumns.has('excused_absence_reset_statuses')) {
    await db.execAsync(`ALTER TABLE tahfiz ADD COLUMN excused_absence_reset_statuses TEXT NOT NULL DEFAULT '["حاضر"]'`)
  }
  if (!tahfizColumns.has('attendance_streak_alert_enabled')) {
    await db.execAsync('ALTER TABLE tahfiz ADD COLUMN attendance_streak_alert_enabled INTEGER NOT NULL DEFAULT 1')
  }
  if (!tahfizColumns.has('attendance_sheikh_selection_enabled')) {
    await db.execAsync('ALTER TABLE tahfiz ADD COLUMN attendance_sheikh_selection_enabled INTEGER NOT NULL DEFAULT 1')
  }
  if (!tahfizColumns.has('attendance_streak_status')) {
    await db.execAsync(`ALTER TABLE tahfiz ADD COLUMN attendance_streak_status TEXT NOT NULL DEFAULT 'غياب بعذر'`)
  }
  const studentColumns = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(students)')).map(column => column.name))
  if (!studentColumns.has('student_code')) await db.execAsync('ALTER TABLE students ADD COLUMN student_code TEXT')
  if (!studentColumns.has('birthday')) await db.execAsync('ALTER TABLE students ADD COLUMN birthday TEXT')
  if (!studentColumns.has('registration_date')) await db.execAsync('ALTER TABLE students ADD COLUMN registration_date TEXT')
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
}

export async function openEncryptedDatabase() {
  const db = await SQLite.openDatabaseAsync(await encryptedDatabaseName())
  await migrateDatabase(db)
  return db
}

export async function applyBootstrap(db: SQLiteDatabase, data: Bootstrap) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO tahfiz
       (id, name, attendance_statuses, attendance_status_colors, excused_absence_streak_limit, excused_absence_reset_statuses, attendance_streak_alert_enabled, attendance_sheikh_selection_enabled, attendance_streak_status, progress_tracking_enabled, week_start_day, month_start_day, cursor, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, attendance_statuses=excluded.attendance_statuses,
         attendance_status_colors=excluded.attendance_status_colors,
         excused_absence_streak_limit=excluded.excused_absence_streak_limit,
         excused_absence_reset_statuses=excluded.excused_absence_reset_statuses,
         attendance_streak_alert_enabled=excluded.attendance_streak_alert_enabled,
         attendance_sheikh_selection_enabled=excluded.attendance_sheikh_selection_enabled,
         attendance_streak_status=excluded.attendance_streak_status,
         progress_tracking_enabled=excluded.progress_tracking_enabled,
         week_start_day=excluded.week_start_day, month_start_day=excluded.month_start_day,
         cursor=excluded.cursor, last_synced_at=excluded.last_synced_at`,
      data.tahfiz.id,
      data.tahfiz.name,
      JSON.stringify(data.tahfiz.attendance_statuses),
      JSON.stringify(data.tahfiz.attendance_status_colors),
      data.tahfiz.attendance_streak_limit ?? data.tahfiz.excused_absence_streak_limit,
      JSON.stringify(data.tahfiz.attendance_streak_reset_statuses ?? data.tahfiz.excused_absence_reset_statuses),
      data.tahfiz.attendance_streak_alert_enabled ? 1 : 0,
      data.tahfiz.attendance_sheikh_selection_enabled === false ? 0 : 1,
      data.tahfiz.attendance_streak_status,
      data.tahfiz.progress_tracking_enabled ? 1 : 0,
      data.tahfiz.week_start_day,
      data.tahfiz.month_start_day,
      data.cursor,
      data.server_time,
    )
    for (const row of data.sheikhs) {
      await tx.runAsync(
        `INSERT INTO sheikhs(id,tahfiz_id,name,phone) VALUES(?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET tahfiz_id=excluded.tahfiz_id,name=excluded.name,phone=excluded.phone`,
        row.id, row.tahfiz_id, row.name, row.phone,
      )
    }
    for (const row of data.students) await upsertStudent(tx, row)
    for (const row of data.sessions) await upsertSession(tx, row)
    for (const row of data.attendance) {
      const pending = await tx.getFirstAsync(
        `SELECT 1 FROM outbox WHERE tahfiz_id=? AND entity_type='attendance' AND entity_key=?`,
        data.tahfiz.id, `${row.session_id}:${row.student_id}`,
      )
      if (!pending) await upsertAttendance(tx, row, false)
    }
    for (const row of data.quran_progress) {
      const key = `${row.session_id}:${row.student_id}:${row.category}`
      const pending = await tx.getFirstAsync(
        `SELECT 1 FROM outbox WHERE tahfiz_id=? AND entity_type='quran_progress' AND entity_key=?`,
        data.tahfiz.id, key,
      )
      if (!pending) await upsertProgress(tx, row, false)
    }
    await pruneMissingBootstrapRows(tx, data)
  })
}

function notInClause(column: string, ids: number[]) {
  if (ids.length === 0) return { sql: '1=1', args: [] as number[] }
  return {
    sql: `${column} NOT IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  }
}

async function pruneMissingBootstrapRows(db: SQLiteDatabase, data: Bootstrap) {
  const tahfizId = data.tahfiz.id
  const progress = notInClause('id', data.quran_progress.map((item) => item.id))
  await db.runAsync(
    `DELETE FROM quran_progress
     WHERE tahfiz_id=? AND ${progress.sql}
       AND NOT EXISTS (
         SELECT 1 FROM outbox
         WHERE outbox.tahfiz_id=quran_progress.tahfiz_id
           AND outbox.entity_type='quran_progress'
           AND outbox.entity_key=CAST(quran_progress.session_id AS TEXT)||':'||
             CAST(quran_progress.student_id AS TEXT)||':'||quran_progress.category
       )`,
    tahfizId,
    ...progress.args,
  )

  const attendance = notInClause('id', data.attendance.map((item) => item.id))
  await db.runAsync(
    `DELETE FROM attendance
     WHERE tahfiz_id=? AND ${attendance.sql}
       AND NOT EXISTS (
         SELECT 1 FROM outbox
         WHERE outbox.tahfiz_id=attendance.tahfiz_id
           AND outbox.entity_type='attendance'
           AND outbox.entity_key=CAST(attendance.session_id AS TEXT)||':'||CAST(attendance.student_id AS TEXT)
       )`,
    tahfizId,
    ...attendance.args,
  )

  const sessions = notInClause('id', data.sessions.map((item) => item.id))
  await db.runAsync(
    `DELETE FROM sessions
     WHERE tahfiz_id=? AND ${sessions.sql}
       AND NOT EXISTS (
         SELECT 1 FROM outbox
         WHERE outbox.tahfiz_id=sessions.tahfiz_id
           AND outbox.entity_key LIKE CAST(sessions.id AS TEXT)||':%'
       )`,
    tahfizId,
    ...sessions.args,
  )

  const students = notInClause('id', data.students.map((item) => item.id))
  await db.runAsync(
    `DELETE FROM students
     WHERE tahfiz_id=? AND ${students.sql}
       AND NOT EXISTS (
         SELECT 1 FROM outbox
         WHERE outbox.tahfiz_id=students.tahfiz_id
           AND (
             (outbox.entity_type='attendance' AND outbox.entity_key LIKE '%:'||CAST(students.id AS TEXT))
             OR (outbox.entity_type='quran_progress' AND outbox.entity_key LIKE '%:'||CAST(students.id AS TEXT)||':%')
           )
       )`,
    tahfizId,
    ...students.args,
  )

  const sheikhs = notInClause('id', data.sheikhs.map((item) => item.id))
  await db.runAsync(
    `DELETE FROM sheikhs WHERE tahfiz_id=? AND ${sheikhs.sql}`,
    tahfizId,
    ...sheikhs.args,
  )
}

async function upsertStudent(db: SQLiteDatabase, row: Student) {
  await db.runAsync(
    `INSERT INTO students(id,tahfiz_id,name,phone,student_code,birthday,registration_date,profile_pic,status,sheikh_id,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET tahfiz_id=excluded.tahfiz_id,name=excluded.name,phone=excluded.phone,
       student_code=excluded.student_code,birthday=excluded.birthday,registration_date=excluded.registration_date,
       profile_pic=excluded.profile_pic,status=excluded.status,sheikh_id=excluded.sheikh_id,sort_order=excluded.sort_order`,
    row.id, row.tahfiz_id, row.name, row.phone, row.student_code, row.birthday, row.registration_date,
    row.profile_pic, row.status, row.sheikh_id, row.sort_order,
  )
}

export async function attendanceStatusStreak(db: SQLiteDatabase, tahfizId: number, studentId: number) {
  const settings = await db.getFirstAsync<{ excused_absence_reset_statuses: string; attendance_streak_status: string }>(
    'SELECT excused_absence_reset_statuses,attendance_streak_status FROM tahfiz WHERE id=?',
    tahfizId,
  )
  const resetStatuses = new Set<string>(settings ? JSON.parse(settings.excused_absence_reset_statuses) : ['حاضر'])
  const trackedStatus = settings?.attendance_streak_status || 'غياب بعذر'
  const rows = await db.getAllAsync<{ status: string }>(
    `SELECT a.status FROM attendance a
     JOIN sessions s ON s.id=a.session_id
     WHERE a.tahfiz_id=? AND a.student_id=?
     ORDER BY s.date DESC,s.id DESC,a.id DESC`,
    tahfizId, studentId,
  )
  let streak = 0
  for (const row of rows) {
    if (row.status === trackedStatus) streak += 1
    else if (resetStatuses.has(row.status)) break
  }
  return streak
}

async function upsertSession(db: SQLiteDatabase, row: Session) {
  await db.runAsync(
    `INSERT INTO sessions(id,tahfiz_id,date,is_confirmed,version,reopened_at) VALUES(?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET tahfiz_id=excluded.tahfiz_id,date=excluded.date,
       is_confirmed=excluded.is_confirmed,version=excluded.version,reopened_at=excluded.reopened_at`,
    row.id, row.tahfiz_id, row.date, row.is_confirmed ? 1 : 0, row.version, row.reopened_at,
  )
}

async function upsertAttendance(db: SQLiteDatabase, row: Attendance, dirty: boolean) {
  await db.runAsync(
    `INSERT INTO attendance(id,tahfiz_id,session_id,student_id,sheikh_id,status,notes,revision,updated_at,dirty)
     VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id,student_id) DO UPDATE SET id=excluded.id,tahfiz_id=excluded.tahfiz_id,
       sheikh_id=excluded.sheikh_id,status=excluded.status,notes=excluded.notes,revision=excluded.revision,
       updated_at=excluded.updated_at,dirty=excluded.dirty`,
    row.id, row.tahfiz_id, row.session_id, row.student_id, row.sheikh_id, row.status, row.notes,
    row.revision, row.updated_at, dirty ? 1 : 0,
  )
}

async function upsertProgress(db: SQLiteDatabase, row: QuranProgress, dirty: boolean) {
  await db.runAsync(
    `INSERT INTO quran_progress
     (id,tahfiz_id,session_id,student_id,sheikh_id,category,range_type,from_surah,from_ayah,to_surah,to_ayah,
      from_page,to_page,quality_score,mistakes,notes,next_assignment,revision,updated_at,dirty)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id,student_id,category) DO UPDATE SET id=excluded.id,sheikh_id=excluded.sheikh_id,
       range_type=excluded.range_type,from_surah=excluded.from_surah,from_ayah=excluded.from_ayah,
       to_surah=excluded.to_surah,to_ayah=excluded.to_ayah,from_page=excluded.from_page,to_page=excluded.to_page,
       quality_score=excluded.quality_score,mistakes=excluded.mistakes,notes=excluded.notes,
       next_assignment=excluded.next_assignment,revision=excluded.revision,updated_at=excluded.updated_at,dirty=excluded.dirty`,
    row.id, row.tahfiz_id, row.session_id, row.student_id, row.sheikh_id, row.category, row.range_type,
    row.from_surah, row.from_ayah, row.to_surah, row.to_ayah, row.from_page, row.to_page,
    row.quality_score, row.mistakes, row.notes, row.next_assignment, row.revision, row.updated_at, dirty ? 1 : 0,
  )
}

export async function listSessions(db: SQLiteDatabase, tahfizId: number) {
  return db.getAllAsync<Omit<Session, 'is_confirmed'> & { is_confirmed: number }>(
    'SELECT * FROM sessions WHERE tahfiz_id=? ORDER BY date DESC,id DESC',
    tahfizId,
  )
}

export async function sessionAttendance<T>(db: SQLiteDatabase, sessionId: number) {
  return db.getAllAsync<T>(
    `SELECT s.*,a.id attendance_id,a.status,a.notes,a.sheikh_id,a.revision attendance_revision,a.dirty
     FROM attendance a JOIN students s ON s.id=a.student_id
     WHERE a.session_id=? ORDER BY s.sort_order,s.name`,
    sessionId,
  )
}

export async function queueAttendance(
  db: SQLiteDatabase,
  deviceId: string,
  tahfizId: number,
  sessionId: number,
  studentId: number,
  status: string,
  notes: string | null,
  sheikhId: number | null,
) {
  const row = await db.getFirstAsync<Attendance>(
    'SELECT * FROM attendance WHERE session_id=? AND student_id=?',
    sessionId, studentId,
  )
  if (!row) throw new Error('Attendance row is not available offline')
  const key = `${sessionId}:${studentId}`
  const pending = await db.getFirstAsync<{ mutation_id: string; base_revision: number }>(
    `SELECT mutation_id,base_revision FROM outbox WHERE tahfiz_id=? AND entity_type='attendance' AND entity_key=?`,
    tahfizId, key,
  )
  const mutationId = pending?.mutation_id ?? Crypto.randomUUID()
  const baseRevision = pending?.base_revision ?? row.revision
  const changedAt = new Date().toISOString()
  const values = { session_id: sessionId, student_id: studentId, status, notes, sheikh_id: sheikhId }
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'UPDATE attendance SET status=?,notes=?,sheikh_id=?,dirty=1,updated_at=? WHERE session_id=? AND student_id=?',
      status, notes, sheikhId, changedAt, sessionId, studentId,
    )
    await tx.runAsync(
      `INSERT INTO outbox(mutation_id,tahfiz_id,device_id,entity_type,entity_key,base_revision,values_json,client_changed_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(tahfiz_id,entity_type,entity_key) DO UPDATE SET
         values_json=excluded.values_json,client_changed_at=excluded.client_changed_at,last_error=NULL`,
      mutationId, tahfizId, deviceId, 'attendance', key, baseRevision, JSON.stringify(values), changedAt,
    )
  })
}

export async function queueProgress(
  db: SQLiteDatabase,
  deviceId: string,
  tahfizId: number,
  values: Record<string, unknown> & { session_id: number; student_id: number; category: string },
) {
  const key = `${values.session_id}:${values.student_id}:${values.category}`
  const existing = await db.getFirstAsync<{ revision: number }>(
    'SELECT revision FROM quran_progress WHERE session_id=? AND student_id=? AND category=?',
    values.session_id, values.student_id, values.category,
  )
  const pending = await db.getFirstAsync<{ mutation_id: string; base_revision: number }>(
    `SELECT mutation_id,base_revision FROM outbox WHERE tahfiz_id=? AND entity_type='quran_progress' AND entity_key=?`,
    tahfizId, key,
  )
  const changedAt = new Date().toISOString()
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO quran_progress
       (id,tahfiz_id,session_id,student_id,sheikh_id,category,range_type,from_surah,from_ayah,to_surah,to_ayah,
        from_page,to_page,quality_score,mistakes,notes,next_assignment,revision,updated_at,dirty)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(session_id,student_id,category) DO UPDATE SET
         sheikh_id=excluded.sheikh_id,range_type=excluded.range_type,from_surah=excluded.from_surah,
         from_ayah=excluded.from_ayah,to_surah=excluded.to_surah,to_ayah=excluded.to_ayah,
         from_page=excluded.from_page,to_page=excluded.to_page,quality_score=excluded.quality_score,
         mistakes=excluded.mistakes,notes=excluded.notes,next_assignment=excluded.next_assignment,
         updated_at=excluded.updated_at,dirty=1`,
      existing ? 0 : -Date.now(), tahfizId, values.session_id, values.student_id,
      (values.sheikh_id as number | null | undefined) ?? null, values.category,
      (values.range_type as string | undefined) ?? 'page',
      (values.from_surah as number | null | undefined) ?? null,
      (values.from_ayah as number | null | undefined) ?? null,
      (values.to_surah as number | null | undefined) ?? null,
      (values.to_ayah as number | null | undefined) ?? null,
      (values.from_page as number | null | undefined) ?? null,
      (values.to_page as number | null | undefined) ?? null,
      Number(values.quality_score ?? 1), Number(values.mistakes ?? 0),
      (values.notes as string | null | undefined) ?? null,
      (values.next_assignment as string | null | undefined) ?? null,
      existing?.revision ?? 0, changedAt,
    )
    await tx.runAsync(
      `INSERT INTO outbox(mutation_id,tahfiz_id,device_id,entity_type,entity_key,base_revision,values_json,client_changed_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(tahfiz_id,entity_type,entity_key) DO UPDATE SET
         values_json=excluded.values_json,client_changed_at=excluded.client_changed_at,last_error=NULL`,
      pending?.mutation_id ?? Crypto.randomUUID(), tahfizId, deviceId, 'quran_progress', key,
      pending?.base_revision ?? existing?.revision ?? 0, JSON.stringify(values), changedAt,
    )
  })
}

export async function outboxForTahfiz(db: SQLiteDatabase, tahfizId: number): Promise<OutboxMutation[]> {
  const rows = await db.getAllAsync<Omit<OutboxMutation, 'values'> & { values_json: string }>(
    'SELECT * FROM outbox WHERE tahfiz_id=? ORDER BY client_changed_at',
    tahfizId,
  )
  return rows.map((row) => ({ ...row, values: JSON.parse(row.values_json) }))
}

export async function acceptMutationResult(
  db: SQLiteDatabase,
  mutation: OutboxMutation,
  result: Record<string, any>,
) {
  if (result.status === 'applied') {
    if (mutation.entity_type === 'attendance') await upsertAttendance(db, result.entity as Attendance, false)
    else await upsertProgress(db, result.entity as QuranProgress, false)
    await db.runAsync('DELETE FROM outbox WHERE mutation_id=?', mutation.mutation_id)
    return
  }
  if (result.status === 'conflict' || result.status === 'rejected') {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO conflicts(tahfiz_id,mutation_id,entity_type,entity_key,code,local_json,server_json,created_at)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(tahfiz_id,mutation_id) DO UPDATE SET
           code=excluded.code,local_json=excluded.local_json,server_json=excluded.server_json`,
        mutation.tahfiz_id, mutation.mutation_id, mutation.entity_type, mutation.entity_key,
        result.code ?? result.status, JSON.stringify(mutation.values),
        result.server ? JSON.stringify(result.server) : null, new Date().toISOString(),
      )
      await tx.runAsync('DELETE FROM outbox WHERE mutation_id=?', mutation.mutation_id)
    })
  }
}

export async function listConflicts(db: SQLiteDatabase, tahfizId: number): Promise<SyncConflict[]> {
  const rows = await db.getAllAsync<Omit<SyncConflict, 'local' | 'server'> & {
    local_json: string
    server_json: string | null
  }>('SELECT * FROM conflicts WHERE tahfiz_id=? ORDER BY created_at DESC', tahfizId)
  return rows.map((row) => ({
    ...row,
    local: JSON.parse(row.local_json),
    server: row.server_json ? JSON.parse(row.server_json) : null,
  }))
}

export async function resolveConflict(
  db: SQLiteDatabase,
  conflict: SyncConflict,
  choice: 'server' | 'local',
  deviceId: string,
) {
  if (choice === 'server') {
    if (conflict.server) {
      if (conflict.entity_type === 'attendance') {
        await upsertAttendance(db, conflict.server as unknown as Attendance, false)
      } else {
        await upsertProgress(db, conflict.server as unknown as QuranProgress, false)
      }
    }
    await db.runAsync('DELETE FROM conflicts WHERE id=?', conflict.id)
    return
  }
  const baseRevision = Number(conflict.server?.revision ?? 0)
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO outbox(mutation_id,tahfiz_id,device_id,entity_type,entity_key,base_revision,values_json,client_changed_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      Crypto.randomUUID(), conflict.tahfiz_id, deviceId, conflict.entity_type,
      conflict.entity_key, baseRevision, JSON.stringify(conflict.local), new Date().toISOString(),
    )
    await tx.runAsync('DELETE FROM conflicts WHERE id=?', conflict.id)
  })
}

export async function pendingCount(db: SQLiteDatabase, tahfizId?: number) {
  const row = tahfizId
    ? await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM outbox WHERE tahfiz_id=?', tahfizId)
    : await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM outbox')
  return row?.count ?? 0
}

export async function purgeLocalData(db: SQLiteDatabase) {
  await db.execAsync(`
    DELETE FROM conflicts; DELETE FROM outbox; DELETE FROM quran_progress;
    DELETE FROM attendance; DELETE FROM sessions; DELETE FROM students;
    DELETE FROM sheikhs; DELETE FROM tahfiz; DELETE FROM metadata;
  `)
  // Rotate rather than merely deleting the key: the provider keeps this
  // database handle open until process exit, and the old ciphertext must not
  // become readable again after a later login.
  const replacementKey = await newDatabaseKey()
  await db.execAsync(`PRAGMA rekey = "x'${replacementKey}'"`)
  await SecureStore.setItemAsync(DB_KEY_NAME, replacementKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}
