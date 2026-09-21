import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DefaultChannelApplicationService
} from "../application/channel-service.ts";

import type {
  ConversationApplicationService
} from "../application/conversation-service.ts";

import {
  SqliteChannelMessageRepository
} from "../repositories/sqlite-channel.ts";

async function createFixture(
  replyOrError: string | Error = "Agent reply"
) {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-channel-")
  );
  const repository = new SqliteChannelMessageRepository(
    join(directory, "test.db")
  );
  const calls: Array<{
    conversationId: string;
    message: string;
  }> = [];

  const conversations: ConversationApplicationService = {
    async sendMessage(conversationId, message) {
      calls.push({ conversationId, message });

      if (replyOrError instanceof Error) {
        throw replyOrError;
      }

      return replyOrError;
    },
    disposeAll() {}
  };

  return {
    directory,
    repository,
    calls,
    service: new DefaultChannelApplicationService(
      conversations,
      repository
    )
  };
}

test("渠道消息按 messageId 去重并复用联系人会话", async (t) => {
  const fixture = await createFixture();

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  const first = await fixture.service.processInbound({
    channel: "whatsapp",
    externalMessageId: "wamid.001",
    externalContactId: "33600000000",
    text: "First inquiry"
  });

  const duplicate = await fixture.service.processInbound({
    channel: "whatsapp",
    externalMessageId: "wamid.001",
    externalContactId: "33600000000",
    text: "First inquiry"
  });

  const followUp = await fixture.service.processInbound({
    channel: "whatsapp",
    externalMessageId: "wamid.002",
    externalContactId: "33600000000",
    text: "Follow-up details"
  });

  assert.equal(first.outcome, "completed");
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(followUp.outcome, "completed");
  assert.equal(fixture.calls.length, 2);
  assert.equal(
    fixture.calls[0]?.conversationId,
    fixture.calls[1]?.conversationId
  );

  const stored = await fixture.repository.findByExternalId(
    "whatsapp",
    "wamid.001"
  );

  assert.equal(stored?.status, "completed");
  assert.equal(stored?.errorCode, null);
});

test("渠道处理失败时只记录安全错误类型", async (t) => {
  const fixture = await createFixture(
    new TypeError("secret upstream details")
  );

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  await assert.rejects(
    fixture.service.processInbound({
      channel: "whatsapp",
      externalMessageId: "wamid.failed",
      externalContactId: "33600000001",
      text: "Trigger failure"
    }),
    TypeError
  );

  const stored = await fixture.repository.findByExternalId(
    "whatsapp",
    "wamid.failed"
  );

  assert.equal(stored?.status, "failed");
  assert.equal(stored?.errorCode, "TypeError");
  assert.equal(
    stored?.errorCode?.includes("secret"),
    false
  );

  const retried = await fixture.repository.claimInbound(
    {
      channel: "whatsapp",
      externalMessageId: "wamid.failed",
      externalContactId: "33600000001",
      text: "Trigger failure"
    },
    stored?.conversationId ?? ""
  );
  const reset = await fixture.repository.findByExternalId(
    "whatsapp",
    "wamid.failed"
  );

  assert.equal(retried, true);
  assert.equal(reset?.status, "received");
  assert.equal(reset?.errorCode, null);
});
