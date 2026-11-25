const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Chave da API da Groq (Use variável de ambiente GROQ_API_KEY no Render por segurança)
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'SUA_CHAVE_AQUI';

// Armazena a fila de letras por Session ID (SID)
const sessions = {};

// Converte um caractere para array de 8 bits ASCII (0 ou 1)
function charTo8Bits(char) {
    const code = char.charCodeAt(0);
    const binary = code.toString(2).padStart(8, '0');
    return binary.split('').map(bit => parseInt(bit, 10));
}

// Remove acentos para compatibilidade com painéis ASCII simples no Roblox
function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '');
}

// Rota chamada pelo Site para perguntar à IA da Groq
app.post('/ask', async (req, res) => {
    const { prompt, sid = 'default' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Digite uma pergunta.' });

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: 'Responda de forma curta, direta e sem emojis (maximo 60 caracteres), pois o texto sera exibido em um painel LED dentro de um jogo.'
                    },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 60
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Erro na API Groq');

        const rawReply = data.choices[0].message.content.trim();
        const cleanReply = normalizeText(rawReply);

        // Adiciona um espaço/fim no final da fila para o painel saber que acabou
        sessions[sid] = (cleanReply + '   ').split('');

        res.json({ success: true, reply: cleanReply, queueLength: sessions[sid].length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rota GET que o Transmissor HTTP do Roblox vai acessar em loop
app.get('/typewriter', (req, res) => {
    const sid = req.query.sid || 'default';
    
    if (!sessions[sid] || sessions[sid].length === 0) {
        // Sem letras na fila: envia todos os pinos em 0
        return res.json([0, 0, 0, 0, 0, 0, 0, 0]);
    }

    // Pega a próxima letra da fila
    const nextChar = sessions[sid].shift();
    const bits = charTo8Bits(nextChar);

    res.json(bits);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
