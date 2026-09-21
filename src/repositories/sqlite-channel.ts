import { randomUUID } from "node:crypto";

import {
  DATABASE_FILE,
  initializeDatabase
} from "../db/database.ts";

import type {
  ChannelMessageRepository,
  ChannelMessageStatus,
  ChannelName,
  IncomingChannelMessage,
  StoredChannelMessage
} from "../channels/types.ts";

type Row = Record<string, unknown>;

function mapMessage(row: Row): StoredChannelMessage {
  return {
    id: String(row.id),
    channel: row.channel as ChannelName,
    externalMessageId: String(row.external_message_id),
    externalContactId: String(row.external_contact_id),
    conversationId: String(row.conversation_id),
    direction: row.direction as StoredChannelMessage["direction"],
    status: row.status as ChannelMessageStatus,
    receivedAt: String(row.received_at),
    processedAt: row.processed_at as string | null,
    errorCode: row.error_code as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class SqliteChannelMessageRepository
implements ChannelMessageRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  async getOrCreateConversationId(
    channel: ChannelName,
    externalContactId: string
  ) {
    const database = initializeDatabase(this.databaseFile);
    const now = new Date().toISOString();
    const candidate = `${channel}:${randomUUID()}`;

    try {
      database.prepare(`
        INSERT OR IGNORE INTO channel_contacts (
          channel, external_contact_id, conversation_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        channel,
        externalContactId,
        candidate,
        now,
        now
      );

      const row = database.prepare(`
        SELECT conversation_id
        FROM channel_contacts
        WHERE channel = ? AND external_contact_id = ?
      `).get(channel, externalContactId) as {
        conversation_id: string;
      } | undefined;

      if (!row) {
        throw new Error("无法建立渠道会话映射");
      }

      return row.conversation_id;
    } finally {
      database.close();
    }
  }

  async claimInbound(
    message: IncomingChannelMessage,
    conversationId: string
  ) {
    const database = initializeDatabase(this.databaseFile);
    const now = new Date().toISOString();
    const receivedAt = message.receivedAt ?? now;

    try {
      const result = database.prepare(`
        INSERT OR IGNORE INTO channel_messages (
          id, channel, external_message_id,
          external_contact_id, conversation_id,
          direction, status, received_at,
          processed_at, error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'inbound', 'received', ?, NULL, NULL, ?, ?)
      `).run(
        randomUUID(),
        message.channel,
        message.externalMessageId,
        message.externalContactId,
        conversationId,
        receivedAt,
        now,
        now
      );

      if (Number(result.changes) === 1) {
        return true;
      }

      const retry = database.prepare(`
        UPDATE channel_messages
        SET status = 'received',
            processed_at = NULL,
            error_code = NULL,
            updated_at = ?
        WHERE channel = ?
          AND external_message_id = ?
          AND status = 'failed'
      `).run(
        now,
        message.channel,
        message.externalMessageId
      );

      return Number(retry.changes) === 1;
    } finally {
      database.close();
    }
  }

  private updateStatus(
    channel: ChannelName,
    externalMessageId: string,
    status: ChannelMessageStatus,
    errorCode: string | null
  ) {
    const database = initializeDatabase(this.databaseFile);
    const now = new Date().toISOString();

    try {
      database.prepare(`
        UPDATE channel_messages
        SET status = ?,
            processed_at = CASE
              WHEN ? IN ('completed', 'failed') THEN ?
              ELSE processed_at
            END,
            error_code = ?,
            updated_at = ?
        WHERE channel = ? AND external_message_id = ?
      `).run(
        status,
        status,
        now,
        errorCode,
        now,
        channel,
        externalMessageId
      );
    } finally {
      database.close();
    }
  }

  async markProcessing(
    channel: ChannelName,
    externalMessageId: string
  ) {
    this.updateStatus(
      channel,
      externalMessageId,
      "processing",
      null
    );
  }

  async markCompleted(
    channel: ChannelName,
    externalMessageId: string
  ) {
    this.updateStatus(
      channel,
      externalMessageId,
      "completed",
      null
    );
  }

  async markFailed(
    channel: ChannelName,
    externalMessageId: string,
    errorCode: string
  ) {
    this.updateStatus(
      channel,
      externalMessageId,
      "failed",
      errorCode
    );
  }

  async findByExternalId(
    channel: ChannelName,
    externalMessageId: string
  ) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT *
        FROM channel_messages
        WHERE channel = ? AND external_message_id = ?
      `).get(channel, externalMessageId) as Row | undefined;

      return row ? mapMessage(row) : null;
    } finally {
      database.close();
    }
  }
}

export const sqliteChannelMessageRepository =
  new SqliteChannelMessageRepository();
