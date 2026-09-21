const elements = {
  healthDot: document.querySelector("#health-dot"),
  healthText: document.querySelector("#health-text"),
  keyForm: document.querySelector("#key-form"),
  adminKey: document.querySelector("#admin-key"),
  keyStatus: document.querySelector("#key-status"),
  chatForm: document.querySelector("#chat-form"),
  chatMessage: document.querySelector("#chat-message"),
  chatLog: document.querySelector("#chat-log"),
  newChat: document.querySelector("#new-chat"),
  conversationLabel: document.querySelector("#conversation-label"),
  leadForm: document.querySelector("#lead-form"),
  leadEmail: document.querySelector("#lead-email"),
  leadProduct: document.querySelector("#lead-product"),
  leadResults: document.querySelector("#lead-results"),
  refreshReviews: document.querySelector("#refresh-reviews"),
  reviewList: document.querySelector("#review-list"),
  reviewForm: document.querySelector("#review-form"),
  selectedReview: document.querySelector("#selected-review"),
  selectedLead: document.querySelector("#selected-lead"),
  reviewDecision: document.querySelector("#review-decision"),
  reviewedBy: document.querySelector("#reviewed-by"),
  inventoryConfirmed: document.querySelector("#inventory-confirmed"),
  unitPrice: document.querySelector("#unit-price"),
  currency: document.querySelector("#currency"),
  leadTimeDays: document.querySelector("#lead-time-days"),
  coaStatus: document.querySelector("#coa-status"),
  reviewNotes: document.querySelector("#review-notes"),
  commercialFields: document.querySelector("#commercial-fields"),
  reviewStatus: document.querySelector("#review-status"),
  quoteForm: document.querySelector("#quote-form"),
  quoteNumber: document.querySelector("#quote-number"),
  quoteResult: document.querySelector("#quote-result"),
  quoteSentForm: document.querySelector("#quote-sent-form"),
  validDays: document.querySelector("#valid-days"),
  whatsappConnect: document.querySelector("#whatsapp-connect"),
  whatsappState: document.querySelector("#whatsapp-state"),
  whatsappDetails: document.querySelector("#whatsapp-details"),
  whatsappSimulator: document.querySelector("#whatsapp-simulator"),
  whatsappFrom: document.querySelector("#whatsapp-from"),
  whatsappMessage: document.querySelector("#whatsapp-message"),
  whatsappResult: document.querySelector("#whatsapp-result"),
  documentForm: document.querySelector("#document-form"),
  documentProductSku: document.querySelector("#document-product-sku"),
  documentType: document.querySelector("#document-type"),
  documentTitle: document.querySelector("#document-title"),
  documentFile: document.querySelector("#document-file"),
  documentStatus: document.querySelector("#document-status"),
  documentList: document.querySelector("#document-list"),
  documentCount: document.querySelector("#document-count"),
  refreshDocuments: document.querySelector("#refresh-documents"),
  knowledgeSearchForm: document.querySelector("#knowledge-search-form"),
  knowledgeSearchQuery: document.querySelector("#knowledge-search-query"),
  knowledgeSearchResults: document.querySelector("#knowledge-search-results")
};

let conversationId = crypto.randomUUID();
let selectedReviewId = null;
let selectedQuoteNumber = null;

function adminKey() {
  return sessionStorage.getItem("b2b-inquiry-agent-admin-key") ?? "";
}

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.className = `status-text ${type}`.trim();
}

async function api(path, options = {}, requiresAdmin = false) {
  const headers = new Headers(options.headers ?? {});

  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (requiresAdmin) {
    const key = adminKey();

    if (!key) {
      throw new Error("请先保存管理员 API Key");
    }

    headers.set("x-admin-api-key", key);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body.message ?? body.error ?? "请求失败";
    throw new Error(`${response.status}: ${message}`);
  }

  return body;
}

function clear(element) {
  element.replaceChildren();
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return String(value);
}

function createResultCard(data, fields) {
  const card = document.createElement("article");
  card.className = "result-card";

  const list = document.createElement("dl");

  for (const [key, label] of fields) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");

    term.textContent = label;
    detail.textContent = displayValue(data[key]);
    list.append(term, detail);
  }

  card.append(list);
  return card;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parts = [];

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    );
  }

  return btoa(parts.join(""));
}

function createDocumentRow(document) {
  const row = documentNode("article", "document-row");
  const title = documentNode("strong", "", document.title);
  const details = documentNode(
    "span",
    "",
    `${document.productSku} · ${document.documentType} · v${document.version}`
  );
  const source = documentNode(
    "small",
    "",
    `${document.originalFilename} · ${document.chunkCount} 个片段`
  );
  const state = documentNode(
    "span",
    `document-state ${document.status}`,
    document.status === "active" ? "当前版本" : "历史版本"
  );

  row.append(title, details, source, state);
  return row;
}

function documentNode(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

function setConversationId() {
  elements.conversationLabel.textContent =
    `conversationId: ${conversationId}`;
}

function appendMessage(role, text) {
  const empty = elements.chatLog.querySelector(".empty-state");
  empty?.remove();

  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  elements.chatLog.append(message);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

async function checkHealth() {
  try {
    const health = await api("/api/health");
    elements.healthDot.className = "health-dot ok";
    elements.healthText.textContent =
      `服务正常 · ${health.storage}`;
  } catch {
    elements.healthDot.className = "health-dot error";
    elements.healthText.textContent = "服务不可用";
  }
}

async function loadReviews() {
  clear(elements.reviewList);

  const loading = document.createElement("p");
  loading.className = "empty-state";
  loading.textContent = "正在加载待审核任务…";
  elements.reviewList.append(loading);

  try {
    const result = await api(
      "/api/reviews?status=pending",
      {},
      true
    );

    clear(elements.reviewList);

    if (result.reviews.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "当前没有待审核任务。";
      elements.reviewList.append(empty);
      elements.reviewForm.hidden = true;
      return;
    }

    for (const review of result.reviews) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "review-item";
      button.dataset.reviewId = review.id;
      button.textContent = [
        `Review ${review.id.slice(0, 8)}`,
        `Lead ${review.leadId.slice(0, 8)}`,
        displayValue(review.requestedChecks)
      ].join("\n");

      button.addEventListener("click", () => {
        void selectReview(review, button);
      });

      elements.reviewList.append(button);
    }
  } catch (error) {
    clear(elements.reviewList);
    const message = document.createElement("p");
    message.className = "status-text error";
    message.textContent = error.message;
    elements.reviewList.append(message);
  }
}

async function loadWhatsAppStatus() {
  elements.whatsappState.textContent = "正在检查";
  elements.whatsappState.className = "channel-state";
  elements.whatsappDetails.textContent =
    "正在读取服务端渠道配置…";
  elements.whatsappResult.textContent = "";

  try {
    const status = await api(
      "/api/channels/whatsapp/status",
      {},
      true
    );

    if (status.configured) {
      elements.whatsappState.textContent = "Meta 凭证就绪";
      elements.whatsappState.className =
        "channel-state ready";
      elements.whatsappDetails.textContent =
        `Webhook：${status.webhookPath}。可以先用模拟消息验证完整 Agent 流程。`;
    } else {
      elements.whatsappState.textContent = "模拟模式";
      elements.whatsappState.className =
        "channel-state simulator";
      elements.whatsappDetails.textContent =
        `正式连接还缺少：${status.missing.join("、")}。`;
    }

    elements.whatsappConnect.textContent = "重新检查配置";
    elements.whatsappSimulator.hidden = false;
  } catch (error) {
    elements.whatsappState.textContent = "无法检查";
    elements.whatsappDetails.textContent = error.message;
    elements.whatsappSimulator.hidden = true;
  }
}

async function loadDocuments() {
  clear(elements.documentList);
  elements.documentList.append(
    documentNode("p", "empty-state", "正在读取资料清单…")
  );

  try {
    const params = new URLSearchParams();
    const productSku = elements.documentProductSku.value.trim();

    if (productSku) {
      params.set("productSku", productSku);
    }

    const result = await api(
      `/api/knowledge/documents?${params}`,
      {},
      true
    );

    clear(elements.documentList);
    elements.documentCount.textContent =
      `${result.documents.length} 项`;

    if (result.documents.length === 0) {
      elements.documentList.append(
        documentNode(
          "p",
          "empty-state",
          "该产品还没有资料。选择文件后即可入库。"
        )
      );
      return;
    }

    for (const item of result.documents) {
      elements.documentList.append(createDocumentRow(item));
    }
  } catch (error) {
    clear(elements.documentList);
    elements.documentList.append(
      documentNode("p", "status-text error", error.message)
    );
  }
}

async function selectReview(review, button) {
  selectedReviewId = review.id;

  for (const item of elements.reviewList.children) {
    item.classList.remove("selected");
  }

  button.classList.add("selected");
  elements.reviewForm.hidden = false;
  elements.selectedReview.textContent =
    `reviewId: ${review.id}`;
  clear(elements.selectedLead);

  try {
    const lead = await api(
      `/api/leads/${encodeURIComponent(review.leadId)}`,
      {},
      true
    );

    elements.selectedLead.append(
      createResultCard(lead, [
        ["company", "公司"],
        ["contactEmail", "邮箱"],
        ["product", "产品"],
        ["quantity", "数量"],
        ["unit", "单位"],
        ["purity", "纯度"],
        ["incoterm", "Incoterm"],
        ["deliveryAddress", "交付地址"]
      ])
    );

    elements.coaStatus.value = lead.requestCoa
      ? "available"
      : "not_requested";
  } catch (error) {
    elements.selectedLead.textContent = error.message;
  }
}

elements.keyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = elements.adminKey.value.trim();
  sessionStorage.setItem("b2b-inquiry-agent-admin-key", key);
  elements.adminKey.value = "";
  setStatus(elements.keyStatus, "Key 已保存到当前标签页。", "success");
  void loadReviews();
  void loadWhatsAppStatus();
  void loadDocuments();
});

elements.documentFile.addEventListener("change", () => {
  const file = elements.documentFile.files[0];

  if (file && !elements.documentTitle.value.trim()) {
    elements.documentTitle.value = file.name.replace(/\.[^.]+$/, "");
  }
});

elements.refreshDocuments.addEventListener("click", () => {
  void loadDocuments();
});

elements.documentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = elements.documentFile.files[0];

  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    setStatus(
      elements.documentStatus,
      "文件超过 8 MB，未开始上传。",
      "error"
    );
    return;
  }

  const button = elements.documentForm.querySelector("button");
  button.disabled = true;
  setStatus(
    elements.documentStatus,
    "正在解析文档并建立检索索引…"
  );

  try {
    const result = await api(
      "/api/knowledge/documents",
      {
        method: "POST",
        body: JSON.stringify({
          productSku: elements.documentProductSku.value.trim(),
          documentType: elements.documentType.value,
          title: elements.documentTitle.value.trim(),
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: await fileToBase64(file)
        })
      },
      true
    );

    const imported = result.document;
    setStatus(
      elements.documentStatus,
      result.outcome === "duplicate"
        ? `该文件已经入库：v${imported.version}，未重复建立索引。`
        : `入库完成：v${imported.version}，已建立 ${imported.chunkCount} 个检索片段。`,
      "success"
    );
    elements.documentFile.value = "";
    await loadDocuments();
  } catch (error) {
    setStatus(elements.documentStatus, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

elements.knowledgeSearchForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    clear(elements.knowledgeSearchResults);

    const params = new URLSearchParams({
      query: elements.knowledgeSearchQuery.value.trim()
    });
    const productSku = elements.documentProductSku.value.trim();

    if (productSku) {
      params.set("productSku", productSku);
    }

    try {
      const result = await api(
        `/api/knowledge/search?${params}`,
        {},
        true
      );

      if (result.matches.length === 0) {
        elements.knowledgeSearchResults.append(
          documentNode(
            "p",
            "empty-state",
            "没有找到匹配片段。可尝试产品资料中的准确术语。"
          )
        );
        return;
      }

      for (const match of result.matches) {
        const article = documentNode("article", "knowledge-match");
        const header = document.createElement("header");
        header.append(
          documentNode(
            "strong",
            "",
            `${match.title} · v${match.version}`
          ),
          documentNode(
            "span",
            "",
            `${match.originalFilename} / 片段 ${match.chunkIndex + 1}`
          )
        );
        article.append(
          header,
          documentNode("p", "", match.content)
        );
        elements.knowledgeSearchResults.append(article);
      }
    } catch (error) {
      elements.knowledgeSearchResults.append(
        documentNode("p", "status-text error", error.message)
      );
    }
  }
);

elements.whatsappConnect.addEventListener("click", () => {
  void loadWhatsAppStatus();
});

elements.whatsappSimulator.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    const button = elements.whatsappSimulator.querySelector(
      "button"
    );
    button.disabled = true;
    elements.whatsappResult.className = "channel-result";
    elements.whatsappResult.textContent =
      "正在通过 WhatsApp Adapter 处理消息…";

    try {
      const result = await api(
        "/api/channels/whatsapp/simulate",
        {
          method: "POST",
          body: JSON.stringify({
            messageId: `wamid.simulator.${crypto.randomUUID()}`,
            from: elements.whatsappFrom.value.trim(),
            text: elements.whatsappMessage.value.trim()
          })
        },
        true
      );

      elements.whatsappResult.textContent =
        result.outcome === "duplicate"
          ? "该 messageId 已处理，系统已阻止重复调用。"
          : `处理完成 · conversationId: ${result.conversationId}\nAgent 回复：${result.reply}`;
    } catch (error) {
      elements.whatsappResult.className =
        "channel-result error";
      elements.whatsappResult.textContent =
        `处理失败：${error.message}`;
    } finally {
      button.disabled = false;
    }
  }
);

elements.newChat.addEventListener("click", () => {
  conversationId = crypto.randomUUID();
  clear(elements.chatLog);
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "新会话已建立。";
  elements.chatLog.append(empty);
  setConversationId();
});

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.chatMessage.value.trim();

  if (!message) return;

  appendMessage("customer", message);
  elements.chatMessage.value = "";

  const button = elements.chatForm.querySelector("button");
  button.disabled = true;

  try {
    const result = await api("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        message
      })
    });

    appendMessage("agent", result.reply);
  } catch (error) {
    appendMessage("agent", `请求失败：${error.message}`);
  } finally {
    button.disabled = false;
  }
});

elements.leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clear(elements.leadResults);

  const params = new URLSearchParams({
    email: elements.leadEmail.value.trim()
  });

  const product = elements.leadProduct.value.trim();
  if (product) params.set("product", product);

  try {
    const result = await api(
      `/api/leads?${params}`,
      {},
      true
    );

    if (result.leads.length === 0) {
      elements.leadResults.textContent = "没有找到匹配 Lead。";
      return;
    }

    for (const lead of result.leads) {
      elements.leadResults.append(
        createResultCard(lead, [
          ["id", "Lead ID"],
          ["company", "公司"],
          ["contactEmail", "邮箱"],
          ["country", "国家"],
          ["product", "产品"],
          ["quantity", "数量"],
          ["unit", "单位"],
          ["updatedAt", "更新时间"]
        ])
      );
    }
  } catch (error) {
    elements.leadResults.textContent = error.message;
  }
});

elements.refreshReviews.addEventListener("click", () => {
  void loadReviews();
});

elements.reviewDecision.addEventListener("change", () => {
  elements.commercialFields.hidden =
    elements.reviewDecision.value === "rejected";
});

elements.reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedReviewId) return;

  const approved = elements.reviewDecision.value === "approved";
  const notes = elements.reviewNotes.value.trim();

  const body = {
    decision: approved ? "approved" : "rejected",
    inventoryConfirmed: approved
      ? elements.inventoryConfirmed.value === "true"
      : null,
    unitPrice: approved && elements.unitPrice.value
      ? Number(elements.unitPrice.value)
      : null,
    currency: approved
      ? elements.currency.value.trim() || null
      : null,
    leadTimeDays: approved && elements.leadTimeDays.value
      ? Number(elements.leadTimeDays.value)
      : null,
    coaStatus: approved
      ? elements.coaStatus.value
      : null,
    reviewNotes: notes || null,
    reviewedBy: elements.reviewedBy.value.trim()
  };

  try {
    const result = await api(
      `/api/reviews/${encodeURIComponent(selectedReviewId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      true
    );

    if (result.outcome !== "decided") {
      throw new Error(`审核未完成：${result.outcome}`);
    }

    setStatus(elements.reviewStatus, "审核结果已保存。", "success");
    selectedReviewId = null;
    await loadReviews();
  } catch (error) {
    setStatus(elements.reviewStatus, error.message, "error");
  }
});

elements.quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clear(elements.quoteResult);
  elements.quoteSentForm.hidden = true;

  selectedQuoteNumber = elements.quoteNumber.value.trim();

  try {
    const quote = await api(
      `/api/quotes/${encodeURIComponent(selectedQuoteNumber)}`
    );

    elements.quoteResult.append(
      createResultCard(quote, [
        ["quoteNumber", "报价编号"],
        ["status", "状态"],
        ["product", "产品"],
        ["quantity", "数量"],
        ["unit", "单位"],
        ["unitPrice", "单价"],
        ["unitPriceBasis", "计价单位"],
        ["totalPrice", "总价"],
        ["currency", "币种"],
        ["incoterm", "Incoterm"],
        ["leadTimeDays", "交期（天）"],
        ["expiresAt", "有效期至"]
      ])
    );

    elements.quoteSentForm.hidden = quote.status !== "draft";
  } catch (error) {
    elements.quoteResult.textContent = error.message;
  }
});

elements.quoteSentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedQuoteNumber) return;

  try {
    const result = await api(
      `/api/quotes/${encodeURIComponent(selectedQuoteNumber)}/sent`,
      {
        method: "POST",
        body: JSON.stringify({
          validDays: Number(elements.validDays.value)
        })
      },
      true
    );

    clear(elements.quoteResult);
    elements.quoteResult.append(
      createResultCard(result.quote ?? result, [
        ["quoteNumber", "报价编号"],
        ["status", "状态"],
        ["sentAt", "发送时间"],
        ["expiresAt", "有效期至"]
      ])
    );
    elements.quoteSentForm.hidden = true;
  } catch (error) {
    elements.quoteResult.textContent = error.message;
  }
});

setConversationId();
void checkHealth();

if (adminKey()) {
  setStatus(elements.keyStatus, "当前标签页已有管理员 Key。", "success");
  void loadReviews();
  void loadWhatsAppStatus();
  void loadDocuments();
}
