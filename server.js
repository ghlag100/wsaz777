
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GEMINI_API_KEY;

const ai = API_KEY
  ? new GoogleGenAI({ apiKey: API_KEY })
  : null;

app.use(express.json({ limit: "18mb" }));
app.use(express.urlencoded({ extended: true }));

// Disponibiliza os arquivos do site
app.use(express.static(__dirname));

// Rota da imagem usada na tela de inicialização
app.get("/file_000000009618820e9a50407df0e56103.png", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "file_000000009618820e9a50407df0e56103.png"
    )
  );
});

// Instruções principais da WSAZ_777
const BASE_PROMPT = `
Você é a WSAZ_777, uma inteligência artificial assistente.

Seu objetivo é ajudar o usuário com:
- Estudos e conhecimentos gerais.
- Tecnologia e programação.
- Explicações e pesquisas.
- Criatividade e escrita.
- Dúvidas do cotidiano.

Responda sempre em português do Brasil, quando o usuário
não solicitar outro idioma.

Seja clara, útil, educada e natural.
Não invente informações quando não souber a resposta.
`;

// Estilos de resposta
const RESPONSE_STYLES = {
  concise: `
Responda de maneira resumida e direta.
Evite explicações desnecessariamente longas.
`,

  normal: `
Responda de maneira equilibrada.
Explique o necessário com clareza e organização.
`,

  detailed: `
Forneça respostas completas e bem explicadas.
Utilize exemplos e etapas quando forem úteis.
Organize a resposta para facilitar a compreensão.
`
};

// Endpoint principal da IA
app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "A chave GEMINI_API_KEY não foi configurada no servidor."
      });
    }

    const { message, image, responseStyle } = req.body || {};

    if (
      (typeof message !== "string" || !message.trim()) &&
      !image
    ) {
      return res.status(400).json({
        error: "Digite uma mensagem ou envie uma imagem."
      });
    }

    if (typeof message === "string" && message.length > 2000) {
      return res.status(400).json({
        error: "A mensagem ultrapassou o limite de 2000 caracteres."
      });
    }

    const style = RESPONSE_STYLES[responseStyle] ||
      RESPONSE_STYLES.normal;

    const parts = [
      {
        text:
          BASE_PROMPT +
          "\n\nESTILO DE RESPOSTA:\n" +
          style +
          "\n\nMENSAGEM DO USUÁRIO:\n" +
          (message?.trim() || "Analise a imagem enviada.")
      }
    ];

    // Processamento de imagem
    if (image) {
      if (typeof image !== "string") {
        return res.status(400).json({
          error: "Formato de imagem inválido."
        });
      }

      const match = image.match(
        /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/
      );

      if (!match) {
        return res.status(400).json({
          error: "Envie uma imagem JPG, PNG ou WEBP válida."
        });
      }

      const mimeType = match[1] === "jpg"
        ? "image/jpeg"
        : `image/${match[1]}`;

      const imageData = match[2].replace(/\s/g, "");

      parts.push({
        inlineData: {
          mimeType,
          data: imageData
        }
      });
    }

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts
        }
      ]
    });

    const reply = result.text;

    if (!reply) {
      return res.status(502).json({
        error: "A IA não retornou uma resposta."
      });
    }

    return res.json({ reply });

  } catch (error) {
    console.error("ERRO WSAZ_777:", error);

    return res.status(500).json({
      error: "Não foi possível processar sua solicitação. Tente novamente."
    });
  }
});

// Verificação do servidor
app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    system: "WSAZ_777",
    version: "5.3",
    ai: ai ? "configured" : "not_configured"
  });
});

// Inicialização
app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log(" WSAZ_777 AI SYSTEM");
  console.log(" Servidor iniciado na porta " + PORT);
  console.log(" Status: ONLINE");
  console.log("--------------------------------");
});
