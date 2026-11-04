
import express from "express";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

const SYSTEM_PROMPT =
  "Você é o WSAZ_777, uma IA de uso geral. Responda sempre em português brasileiro, de forma clara, natural e objetiva. Ajude com estudos, matemática, programação, tecnologia e conhecimentos gerais. Não invente informações e não apresente raciocínio interno.";

function extractAnswer(data) {
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw === "string") return raw.trim();

  if (Array.isArray(raw)) {
    return raw
      .filter(item => item.type === "text" && item.text)
      .map(item => item.text)
      .join("\n")
      .trim();
  }

  return "";
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, image } = req.body || {};

    if (
      (!message || typeof message !== "string" || !message.trim()) &&
      !image
    ) {
      return res.status(400).json({
        reply: "Digite uma pergunta ou envie uma imagem."
      });
    }

    if (typeof message === "string" && message.length > 2000) {
      return res.status(400).json({
        reply: "Sua mensagem ultrapassou o limite de 2000 caracteres."
      });
    }

    let response;
    let data;
    let service;

    // =====================================
    // 1. ANÁLISE DE IMAGENS - OPENROUTER
    // =====================================

    if (image) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      const model =
        process.env.OPENROUTER_VISION_MODEL ||
        "nvidia/nemotron-3.5-super-vl:free";

      if (!apiKey) {
        return res.status(503).json({
          reply: "A chave da OpenRouter não está configurada."
        });
      }

      if (
        typeof image !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(image) ||
        image.length > 6_000_000
      ) {
        return res.status(400).json({
          reply: "Imagem inválida ou muito grande. Envie uma foto menor."
        });
      }

      const content = [
        {
          type: "text",
          text: message?.trim() ||
            "Analise esta imagem e descreva seu conteúdo."
        },
        {
          type: "image_url",
          image_url: { url: image }
        }
      ];

      service = "OPENROUTER - VISÃO";

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
            model,
            messages: [
              {
                role: "system",
                content:
                  SYSTEM_PROMPT +
                  " Você também é especialista em interpretar imagens, fotografias, documentos, gráficos e exercícios. Leia cuidadosamente o conteúdo visível."
              },
              {
                role: "user",
                content
              }
            ],
            max_tokens: 1200,
            temperature: 0.4
          })
        }
      );
    }

    // =====================================
    // 2. TEXTO - NVIDIA NEMOTRON
    // =====================================

    else {
      const apiKey = process.env.NVIDIA_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "A chave da NVIDIA não está configurada."
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
            model: "nvidia/nemotron-3-ultra-550b-a55b",
            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              {
                role: "user",
                content: message.trim()
              }
            ],
            max_tokens: 1200,
            temperature: 0.6,
            stream: false,
            chat_template_kwargs: {
              enable_thinking: false,
              force_nonempty_content: true
            }
          })
        }
      );
    }

    // =====================================
    // 3. TRATAMENTO DAS RESPOSTAS
    // =====================================

    data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        `ERRO ${service}:`,
        response.status,
        data.error?.message || JSON.stringify(data).slice(0, 1500)
      );

      let reply = "Não foi possível consultar a inteligência artificial.";

      if (response.status === 401) {
        reply = "A configuração da API está inválida.";
      } else if (response.status === 402) {
        reply = "O serviço está sem créditos disponíveis.";
      } else if (response.status === 429) {
        reply = "Limite de solicitações atingido. Tente novamente mais tarde.";
      } else if (response.status === 400) {
        reply = "A API recusou a solicitação. Verifique o modelo e os dados enviados.";
      } else if (response.status >= 500) {
        reply = "O serviço de inteligência artificial está temporariamente indisponível.";
      }

      return res.status(502).json({ reply });
    }

    const answer = extractAnswer(data);

    if (!answer) {
      console.error(
        `RESPOSTA VAZIA ${service}:`,
        JSON.stringify(data).slice(0, 1500)
      );

      return res.status(502).json({
        reply: "A IA não conseguiu gerar uma resposta. Tente novamente."
      });
    }

    console.log(`${service}: resposta concluída.`);

    return res.json({ reply: answer });

  } catch (error) {
    console.error("ERRO SERVIDOR:", error);

    return res.status(500).json({
      reply: "Erro interno ao processar sua solicitação."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("WSAZ_777 ativo na porta " + PORT);
});
