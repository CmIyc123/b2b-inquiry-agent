import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime
} from "@earendil-works/pi-coding-agent";

import {
  writeToolEventLog
} from "../events/event-logger.ts";

import { lookupProductTool } from "../tools/lookup-product.ts";
import { lookupLeadTool } from "../tools/lookup-lead.ts";
import { saveLeadTool } from "../tools/save-lead.ts";
import { updateLeadTool } from "../tools/update-lead.ts";
import { checkLeadReadinessTool } from "../tools/check-lead-readiness.ts";
import { requestHumanReviewTool } from "../tools/request-human-review.ts";
import { lookupReviewStatusTool } from "../tools/lookup-review-status.ts";
import { createQuoteDraftTool } from "../tools/create-quote-draft.ts";
import { lookupQuoteStatusTool } from "../tools/lookup-quote-status.ts";
import { recordQuoteResponseTool } from "../tools/record-quote-response.ts";
import { searchProductDocumentsTool } from "../tools/search-product-documents.ts";

import {
  INQUIRY_AGENT_SYSTEM_PROMPT
} from "./system-prompt.ts";

export type ToolExecutionNotice = {
  stage: "start" | "end";
  toolName: string;
  toolCallId: string;
  isError?: boolean;
};

export type ConversationOptions = {
  onTextDelta?: (text: string) => void;
  onToolEvent?: (event: ToolExecutionNotice) => void;
};

const CUSTOM_TOOLS = [
  lookupProductTool,
  lookupLeadTool,
  saveLeadTool,
  updateLeadTool,
  checkLeadReadinessTool,
  requestHumanReviewTool,
  lookupReviewStatusTool,
  createQuoteDraftTool,
  lookupQuoteStatusTool,
  recordQuoteResponseTool,
  searchProductDocumentsTool
];

const ENABLED_TOOLS = [
  "lookup_product",
  "lookup_lead",
  "save_lead",
  "update_lead",
  "check_lead_readiness",
  "request_human_review",
  "lookup_review_status",
  "create_quote_draft",
  "lookup_quote_status",
  "record_quote_response",
  "search_product_documents"
];

export async function createInquiryAgentFactory() {
  const modelRuntime = await ModelRuntime.create();
  const availableModels = await modelRuntime.getAvailable();

  const selectedModel = availableModels.find(
    (model) =>
      model.provider === "deepseek" &&
      model.id === "deepseek-v4-flash"
  );

  if (!selectedModel) {
    throw new Error("没有找到指定的 DeepSeek 模型");
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () =>
      INQUIRY_AGENT_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => []
  });

  await resourceLoader.reload();

  return {
    availableModels,
    selectedModel,

    async createConversation(
      options: ConversationOptions = {}
    ) {
      const { session } = await createAgentSession({
        model: selectedModel,
        modelRuntime,
        resourceLoader,
        customTools: CUSTOM_TOOLS,
        tools: ENABLED_TOOLS
      });

      let responseText = "";
      let collectingText = false;
      let activePrompt = false;

      session.subscribe((event) => {
        if (event.type === "tool_execution_start") {
          options.onToolEvent?.({
            stage: "start",
            toolName: event.toolName,
            toolCallId: event.toolCallId
          });

          void writeToolEventLog({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            stage: "start",
            status: "started"
          });
        }

        if (event.type === "tool_execution_end") {
          options.onToolEvent?.({
            stage: "end",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            isError: event.isError
          });

          void writeToolEventLog({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            stage: "end",
            status: event.isError
              ? "error"
              : "success"
          });
        }

        if (
          collectingText &&
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          const delta = event.assistantMessageEvent.delta;
          responseText += delta;
          options.onTextDelta?.(delta);
        }
      });

      return {
        async prompt(message: string) {
          if (activePrompt) {
            throw new Error(
              "当前会话正在处理另一条消息"
            );
          }

          activePrompt = true;
          collectingText = true;
          responseText = "";

          try {
            await session.prompt(message);
            return responseText;
          } finally {
            collectingText = false;
            activePrompt = false;
          }
        },

        dispose() {
          session.dispose();
        }
      };
    }
  };
}
