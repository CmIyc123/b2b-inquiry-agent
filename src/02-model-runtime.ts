import { createInterface } from "node:readline/promises";

import {
  createInquiryAgentFactory
} from "./agent/inquiry-agent.ts";

const agentFactory = await createInquiryAgentFactory();

console.log(
  "可用模型数量：",
  agentFactory.availableModels.length
);

for (const model of agentFactory.availableModels) {
  console.log(`${model.provider}/${model.id}`);
}

console.log(
  "已选择模型：",
  agentFactory.selectedModel.id
);

const conversation = await agentFactory.createConversation({
  onTextDelta(text) {
    process.stdout.write(text);
  },

  onToolEvent(event) {
    if (event.stage === "start") {
      console.log(`\n工具开始：${event.toolName}`);
    } else {
      console.log(
        `\n工具结束：${event.toolName}，${
          event.isError ? "失败" : "成功"
        }`
      );
    }

    console.log(`调用 ID：${event.toolCallId}`);
  }
});

console.log("Session 创建成功");

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout
});

try {
  while (true) {
    const userInput = await terminal.question(
      "\n客户："
    );

    if (userInput.trim().toLowerCase() === "exit") {
      console.log("对话已结束");
      break;
    }

    if (!userInput.trim()) {
      console.log("输入不能为空");
      continue;
    }

    console.log("\nAgent：");
    await conversation.prompt(userInput);
    console.log();
  }
} finally {
  terminal.close();
  conversation.dispose();
}
