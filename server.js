const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const queues = {};

function textToBinaryArray(text) {
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

app.post('/ask', async (req, res) => {
  const { prompt, sid = 'default' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Pergunta vazia.' });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'A chave GROQ_API_KEY não está configurada no Render.' });
    }

    // Chamada direta utilizando o modelo estável padrão
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'Responda de forma curta, direta e sem markdown ou emojis (máximo 80 caracteres), pois o texto será exibido em um painel de letras no Roblox.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 60
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || 'Erro desconhecido na API da Groq.';
      return res.status(response.status).json({ error: errorMsg });
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ error: 'Formato de resposta inválido da Groq.' });
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

app.get('/typewriter', (req, res) => {
  const sid = req.query.sid || 'default';
  const queue = queues[sid] || [];
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
