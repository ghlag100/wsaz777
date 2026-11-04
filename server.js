
import express from "express";
import OpenAI from "openai";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

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

    if (!client) {
      return res.status(503).json({
        reply: "A chave da API não foi configurada no servidor."
      });
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",

      instructions: `
Você é o WSAZ_777, uma inteligência artificial
de uso geral.

Ajude com matemática, estudos, programação,
tecnologia, textos, traduções, criatividade,
conhecimentos gerais, viagens e dúvidas cotidianas.

Responda em português brasileiro por padrão.
Explique cálculos passo a passo quando necessário.
Seja natural, inteligente, claro e objetivo.
Não invente informações.
      `,

      input: message,
      max_output_tokens: 1200
    });

    return res.json({
      reply: response.output_text ||
        "Não consegui gerar uma resposta."
    });

  } catch (error) {
    console.error("ERRO OPENAI:", {
      status: error.status,
      code: error.code,
      type: error.type,
      message: error.message
    });

    if (error.status === 401) {
      return res.status(502).json({
        reply: "Erro 401: a chave da API é inválida ou não está autorizada."
      });
    }

    if (error.status === 429) {
      return res.status(502).json({
        reply: "Erro 429: limite de uso ou crédito da API. Confira o faturamento."
      });
    }

    if (error.status === 404) {
      return res.status(502).json({
        reply: "Erro 404: modelo não encontrado ou indisponível."
      });
    }

    return res.status(502).json({
      reply: "Erro na conexão com a IA. Código: " +
        (error.status || "sem resposta HTTP") +
        ". Confira os logs do servidor."
    });
  }
});

app.listen(PORT, () => {
  console.log("WSAZ_777 ativo na porta " + PORT);
});
