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

    // 1. Consulta os modelos realmente ativos na tua conta Groq
    const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const modelsData = await modelsRes.json();

    if (!modelsRes.ok || !Array.isArray(modelsData.data)) {
      const msg = modelsData.error?.message || JSON.stringify(modelsData);
      return res.status(modelsRes.status).json({ error: `Erro ao listar modelos: ${msg}` });
    }

    // Filtra apenas modelos de texto/chat (ignora whisper, guard, tts, etc.)
    const chatModels = modelsData.data
      .map(m => m.id)
      .filter(id => !/whisper|guard|tts|embed|vision/i.test(id));

    if (chatModels.length === 0) {
      return res.status(500).json({ error: 'Nenhum modelo de texto encontrado na tua conta Groq.' });
    }

    // Escolhe o primeiro modelo de chat disponível
    const chosenModel = chatModels[0];

    // 2. Faz a pergunta usando o modelo encontrado
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          {
            role: 'system',
            content: 'Responda de forma curta, direta e sem markdown ou emojis (máximo 100 caracteres), pois o texto será exibido em um painel de letras no Roblox.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 80
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || JSON.stringify(data);
      return res.status(response.status).json({
        error: `Erro da Groq (${chosenModel}): ${errorMsg} | Disponíveis: ${chatModels.join(', ')}`
      });
    }

    const aiReply = data.choices[0].message.content.trim();
    queues[sid] = textToBinaryArray(aiReply);

    res.json({
      reply: aiReply,
      model: chosenModel,
      queuedCharacters: queues[sid].length
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro no servidor: ' + error.message });
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
