import {
  initializeDatabase,
  DATABASE_FILE
} from "./db/database.ts";

const database = initializeDatabase();

try {
  const tables = [
    "leads",
    "reviews",
    "review_requested_checks",
    "quotes",
    "quote_status_events",
    "agent_events"
  ];

  console.log("数据库：", DATABASE_FILE);

  for (const table of tables) {
    const result = database.prepare(
      `SELECT COUNT(*) AS count FROM ${table}`
    ).get() as { count: number };

    console.log(`${table}: ${result.count}`);
  }

  const integrity = database.prepare(
    "PRAGMA integrity_check;"
  ).get() as { integrity_check: string };

  const foreignKeys = database.prepare(
    "PRAGMA foreign_key_check;"
  ).all();

  console.log(
    "完整性检查：",
    integrity.integrity_check
  );
  console.log(
    "外键异常数：",
    foreignKeys.length
  );
} finally {
  database.close();
}
