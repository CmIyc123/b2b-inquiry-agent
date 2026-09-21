import type {
  ConversationApplicationService
} from "./conversation-service.ts";

import type {
  ChannelMessageRepository,
  ChannelProcessResult,
  IncomingChannelMessage
} from "../channels/types.ts";

export interface ChannelApplicationService {
  processInbound(
    message: IncomingChannelMessage
  ): Promise<ChannelProcessResult>;
}

function validateMessage(message: IncomingChannelMessage) {
  if (
    message.externalMessageId.trim() === "" ||
    message.externalMessageId.length > 256
  ) {
    throw new Error("externalMessageId 无效");
  }

  if (
    message.externalContactId.trim() === "" ||
    message.externalContactId.length > 256
  ) {
    throw new Error("externalContactId 无效");
  }

  if (
    message.text.trim() === "" ||
    message.text.length > 10_000
  ) {
    throw new Error("渠道消息正文无效");
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 80);
  }

  return "ChannelProcessingError";
}

export class DefaultChannelApplicationService
implements ChannelApplicationService {
  constructor(
    private readonly conversations: ConversationApplicationService,
    private readonly messages: ChannelMessageRepository
  ) {}

  async processInbound(
    input: IncomingChannelMessage
  ): Promise<ChannelProcessResult> {
    const message = {
      ...input,
      externalMessageId: input.externalMessageId.trim(),
      externalContactId: input.externalContactId.trim(),
      text: input.text.trim()
    };

    validateMessage(message);

    const conversationId =
      await this.messages.getOrCreateConversationId(
        message.channel,
        message.externalContactId
      );

    const claimed = await this.messages.claimInbound(
      message,
      conversationId
    );

    if (!claimed) {
      const existing =
        await this.messages.findByExternalId(
          message.channel,
          message.externalMessageId
        );

      return {
        outcome: "duplicate",
        conversationId:
          existing?.conversationId ?? conversationId,
        status: existing?.status ?? "received"
      };
    }

    await this.messages.markProcessing(
      message.channel,
      message.externalMessageId
    );

    try {
      const reply = await this.conversations.sendMessage(
        conversationId,
        message.text
      );

      await this.messages.markCompleted(
        message.channel,
        message.externalMessageId
      );

      return {
        outcome: "completed",
        conversationId,
        reply
      };
    } catch (error) {
      await this.messages.markFailed(
        message.channel,
        message.externalMessageId,
        safeErrorCode(error)
      );
      throw error;
    }
  }
}
