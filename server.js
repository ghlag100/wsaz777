
import express from "express";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
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

    if (!ai) {
      return res.status(503).json({
        reply: "A chave do Gemini não foi configurada no servidor."
      });
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: message,
      config: {
        systemInstruction: `
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
        maxOutputTokens: 1200
      }
    });

    return res.json({
      reply: response.text || "Não consegui gerar uma resposta."
    });

  } catch (error) {
    const status = Number(error.status || error.code) || 0;

    console.error("ERRO GEMINI:", {
      status,
      message: error.message
    });

    if (status === 400 || status === 403) {
      return res.status(502).json({
        reply: "Erro na chave, nas permissões ou na configuração do Gemini."
      });
    }

    if (status === 429) {
      return res.status(502).json({
        reply: "Limite de uso do Gemini atingido. Confira as cotas da API."
      });
    }

    if (status === 404) {
      return res.status(502).json({
        reply: "Modelo Gemini não encontrado ou indisponível."
      });
    }

    return res.status(502).json({
      reply: "Erro na conexão com o Gemini. Confira os logs do servidor."
    });
  }
});

app.listen(PORT, () => {
  console.log("WSAZ_777 ativo na porta " + PORT);
});
