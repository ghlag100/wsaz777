
import express from "express";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, image } = req.body || {};
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        reply: "A chave do OpenRouter não foi configurada."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      if (!image) {
        return res.status(400).json({
          reply: "Digite uma pergunta ou envie uma imagem."
        });
      }
    }

    if (message && message.length > 2000) {
      return res.status(400).json({
        reply: "Sua mensagem é muito longa."
      });
    }

    const content = [];

    content.push({
      type: "text",
      text: message?.trim() || "Descreva esta imagem detalhadamente."
    });

    if (image) {
      if (
        typeof image !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(image) ||
        image.length > 6_000_000
      ) {
        return res.status(400).json({
          reply: "Imagem inválida ou muito grande. Envie uma foto menor."
        });
      }

      content.push({
        type: "image_url",
        image_url: { url: image }
      });
    }

    const response = await fetch(
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
          model: process.env.OPENROUTER_MODEL || "openrouter/free",
          messages: [
            {
              role: "system",
              content:
                "Você é o WSAZ_777, uma IA de uso geral. Responda em português brasileiro, com clareza, precisão e naturalidade. Ajude com estudos, matemática, programação, tecnologia, textos e conhecimentos gerais. Quando receber uma imagem, descreva o que realmente consegue observar e responda à pergunta do usuário. Não invente detalhes."
            },
            {
              role: "user",
              content
            }
          ],
          max_tokens: 700,
          temperature: 0.6
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENROUTER:", response.status, data.error?.message);

      return res.status(502).json({
        reply: response.status === 429
          ? "Limite de uso atingido. Tente novamente mais tarde."
          : response.status === 402
          ? "Créditos insuficientes para esse modelo."
          : response.status === 401
          ? "A chave do OpenRouter é inválida."
          : "Erro ao consultar a inteligência artificial."
      });
    }

    const answer = data.choices?.[0]?.message?.content;

    return res.json({
      reply: typeof answer === "string"
        ? answer
        : "Não consegui gerar uma resposta."
    });

  } catch (error) {
    console.error("ERRO SERVIDOR:", error.message);

    return res.status(500).json({
      reply: "Erro interno. Tente novamente."
    });
  }
});

app.listen(PORT, () => {
  console.log("WSAZ_777 ativo na porta " + PORT);
});
