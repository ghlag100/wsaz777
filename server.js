import express from "express";
import path from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" }));

// Servir pasta pública (ex.: arquivos 3d se quiser futuramente)
app.use("/public", express.static(path.join(process.cwd(), "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("/file_000000009618820e9a50407df0e56103.png", (req, res) => {
  res.sendFile(path.join(process.cwd(), "file_000000009618820e9a50407df0e56103.png"));
});

// Seu código de IA segue intacto abaixo com endpoint /api/chat

// [Mantém todo código anterior para o /api/chat conforme enviado]

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WSAZ_777 ativo na porta ${PORT}`);
});
