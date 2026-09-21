import {
  inspectJsonMigration,
  migrateJsonToSqlite
} from "./db/migrate-json.ts";

import { DATABASE_FILE } from "./db/database.ts";

const apply = process.argv.includes("--apply");
const source = await inspectJsonMigration();

console.log("SQLite 数据库：", DATABASE_FILE);
console.log("待迁移数据：", source.counts);

if (!apply) {
  console.log("当前为预览模式，没有创建或修改数据库。");
  console.log("确认后使用 --apply 正式执行。");
} else {
  const result = await migrateJsonToSqlite();

  console.log("SQLite 迁移完成：", result);
  console.log("原 JSON 文件均已保留，可用于回退核对。");
}
