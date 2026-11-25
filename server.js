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

// Descobre automaticamente um modelo válido na tua conta da Groq
async function getAvailableModel(apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!res.ok || !data.data) {
    throw new Error(data.error?.message || 'Chave GROQ_API_KEY inválida ou sem modelos ativos.');
  }
  // Filtra apenas modelos de texto (ignora modelos de áudio whisper ou visão/guard)
  const textModels = data.data.filter(m => 
    !m.id.includes('whisper') && 
    !m.id.includes('guard') && 
    !m.id.includes('vision')
  );
  if (textModels.length === 0) {
    throw new Error('Nenhum modelo de texto disponível na tua conta Groq.');
  }
  // Dá preferência a modelos Llama ou Gemma, senão usa o primeiro da lista
  const preferred = textModels.find(m => m.id.includes('llama') || m.id.includes('gemma'));
  return preferred ? preferred.id : textModels[0].id;
}

// Rota chamada pelo site para perguntar à IA da Groq
app.post('/ask', async (req, res) => {
  const { prompt, sid = 'default' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Pergunta vazia.' });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    const activeModel = await getAvailableModel(apiKey);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: activeModel,
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
      modelUsed: activeModel,
      queuedCharacters: queues[sid].length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota chamada pelo Transmissor HTTP (GET) no Construa Lógica!
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
