
import express from "express";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        reply: "Digite uma pergunta válida."
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        reply: "Sua pergunta é muito longa."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        reply: "A chave do OpenRouter não foi configurada."
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://wsaz777.onrender.com",
          "X-OpenRouter-Title": "WSAZ_777"
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "openrouter/free",
          messages: [
            {
              role: "system",
              content: `
Você é o WSAZ_777, uma inteligência artificial de uso geral.

Ajude com matemática, estudos, programação, tecnologia,
textos, traduções, criatividade, conhecimentos gerais,
viagens e dúvidas cotidianas.

Responda em português brasileiro por padrão.
Explique cálculos passo a passo quando necessário.
Seja natural, inteligente, claro e objetivo.
Não invente informações.
              `
            },
            {
              role: "user",
              content: message
            }
          ],
          max_tokens: 1200
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("ERRO OPENROUTER:", {
        status: response.status,
        message: data.error?.message
      });

      if (response.status === 401) {
        return res.status(502).json({
          reply: "Chave do OpenRouter inválida ou não autorizada."
        });
      }

      if (response.status === 402) {
        return res.status(502).json({
          reply: "Saldo ou créditos insuficientes na conta."
        });
      }

      if (response.status === 429) {
        return res.status(502).json({
          reply: "Limite de requisições atingido. Tente novamente mais tarde."
        });
      }

      return res.status(502).json({
        reply: "O OpenRouter não conseguiu processar sua solicitação."
      });
    }

    const answer = data.choices?.[0]?.message?.content;

    return res.json({
      reply: typeof answer === "string" && answer.trim()
        ? answer
        : "Não consegui gerar uma resposta."
    });

  } catch (error) {
    console.error("ERRO NO SERVIDOR:", error.message);

    return res.status(502).json({
      reply: "Erro de conexão com a inteligência artificial."
    });
  }
});

app.listen(PORT, () => {
  console.log("WSAZ_777 ativo na porta " + PORT);
});
