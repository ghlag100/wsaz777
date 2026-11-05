
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));

app.use(express.static(path.join(root, "public")));
app.use(express.static(root));

const BASE_PROMPT = `
Você é o WSAZ_777, uma inteligência artificial de uso geral.
Responda em português brasileiro, salvo pedido contrário.
Seja natural, inteligente, educado, comunicativo e profissional.
Ajude com estudos, matemática, programação, tecnologia,
computadores, Android, jogos e conhecimentos gerais.
Não invente informações. Não apresente raciocínio interno.
Considere o contexto anterior.
Use títulos curtos e listas quando ajudarem.
Priorize segurança, privacidade e orientações legítimas.
`;

const RESPONSE_STYLES = {
  concise: "Responda de forma curta, direta e objetiva.",
  normal: "Explique com clareza, naturalidade e boa organização.",
  detailed: "Explique com profundidade, etapas e exemplos úteis."
};

const TIMEOUT_MS = 40000;

function extractAnswer(data) {
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .filter(item => item?.type === "text" && item.text)
      .map(item => item.text)
      .join("\n")
      .trim();
  }

  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  return "";
}

function safeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
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

async function readResponse(response) {
  const raw = await response.text();

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

async function requestAI(url, apiKey, body, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  const data = await readResponse(response);

  return { response, data };
}

function isTimeout(error) {
  return error?.name === "TimeoutError" ||
         error?.name === "AbortError";
}

function buildMessages(systemPrompt, history, text) {
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: text }
  ];
}

// =====================================
// NVIDIA - TEXTO
// =====================================

async function askNvidia(messages) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY não configurada.");
  }

  const model =
    process.env.NVIDIA_TEXT_MODEL ||
    "nvidia/nemotron-3-nano-30b-a3b";

  const result = await requestAI(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    apiKey,
    {
      model,
      messages,
      max_tokens: 900,
      temperature: 0.6,
      stream: false
    }
  );

  if (!result.response.ok) {
    const error = new Error(
      `NVIDIA HTTP ${result.response.status}`
    );

    error.status = result.response.status;
    error.data = result.data;
    throw error;
  }

  const answer = extractAnswer(result.data);

  if (!answer) {
    throw new Error("NVIDIA retornou uma resposta vazia.");
  }

  return answer;
}

// =====================================
// OPENROUTER - TEXTO ALTERNATIVO
// =====================================

async function askOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada.");
  }

  const model =
    process.env.OPENROUTER_TEXT_MODEL ||
    "openrouter/free";

  const result = await requestAI(
    "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    {
      model,
      messages,
      max_tokens: 900,
      temperature: 0.6
    },
    {
      "HTTP-Referer": "https://wsaz777.onrender.com",
      "X-OpenRouter-Title": "WSAZ_777"
    }
  );

  if (!result.response.ok) {
    const error = new Error(
      `OpenRouter HTTP ${result.response.status}`
    );

    error.status = result.response.status;
    error.data = result.data;
    throw error;
  }

  const answer = extractAnswer(result.data);

  if (!answer) {
    throw new Error("OpenRouter retornou uma resposta vazia.");
  }

  return answer;
}

// =====================================
// ROTAS
// =====================================

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    text: Boolean(
      process.env.NVIDIA_API_KEY ||
      process.env.OPENROUTER_API_KEY
    ),
    vision: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

// =====================================
// CHAT
// =====================================

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      images = [],
      history = [],
      responseStyle = "normal"
    } = req.body || {};

    const text = typeof message === "string"
      ? message.trim()
      : "";

    const selectedImages = Array.isArray(images)
      ? images
      : [];

    if (!text && !selectedImages.length) {
      return res.status(400).json({
        reply: "Digite uma pergunta ou envie uma imagem."
      });
    }

    if (text.length > 4000) {
      return res.status(400).json({
        reply: "Sua mensagem ultrapassou 4.000 caracteres."
      });
    }

    if (selectedImages.length > 5) {
      return res.status(400).json({
        reply: "Envie no máximo 5 imagens."
      });
    }

    for (const img of selectedImages) {
      if (
        typeof img !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(img) ||
        img.length > 2_000_000
      ) {
        return res.status(400).json({
          reply: "Uma das imagens é inválida ou muito grande."
        });
      }
    }

    const systemPrompt =
      `${BASE_PROMPT}\n\nESTILO:\n${
        RESPONSE_STYLES[responseStyle] ||
        RESPONSE_STYLES.normal
      }`;

    const previousMessages = safeHistory(history);

    // =====================================
    // IMAGENS - OPENROUTER
    // =====================================

    if (selectedImages.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "A chave da OpenRouter não está configurada."
        });
      }

      const content = [
        {
          type: "text",
          text: text || "Analise cuidadosamente as imagens enviadas."
        },
        ...selectedImages.map(url => ({
          type: "image_url",
          image_url: { url }
        }))
      ];

      const model =
        process.env.OPENROUTER_VISION_MODEL ||
        "nvidia/nemotron-3.5-super-vl:free";

      const result = await requestAI(
        "https://openrouter.ai/api/v1/chat/completions",
        apiKey,
        {
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt +
                "\nAnalise as imagens com cuidado."
            },
            ...previousMessages,
            { role: "user", content }
          ],
          max_tokens: 1000,
          temperature: 0.4
        },
        {
          "HTTP-Referer": "https://wsaz777.onrender.com",
          "X-OpenRouter-Title": "WSAZ_777"
        }
      );

      if (!result.response.ok) {
        console.error("ERRO OPENROUTER VISÃO:", {
          status: result.response.status,
          resposta: result.data
        });

        return res.status(502).json({
          reply: "Não consegui analisar a imagem. Tente novamente."
        });
      }

      const answer = extractAnswer(result.data);

      if (!answer) {
        return res.status(502).json({
          reply: "A IA não conseguiu interpretar a imagem."
        });
      }

      return res.json({ reply: answer });
    }

    // =====================================
    // TEXTO - NVIDIA + ALTERNATIVA
    // =====================================

    const messages = buildMessages(
      systemPrompt,
      previousMessages,
      text
    );

    let answer;

    if (process.env.NVIDIA_API_KEY) {
      try {
        console.log("Consultando NVIDIA...");

        answer = await askNvidia(messages);

        console.log("NVIDIA respondeu com sucesso.");

      } catch (error) {
        console.error("FALHA NVIDIA:", {
          nome: error.name,
          status: error.status,
          mensagem: error.message,
          resposta: error.data
        });

        if (!process.env.OPENROUTER_API_KEY) {
          throw error;
        }

        console.log("Tentando alternativa OpenRouter...");
      }
    }

    if (!answer && process.env.OPENROUTER_API_KEY) {
      try {
        answer = await askOpenRouter(messages);
        console.log("OpenRouter respondeu com sucesso.");
      } catch (error) {
        console.error("FALHA OPENROUTER:", {
          nome: error.name,
          status: error.status,
          mensagem: error.message,
          resposta: error.data
        });

        throw error;
      }
    }

    if (!answer) {
      return res.status(503).json({
        reply: "Nenhum serviço de IA está configurado."
      });
    }

    return res.json({ reply: answer });

  } catch (error) {
    console.error("ERRO SERVIDOR:", {
      nome: error.name,
      status: error.status,
      mensagem: error.message,
      resposta: error.data
    });

    if (isTimeout(error)) {
      return res.status(504).json({
        reply: "A IA demorou para responder. Tente novamente."
      });
    }

    if (error.status === 401 || error.status === 403) {
      return res.status(502).json({
        reply: "A chave da API é inválida ou não tem autorização."
      });
    }

    if (error.status === 429) {
      return res.status(502).json({
        reply: "Limite de solicitações atingido. Tente novamente mais tarde."
      });
    }

    return res.status(502).json({
      reply: "Não foi possível consultar a IA. Tente novamente."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WSAZ_777 ativo na porta ${PORT}`);
});
