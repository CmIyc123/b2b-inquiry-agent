import {
  AgentConversationApplicationService
} from "../application/conversation-service.ts";

import {
  DefaultDataApplicationService
} from "../application/data-service.ts";

import {
  DefaultChannelApplicationService
} from "../application/channel-service.ts";

import {
  SqliteChannelMessageRepository
} from "../repositories/sqlite-channel.ts";

import { createApiServer } from "./server.ts";

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT 必须是有效端口号");
}

const conversations =
  new AgentConversationApplicationService();

const channels = new DefaultChannelApplicationService(
  conversations,
  new SqliteChannelMessageRepository()
);

const server = createApiServer({
  conversations,
  channels,
  data: new DefaultDataApplicationService(),
  whatsapp: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
  },
  adminApiKey: process.env.ADMIN_API_KEY,
  frontendOrigin: process.env.FRONTEND_ORIGIN
});

server.listen(port, host, () => {
  console.log(
    `B2B Inquiry Agent API 已启动：http://${host}:${port}`
  );

  if (!process.env.ADMIN_API_KEY) {
    console.warn(
      "未配置 ADMIN_API_KEY，管理接口将返回 503。"
    );
  }
});

function shutdown() {
  conversations.disposeAll();
  server.close((error) => {
    if (error) {
      console.error("API 关闭失败：", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
