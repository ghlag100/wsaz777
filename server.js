
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "12mb" }));
app.use(express.static(ROOT));

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const NVIDIA_MODEL =
  process.env.NVIDIA_TEXT_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";

const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL || "nvidia/nemotron-3.5-super-vl:free";

const SYSTEM_PROMPT = `
Você é a inteligência artificial oficial do WSAZ_777.
Seu nome é Neural Core.
Responda em português brasileiro, com clareza, personalidade e objetividade.
Use emojis moderadamente.
Ajude com tecnologia, computadores, celulares, programação e dúvidas gerais.
Nunca invente resultados de otimização ou diga que alterou um dispositivo sem ter feito isso.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string"
    )
    .slice(-12)
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 4000)
    }));
}

function validateImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .filter(image =>
      typeof image === "string" &&
      /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image) &&
      image.length <= 2000000
    )
    .slice(0, 5);
}

async function requestAI(url, apiKey, body, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        `Erro HTTP ${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const answer = data?.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("A IA não retornou uma resposta válida.");
    }

    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function askNvidia(messages) {
  if (!process.env.NVIDIA_API_KEY) {
    throw new Error("NVIDIA_API_KEY não configurada no Render.");
  }

  const body = {
    model: NVIDIA_MODEL,
    messages,
    temperature: 0.6,
    top_p: 0.9,
    max_tokens: 1800,
    stream: false
  };

  return requestAI(
    NVIDIA_URL,
    process.env.NVIDIA_API_KEY,
    body
  );
}

async function askOpenRouter(messages) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY não configurada no Render.");
  }

  return requestAI(
    OPENROUTER_URL,
    process.env.OPENROUTER_API_KEY,
    {
      model: VISION_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 1800,
      stream: false
    },
    {
      "HTTP-Referer": "https://wsaz777.onrender.com",
      "X-Title": "WSAZ_777 Neural Core"
    }
  );
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    project: "WSAZ_777 Neural Core",
    nvidia: Boolean(process.env.NVIDIA_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      image = null,
      images = [],
      history = [],
      responseStyle = "normal"
    } = req.body || {};

    const text = String(message).trim().slice(0, 4000);
    const allImages = validateImages([
      ...(Array.isArray(images) ? images : []),
      ...(typeof image === "string" ? [image] : [])
    ]);

    if (!text && allImages.length === 0) {
      return res.status(400).json({
        error: "Digite uma mensagem ou envie uma imagem."
      });
    }

    const styleInstruction = {
      short: "Responda de forma curta e direta.",
      detailed: "Explique com mais detalhes e exemplos.",
      normal: "Responda de maneira equilibrada."
    }[responseStyle] || "Responda de maneira equilibrada.";

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT + "\n" + styleInstruction
      },
      ...cleanHistory(history)
    ];

    if (allImages.length > 0) {
      const content = [];

      if (text) {
        content.push({
          type: "text",
          text
        });
      } else {
        content.push({
          type: "text",
          text: "Analise a imagem enviada e explique o que você consegue identificar."
        });
      }

      for (const url of allImages) {
        content.push({
          type: "image_url",
          image_url: { url }
        });
      }

      messages.push({
        role: "user",
        content
      });

      const answer = await askOpenRouter(messages);

      return res.json({
        success: true,
        answer,
        provider: "OpenRouter",
        model: VISION_MODEL
      });
    }

    messages.push({
      role: "user",
      content: text
    });

    const answer = await askNvidia(messages);

    return res.json({
      success: true,
      answer,
      provider: "NVIDIA",
      model: NVIDIA_MODEL
    });

  } catch (error) {
    console.error("ERRO NEURAL CORE:", error);

    let status = error.status || 500;
    let message = error.message || "Erro interno na inteligência artificial.";

    if (error.name === "AbortError") {
      status = 504;
      message = "A IA demorou demais para responder. Tente novamente.";
    }

    if (status === 401) {
      message = "Chave de API inválida. Confira as variáveis no Render.";
    } else if (status === 402) {
      message = "A conta da API precisa de créditos ou faturamento ativo.";
    } else if (status === 429) {
      message = "Limite de solicitações atingido. Aguarde um pouco.";
    } else if (status === 400) {
      message = "A API recusou a solicitação. Confira o modelo configurado.";
    }

    return res.status(status).json({
      success: false,
      error: message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log(`WSAZ_777 Neural Core online na porta ${PORT}`);
});
