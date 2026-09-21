import { appendFile } from "node:fs/promises";
import { join } from "node:path";

import {
  sqliteAgentEventRepository
} from "../repositories/sqlite.ts";

const EVENT_LOG_FILE = join(
  process.cwd(),
  "data",
  "agent-events.jsonl"
);

export type ToolEventInput = {
  toolCallId: string;
  toolName: string;
  stage: "start" | "end";
  status: "started" | "success" | "error";
};

export async function writeToolEventLog(
  event: ToolEventInput,
  eventLogFile?: string
) {
  const logEntry = {
    time: new Date().toISOString(),
    ...event
  };

  if (eventLogFile === undefined) {
    await sqliteAgentEventRepository.insert(logEntry);
    return logEntry;
  }

  const line = JSON.stringify(logEntry) + "\n";

  await appendFile(
    eventLogFile,
    line,
    "utf-8"
  );

  return logEntry;
}
