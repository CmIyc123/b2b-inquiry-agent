import {
  writeToolEventLog
} from "./events/event-logger.ts";

const savedLog = await writeToolEventLog({
  toolCallId: "test-call-001",
  toolName: "lookup_product",
  stage: "end",
  status: "success"
});

console.log("事件日志写入成功：", savedLog);