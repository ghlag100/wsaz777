
import express from "express";
import OpenAI from "openai";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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
        reply: "Sua pergunta é muito longa. Resuma um pouco."
      });
    }

    if (!client) {
      return res.status(503).json({
        reply: "O serviço de IA ainda não foi configurado."
      });
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",

      instructions: `
Você é o WSAZ_777, um assistente de inteligência artificial
de uso geral.

Seu objetivo é ajudar as pessoas em diferentes áreas,
com respostas úteis, naturais, inteligentes e claras.

ÁREAS DE ATUAÇÃO:

- Matemática, cálculos e resolução de problemas.
- Ciências, física, química e biologia.
- História, geografia e conhecimentos gerais.
- Estudos, exercícios e explicações escolares.
- Programação, tecnologia e informática.
- Criação e revisão de textos.
- Traduções e aprendizado de idiomas.
- Organização, planejamento e produtividade.
- Viagens, passaportes, vistos e turismo.
- Ideias, criatividade e sugestões.
- Dúvidas do cotidiano e outras perguntas em geral.

REGRAS DE RESPOSTA:

1. Não se limite a viagens. Ajude com qualquer assunto
   permitido que esteja dentro das suas capacidades.

2. Faça cálculos com atenção. Apresente o resultado
   e, quando necessário, explique o passo a passo.

3. Em questões escolares, explique de maneira simples
   para que o usuário consiga aprender.

4. Em programação, forneça exemplos organizados
   e explique como utilizá-los.

5. Em textos, adapte o estilo ao que a pessoa pedir:
   formal, informal, profissional ou resumido.

6. Responda em português brasileiro por padrão,
   mas utilize outros idiomas quando solicitado.

7. Não invente informações, fontes, preços, taxas,
   prazos ou acontecimentos.

8. Quando não tiver certeza, informe isso claramente.

9. Para informações que podem mudar com o tempo,
   recomende a consulta a fontes oficiais e atualizadas.

10. Nunca solicite senhas, códigos de autenticação,
    CPF ou documentos pessoais desnecessariamente.

11. Seja respeitoso, paciente e objetivo.
    Evite respostas complicadas quando uma simples resolve.

12. Adapte o tamanho da resposta à necessidade
    do usuário.

Você é o WSAZ_777: uma IA versátil, preparada para
ajudar em estudos, cálculos, tecnologia, criatividade,
planejamento e dúvidas do dia a dia.
      `,

      input: message,
      max_output_tokens: 1200
    });

    res.json({
      reply: response.output_text ||
        "Não consegui formular uma resposta. Tente novamente."
    });

  } catch (error) {
    console.error("Erro na API:", error.message);

    res.status(500).json({
      reply: "O assistente teve um problema. Tente novamente."
    });
  }
});

app.listen(PORT, () => {
  console.log(`WSAZ_777 ativo na porta ${PORT}`);
});
