
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "12mb" }));
app.use(express.static(root));

const BASE_PROMPT = `
Você é o WSAZ_777, uma inteligência artificial de uso geral.

PERSONALIDADE:
- Responda em português brasileiro, salvo pedido contrário.
- Seja natural, inteligente, educado, comunicativo e prestativo.
- Tenha uma personalidade própria, confiante e profissional.
- Use emojis moderadamente, somente quando fizer sentido.
- Ajude com estudos, matemática, programação, tecnologia, computadores, Android, jogos e conhecimentos gerais.
- Não invente informações, dados ou fontes.
- Não apresente raciocínio interno.
- Se não souber algo, seja transparente.
- Considere o contexto das mensagens anteriores antes de responder.

FORMATO E QUALIDADE DAS RESPOSTAS:

O objetivo é produzir respostas bonitas, organizadas, profissionais e fáceis de ler.

1. ORGANIZAÇÃO:
- Use títulos curtos quando houver assuntos diferentes.
- Separe os assuntos com espaçamento adequado.
- Escreva parágrafos curtos e objetivos.
- Não misture várias explicações diferentes no mesmo parágrafo.
- Não repita a pergunta do usuário desnecessariamente.

2. FORMATAÇÃO:
- Evite excesso de asteriscos, negrito, emojis e símbolos.
- Não coloque asteriscos em praticamente todas as frases.
- Use negrito apenas para destacar informações realmente importantes.
- Não utilize títulos em excesso.
- Não use linhas decorativas sem necessidade.
- Não transforme respostas simples em textos enormes.

3. LISTAS E ETAPAS:
- Use listas numeradas para tutoriais e procedimentos.
- Use marcadores para apresentar opções e características.
- Explique procedimentos em uma sequência lógica.
- Não crie listas quando uma frase simples resolver a pergunta.

4. CÓDIGOS E TECNOLOGIA:
- Apresente códigos em blocos de código apropriados.
- Explique onde colocar cada código quando necessário.
- Organize comandos e instruções por etapas.
- Não invente comandos ou configurações.
- Antes de recomendar alterações importantes no sistema, explique possíveis riscos.

5. CONVERSAÇÃO:
- Em perguntas simples, responda diretamente.
- Em conversas informais, fale de maneira natural e humana.
- Em assuntos técnicos, seja preciso e didático.
- Em assuntos complexos, aprofunde a explicação sem enrolar.

6. COMPARAÇÕES:
- Utilize tabelas quando realmente facilitarem a comparação.
- Mostre vantagens, desvantagens e diferenças relevantes.
- Não invente preços, especificações ou resultados.

7. QUALIDADE:
- Priorize clareza, precisão e utilidade.
- Evite repetir informações.
- Não utilize frases genéricas apenas para aumentar o tamanho da resposta.
- Entregue primeiro a informação mais importante.
- Adapte o tamanho da resposta à complexidade da pergunta.

SEGURANÇA E CONFIABILIDADE:
- Não ajude a criar ferramentas para roubar contas, invadir sistemas ou prejudicar outras pessoas.
- Não prometa resultados impossíveis ou garantias que não pode cumprir.
- Em assuntos de segurança digital, priorize orientações legítimas e preventivas.
`;

const RESPONSE_STYLES = {
  concise: "Responda de forma curta, direta e objetiva. Preserve a clareza.",
  normal: "Explique com clareza, naturalidade e boa organização.",
  detailed: "Explique com profundidade, etapas e exemplos quando forem úteis. Evite repetições."
};

function extractAnswer(data) {
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .filter(item => item?.type === "text" && item.text)
      .map(item => item.text)
      .join("\n")
      .trim();
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
      item.content.trim().length > 0
    )
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 5000)
    }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    text: Boolean(process.env.NVIDIA_API_KEY),
    vision: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message = "",
      image,
      images = [],
      history = [],
      responseStyle = "normal"
    } = req.body || {};

    const text = typeof message === "string"
      ? message.trim()
      : "";

    const selectedImages = Array.isArray(images)
      ? [...images]
      : [];

    if (image && typeof image === "string") {
      selectedImages.push(image);
    }

    if (!text && selectedImages.length === 0) {
      return res.status(400).json({
        reply: "Digite uma pergunta ou envie uma imagem."
      });
    }

    if (text.length > 4000) {
      return res.status(400).json({
        reply: "Sua mensagem ultrapassou o limite de 4.000 caracteres."
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

    const style = RESPONSE_STYLES[responseStyle]
      || RESPONSE_STYLES.normal;

    const systemPrompt = `
${BASE_PROMPT}

ESTILO DE RESPOSTA SELECIONADO:
${style}

IMPORTANTE:
Mantenha o padrão de organização em todas as respostas.
Não exagere na formatação Markdown.
Evite asteriscos desnecessários.
`;

    const previousMessages = safeHistory(history);

    let response;
    let service;

    if (selectedImages.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "A chave da OpenRouter não está configurada no Render."
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
            model:
              process.env.OPENROUTER_VISION_MODEL ||
              "nvidia/nemotron-3.5-super-vl:free",

            messages: [
              {
                role: "system",
                content:
                  systemPrompt +
                  "\nVocê também é especialista em interpretar imagens, fotografias, documentos e gráficos. Descreva apenas o que conseguir observar."
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
      const apiKey = process.env.NVIDIA_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          reply: "A chave da NVIDIA não está configurada no Render."
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

    return res.json({ reply: answer });

  } catch (error) {
    console.error("ERRO SERVIDOR:", error);

    const timeout = [
      "TimeoutError",
      "AbortError"
    ].includes(error?.name);

    return res.status(timeout ? 504 : 500).json({
      reply: timeout
        ? "A solicitação demorou demais. Tente novamente."
        : "Erro interno ao processar sua solicitação."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WSAZ_777 ativo na porta ${PORT}`);
});
