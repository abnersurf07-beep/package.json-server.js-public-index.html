const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fila de letras em binário separada por Session ID (sid)
const queues = {};

// Converte texto em uma lista de strings binárias de 8 bits (ASCII)
function textToBinaryArray(text) {
  // Remove acentos para compatibilidade com displays ASCII padrão
  const cleanText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const result = [];
  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      result.push(code.toString(2).padStart(8, '0'));
    }
  }
  return result;
}

// Rota chamada pelo site para perguntar à IA da Groq
app.post('/ask', async (req, res) => {
  const { prompt, sid = 'default' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Pergunta vazia.' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Responda de forma curta, direta e sem markdown ou emojis (máximo 120 caracteres), pois o texto será exibido em um painel de letras no Roblox.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 100
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Erro ao consultar a API da Groq.'
      });
    }

    const aiReply = data.choices[0].message.content.trim();
    queues[sid] = textToBinaryArray(aiReply);

    res.json({
      reply: aiReply,
      queuedCharacters: queues[sid].length
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno no servidor: ' + error.message });
  }
});

// Rota chamada pelo Transmissor HTTP (GET) no Construa Lógica!
app.get('/typewriter', (req, res) => {
  const sid = req.query.sid || 'default';
  const queue = queues[sid] || [];

  // Pega a próxima letra da fila ou envia 8 zeros se estiver vazia
  const nextBinary = queue.length > 0 ? queue.shift() : '00000000';

  res.json({
    value: nextBinary,
    data: nextBinary,
    binary: nextBinary
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
