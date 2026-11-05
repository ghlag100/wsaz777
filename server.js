import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  createHash,
  timingSafeEqual
} from "node:crypto";
import fs from "node:fs/promises";

const app = express();
const PORT = process.env.PORT || 3000;

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");

const tokenFile =
  process.env.TOKEN_STORE_PATH ||
  path.join(root, "data", "tokens.json");

app.disable("x-powered-by");

app.use(express.json({ limit: "12mb" }));
app.use(express.static(publicDir));
app.use(express.static(root));

const BASE_PROMPT = `
Você é o WSAZ_777, uma inteligência artificial de uso geral.

Responda em português brasileiro, salvo pedido contrário.
Seja natural, inteligente, educado, comunicativo e profissional.

Ajude com:
- Estudos
- Matemática
- Programação
- Tecnologia
- Computadores
- Android
- Jogos
- Conhecimentos gerais

Não invente informações.
Não apresente raciocínio interno.
Considere o contexto anterior.
Use títulos curtos, parágrafos objetivos e listas quando ajudarem.
Em códigos, explique onde colocar.
Priorize segurança, privacidade e orientações legítimas.
`;

const RESPONSE_STYLES = {
  concise: "Responda de forma curta, direta e objetiva.",

  normal: "Explique com clareza, naturalidade e boa organização.",

  detailed:
    "Explique com profundidade, etapas e exemplos úteis, sem repetições."
};

function extractAnswer(data) {
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .filter(x => x?.type === "text" && x.text)
      .map(x => x.text)
      .join("\n")
      .trim();
  }

  return "";
}

function safeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .filter(x =>
      x &&
      ["user", "assistant"].includes(x.role) &&
      typeof x.content === "string" &&
      x.content.trim()
    )
    .map(x => ({
      role: x.role,
      content: x.content.slice(0, 5000)
    }));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  return aa.length === bb.length &&
    timingSafeEqual(aa, bb);
}

// STATUS DO SISTEMA

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    text: Boolean(process.env.NVIDIA_API_KEY),
    vision: Boolean(process.env.OPENROUTER_API_KEY),
    tokens: true
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

// SISTEMA DE CHAT

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      image,
      images = [],
      history = [],
      responseStyle = "normal"
    } = req.body || {};

    const text =
      typeof message === "string"
        ? message.trim()
        : "";

    const selectedImages =
      Array.isArray(images) ? [...images] : [];

    if (image && typeof image === "string") {
      selectedImages.push(image);
    }

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
        reply: "Envie no máximo 5 imagens por mensagem."
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

    const systemPrompt = `
${BASE_PROMPT}

ESTILO:
${RESPONSE_STYLES[responseStyle] ||
  RESPONSE_STYLES.normal}
`;

    const previousMessages = safeHistory(history);

    let response;
    let service;

    // OPENROUTER - VISÃO

    if (selectedImages.length) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply:
            "A chave da OpenRouter não está configurada no Render."
        });
      }

      const content = [
        {
          type: "text",
          text:
            text ||
            "Analise cuidadosamente as imagens enviadas."
        },

        ...selectedImages.map(url => ({
          type: "image_url",
          image_url: { url }
        }))
      ];

      service = "OPENROUTER - VISÃO";

      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              "https://wsaz777.onrender.com",
            "X-OpenRouter-Title": "WSAZ_777"
          },

          body: JSON.stringify({
            model:
              process.env.OPENROUTER_VISION_MODEL ||
              "nvidia/nemotron-3.5-super-vl:free",

            messages: [
              {
                role: "system",
                content:
                  systemPrompt +
                  "\nInterprete imagens com cuidado e descreva apenas o que conseguir observar."
              },

              ...previousMessages,

              {
                role: "user",
                content
              }
            ],

            max_tokens: 1400,
            temperature: 0.4
          }),

          signal: AbortSignal.timeout(90000)
        }
      );

    } else {

      // NVIDIA - TEXTO

      const apiKey = process.env.NVIDIA_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply:
            "A chave da NVIDIA não está configurada no Render."
        });
      }

      service = "NVIDIA - TEXTO";

      response = await fetch(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            model:
              process.env.NVIDIA_TEXT_MODEL ||
              "nvidia/nemotron-3-ultra-550b-a55b",

            messages: [
              {
                role: "system",
                content: systemPrompt
              },

              ...previousMessages,

              {
                role: "user",
                content: text
              }
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
      console.error(
        `ERRO ${service}:`,
        response.status,
        data?.error?.message || ""
      );

      let reply =
        "Não foi possível consultar a inteligência artificial.";

      if (response.status === 401) {
        reply = "A configuração da API está inválida.";
      } else if (response.status === 402) {
        reply = "O serviço está sem créditos disponíveis.";
      } else if (response.status === 429) {
        reply =
          "Limite de solicitações atingido. Tente novamente mais tarde.";
      } else if (response.status >= 500) {
        reply =
          "O serviço de IA está temporariamente indisponível.";
      }

      return res.status(502).json({ reply });
    }

    const answer = extractAnswer(data);

    if (!answer) {
      return res.status(502).json({
        reply:
          "A IA não conseguiu gerar uma resposta. Tente novamente."
      });
    }

    console.log(
      `${service}: resposta concluída. Estilo: ${responseStyle}`
    );

    res.json({ reply: answer });

  } catch (error) {
    console.error("ERRO SERVIDOR:", error);

    const timeout = [
      "TimeoutError",
      "AbortError"
    ].includes(error?.name);

    res.status(timeout ? 504 : 500).json({
      reply: timeout
        ? "A solicitação demorou demais. Tente novamente."
        : "Erro interno ao processar sua solicitação."
    });
  }
});

// TOKEN CENTER

async function readTokens() {
  try {
    return JSON.parse(
      await fs.readFile(tokenFile, "utf8")
    );
  } catch {
    return [];
  }
}

async function writeTokens(tokens) {
  await fs.mkdir(
    path.dirname(tokenFile),
    { recursive: true }
  );

  await fs.writeFile(
    tokenFile,
    JSON.stringify(tokens, null, 2),
    { mode: 0o600 }
  );
}

function tokenHash(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function requireAdmin(req, res, next) {
  const secret = process.env.TOKEN_ADMIN_KEY;

  if (!secret) {
    return res.status(503).json({
      error:
        "Configure TOKEN_ADMIN_KEY nas variáveis do Render."
    });
  }

  const provided = req.get("x-admin-key");

  if (!safeEqual(provided, secret)) {
    return res.status(401).json({
      error: "Chave administrativa inválida."
    });
  }

  next();
}

// GERAR TOKEN

app.post(
  "/api/tokens/generate",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        product = "recurso",
        days = 30,
        maxUses = 1
      } = req.body || {};

      const validDays = Math.max(
        1,
        Math.min(365, Number(days) || 30)
      );

      const uses = Math.max(
        1,
        Math.min(100, Number(maxUses) || 1)
      );

      const token =
        `WSAZ-777-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

      const tokens = await readTokens();

      tokens.push({
        hash: tokenHash(token),
        product: String(product).slice(0, 60),
        createdAt: new Date().toISOString(),

        expiresAt: new Date(
          Date.now() + validDays * 86400000
        ).toISOString(),

        maxUses: uses,
        uses: 0,
        active: true
      });

      await writeTokens(tokens);

      res.status(201).json({
        token,
        product,
        expiresInDays: validDays,
        maxUses: uses
      });

    } catch (error) {
      console.error("TOKEN GENERATION:", error);

      res.status(500).json({
        error: "Não foi possível gerar o token."
      });
    }
  }
);

// VALIDAR TOKEN

app.post("/api/tokens/validate", async (req, res) => {
  try {
    const token =
      typeof req.body?.token === "string"
        ? req.body.token.trim().toUpperCase()
        : "";

    if (
      !/^WSAZ-777-[A-F0-9]{6}-[A-F0-9]{6}$/.test(token)
    ) {
      return res.status(400).json({
        valid: false,
        message: "Formato de token inválido."
      });
    }

    const tokens = await readTokens();

    const item = tokens.find(x =>
      safeEqual(x.hash, tokenHash(token))
    );

    if (!item || !item.active) {
      return res.status(404).json({
        valid: false,
        message: "Token não encontrado ou desativado."
      });
    }

    if (Date.now() > Date.parse(item.expiresAt)) {
      return res.status(410).json({
        valid: false,
        message: "Este token expirou."
      });
    }

    if (item.uses >= item.maxUses) {
      return res.status(409).json({
        valid: false,
        message: "Limite de utilizações atingido."
      });
    }

    item.uses += 1;

    await writeTokens(tokens);

    res.json({
      valid: true,
      product: item.product,
      usesRemaining: item.maxUses - item.uses,
      expiresAt: item.expiresAt
    });

  } catch (error) {
    console.error("TOKEN VALIDATION:", error);

    res.status(500).json({
      valid: false,
      message: "Erro ao validar token."
    });
  }
});

// INICIALIZAÇÃO

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `WSAZ_777 ativo na porta ${PORT}`
  );
});
