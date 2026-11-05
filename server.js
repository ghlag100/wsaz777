
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "12mb" }));
app.use(express.static(root));

const BASE_PROMPT = `
Você é o WSAZ_777, uma inteligência artificial de uso geral.
Responda em português brasileiro, com clareza, educação e organização.
Ajude com tecnologia, programação, estudos, computadores, Android e jogos.
Não invente informações e não apresente raciocínio interno.
`;

const RESPONSE_STYLES = {
  concise: "Responda de forma curta e objetiva.",
  normal: "Explique com clareza e organização.",
  detailed: "Explique com profundidade e exemplos úteis."
};

// TOKENS
// Protótipo em memória: reiniciar o servidor apaga as Keys.
const tokens = new Map();
const TOKEN_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

function createToken() {
  return "WSAZ-777-" +
    crypto.randomBytes(3).toString("hex").toUpperCase() +
    "-" +
    crypto.randomBytes(3).toString("hex").toUpperCase();
}

function safeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history.slice(-12)
    .filter(item =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string" &&
      item.content.trim()
    )
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 5000)
    }));
}

function extractAnswer(data) {
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw === "string") return raw.trim();

  if (Array.isArray(raw)) {
    return raw
      .filter(item => item?.type === "text" && item.text)
      .map(item => item.text)
      .join("\n")
      .trim();
  }

  return "";
}

// STATUS
app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    text: Boolean(process.env.NVIDIA_API_KEY),
    vision: Boolean(process.env.OPENROUTER_API_KEY),
    tokens: "online"
  });
});

// GERAR KEY — SOMENTE ADMINISTRADOR
app.post("/api/tokens/generate", (req, res) => {
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    return res.status(503).json({
      error: "Configure ADMIN_KEY nas variáveis do Render."
    });
  }

  if (req.get("x-admin-key") !== adminKey) {
    return res.status(403).json({
      error: "Autorização administrativa inválida."
    });
  }

  const { product } = req.body || {};

  if (!["pc", "celular"].includes(product)) {
    return res.status(400).json({
      error: "Selecione PC ou celular."
    });
  }

  let token;

  do {
    token = createToken();
  } while (tokens.has(token));

  tokens.set(token, {
    product,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_EXPIRATION
  });

  res.json({
    success: true,
    token,
    product,
    expiresIn: "7 dias"
  });
});

// VALIDAR KEY
app.post("/api/tokens/validate", (req, res) => {
  const { token, product } = req.body || {};

  if (
    typeof token !== "string" ||
    !["pc", "celular"].includes(product)
  ) {
    return res.status(400).json({
      valid: false,
      message: "Dados inválidos."
    });
  }

  const normalized = token.trim().toUpperCase();
  const saved = tokens.get(normalized);

  if (!saved) {
    return res.status(404).json({
      valid: false,
      message: "Key não encontrada."
    });
  }

  if (Date.now() > saved.expiresAt) {
    tokens.delete(normalized);

    return res.status(410).json({
      valid: false,
      message: "Esta Key expirou."
    });
  }

  if (saved.product !== product) {
    return res.status(403).json({
      valid: false,
      message: "Esta Key pertence a outra otimização."
    });
  }

  return res.json({
    valid: true,
    product: saved.product,
    message: "Key validada com sucesso!"
  });
});

// CHAT NVIDIA / OPENROUTER
app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      image,
      images = [],
      history = [],
      responseStyle = "normal"
    } = req.body || {};

    const text = typeof message === "string"
      ? message.trim()
      : "";

    const selectedImages = Array.isArray(images)
      ? [...images]
      : [];

    if (image && typeof image === "string") {
      selectedImages.push(image);
    }

    if (!text && selectedImages.length === 0) {
      return res.status(400).json({
        reply: "Digite uma pergunta ou envie uma imagem."
      });
    }

    if (text.length > 4000 || selectedImages.length > 5) {
      return res.status(400).json({
        reply: "Limite de mensagem ou imagens ultrapassado."
      });
    }

    for (const img of selectedImages) {
      if (
        typeof img !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(img) ||
        img.length > 2_000_000
      ) {
        return res.status(400).json({
          reply: "Imagem inválida ou muito grande."
        });
      }
    }

    const style = RESPONSE_STYLES[responseStyle]
      || RESPONSE_STYLES.normal;

    const systemPrompt = `${BASE_PROMPT}\n${style}`;

    const previousMessages = safeHistory(history);

    let response;
    let service;

    if (selectedImages.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "OpenRouter não configurada no Render."
        });
      }

      service = "OPENROUTER";

      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://wsaz777.onrender.com",
            "X-OpenRouter-Title": "WSAZ_777"
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_VISION_MODEL ||
              "nvidia/nemotron-3.5-super-vl:free",
            messages: [
              {
                role: "system",
                content: systemPrompt +
                  "\nVocê também interpreta imagens."
              },
              ...previousMessages,
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: text || "Analise as imagens."
                  },
                  ...selectedImages.map(url => ({
                    type: "image_url",
                    image_url: { url }
                  }))
                ]
              }
            ],
            max_tokens: 1400,
            temperature: 0.4
          }),
          signal: AbortSignal.timeout(90000)
        }
      );
    } else {
      const apiKey = process.env.NVIDIA_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "NVIDIA não configurada no Render."
        });
      }

      service = "NVIDIA";

      response = await fetch(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: process.env.NVIDIA_TEXT_MODEL ||
              "nvidia/nemotron-3-ultra-550b-a55b",
            messages: [
              { role: "system", content: systemPrompt },
              ...previousMessages,
              { role: "user", content: text }
            ],
            max_tokens: 1400,
            temperature: 0.6,
            stream: false,
            chat_template_kwargs: {
              enable_thinking: false,
              force_nonempty_content: true
            }
          }),
          signal: AbortSignal.timeout(90000)
        }
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(service, response.status, data?.error);

      return res.status(502).json({
        reply: response.status === 429
          ? "Limite de solicitações atingido."
          : "Não foi possível consultar a inteligência artificial."
      });
    }

    const answer = extractAnswer(data);

    if (!answer) {
      return res.status(502).json({
        reply: "A IA não conseguiu gerar uma resposta."
      });
    }

    return res.json({ reply: answer });

  } catch (error) {
    console.error("ERRO:", error);

    return res.status(500).json({
      reply: "Erro interno ao processar a solicitação."
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WSAZ_777 ativo na porta ${PORT}`);
});
