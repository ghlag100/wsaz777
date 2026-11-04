
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
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";

    if (!apiKey) {
      return res.status(503).json({
        reply: "A chave do OpenRouter não foi configurada."
      });
    }

    if ((!message || typeof message !== "string" || !message.trim()) && !image) {
      return res.status(400).json({
        reply: "Digite uma pergunta ou envie uma imagem."
      });
    }

    if (typeof message === "string" && message.length > 2000) {
      return res.status(400).json({
        reply: "Sua mensagem ultrapassou o limite de 2000 caracteres."
      });
    }

    const content = [
      {
        type: "text",
        text: message?.trim() || "Descreva esta imagem de forma objetiva."
      }
    ];

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
          model,
          messages: [
            {
              role: "system",
              content:
                "Você é o WSAZ_777, uma IA de uso geral. Responda em português brasileiro, de forma clara, objetiva e natural. Ajude com estudos, programação, tecnologia e conhecimentos gerais. Ao receber imagens, analise o conteúdo visível e responda à pergunta. Seja conciso, não apresente raciocínio interno e não invente informações."
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        "ERRO OPENROUTER:",
        response.status,
        data.error?.message || JSON.stringify(data).slice(0, 1500)
      );

      let reply = "Erro ao consultar a inteligência artificial.";

      if (response.status === 429) {
        reply = "Limite de uso atingido. Tente novamente mais tarde.";
      } else if (response.status === 402) {
        reply = "O modelo está sem créditos disponíveis.";
      } else if (response.status === 401) {
        reply = "A configuração da API está inválida.";
      }

      return res.status(502).json({ reply });
    }

    const choice = data.choices?.[0];
    const rawAnswer = choice?.message?.content;

    let answer = "";

    if (typeof rawAnswer === "string") {
      answer = rawAnswer;
    } else if (Array.isArray(rawAnswer)) {
      answer = rawAnswer
        .filter(item => item.type === "text" && item.text)
        .map(item => item.text)
        .join("\n");
    }

    if (!answer.trim()) {
      console.error(
        "RESPOSTA INVÁLIDA DO OPENROUTER:",
        JSON.stringify(data).slice(0, 2000)
      );

      return res.status(502).json({
        reply:
          choice?.finish_reason === "length"
            ? "A resposta ultrapassou o limite disponível. Tente fazer uma pergunta mais específica."
            : "Não consegui gerar uma resposta válida. Tente novamente."
      });
    }

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
