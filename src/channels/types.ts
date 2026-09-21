export type ChannelName = "whatsapp";

export type ChannelMessageStatus =
  | "received"
  | "processing"
  | "completed"
  | "failed";

export type IncomingChannelMessage = {
  channel: ChannelName;
  externalMessageId: string;
  externalContactId: string;
  text: string;
  receivedAt?: string;
};

export type StoredChannelMessage = {
  id: string;
  channel: ChannelName;
  externalMessageId: string;
  externalContactId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  status: ChannelMessageStatus;
  receivedAt: string;
  processedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelProcessResult =
  | {
      outcome: "completed";
      conversationId: string;
      reply: string;
    }
  | {
      outcome: "duplicate";
      conversationId: string;
      status: ChannelMessageStatus;
    };

export interface ChannelMessageRepository {
  getOrCreateConversationId(
    channel: ChannelName,
    externalContactId: string
  ): Promise<string>;
  claimInbound(
    message: IncomingChannelMessage,
    conversationId: string
  ): Promise<boolean>;
  markProcessing(
    channel: ChannelName,
    externalMessageId: string
  ): Promise<void>;
  markCompleted(
    channel: ChannelName,
    externalMessageId: string
  ): Promise<void>;
  markFailed(
    channel: ChannelName,
    externalMessageId: string,
    errorCode: string
  ): Promise<void>;
  findByExternalId(
    channel: ChannelName,
    externalMessageId: string
  ): Promise<StoredChannelMessage | null>;
}
