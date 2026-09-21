import {
  createInquiryAgentFactory
} from "../agent/inquiry-agent.ts";

type Conversation = {
  prompt(message: string): Promise<string>;
  dispose(): void;
};

export interface ConversationApplicationService {
  sendMessage(
    conversationId: string,
    message: string
  ): Promise<string>;
  disposeAll(): void;
}

export class ConversationBusyError extends Error {
  constructor() {
    super("当前会话正在处理另一条消息");
    this.name = "ConversationBusyError";
  }
}

export class AgentConversationApplicationService
implements ConversationApplicationService {
  private readonly conversations = new Map<
    string,
    Promise<Conversation>
  >();

  private readonly activeConversations = new Set<string>();
  private factoryPromise?: ReturnType<
    typeof createInquiryAgentFactory
  >;

  constructor(
    private readonly maxConversations = 100
  ) {}

  private getFactory() {
    this.factoryPromise ??= createInquiryAgentFactory();
    return this.factoryPromise;
  }

  private async getConversation(
    conversationId: string
  ) {
    const existing = this.conversations.get(conversationId);

    if (existing) {
      this.conversations.delete(conversationId);
      this.conversations.set(conversationId, existing);
      return existing;
    }

    if (this.conversations.size >= this.maxConversations) {
      const oldestId = this.conversations.keys().next()
        .value as string | undefined;

      if (oldestId && !this.activeConversations.has(oldestId)) {
        const oldest = this.conversations.get(oldestId);
        this.conversations.delete(oldestId);
        void oldest?.then((conversation) => {
          conversation.dispose();
        });
      } else {
        throw new Error("当前会话容量已满，请稍后再试");
      }
    }

    const conversationPromise = this.getFactory().then(
      (factory) => factory.createConversation()
    );

    this.conversations.set(
      conversationId,
      conversationPromise
    );

    return conversationPromise;
  }

  async sendMessage(
    conversationId: string,
    message: string
  ) {
    if (this.activeConversations.has(conversationId)) {
      throw new ConversationBusyError();
    }

    this.activeConversations.add(conversationId);

    try {
      const conversation = await this.getConversation(
        conversationId
      );

      return await conversation.prompt(message);
    } finally {
      this.activeConversations.delete(conversationId);
    }
  }

  disposeAll() {
    for (const conversation of this.conversations.values()) {
      void conversation.then((item) => item.dispose());
    }

    this.conversations.clear();
    this.activeConversations.clear();
  }
}
