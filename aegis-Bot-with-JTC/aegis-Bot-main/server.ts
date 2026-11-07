import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

const BOT_FILES_LIST = [
  { path: 'main.py', category: 'Core & Entrypoint', description: 'Bot entrypoint, dynamic prefix, intents, Cog loader & slash sync' },
  { path: 'requirements.txt', category: 'Core & Entrypoint', description: 'Lightweight Python dependencies for Railway hosting' },
  { path: '.env.example', category: 'Core & Entrypoint', description: 'Environment variables template (never hardcode tokens)' },
  { path: 'railway.json', category: 'Deployment', description: 'Nixpacks configuration with Python 3.11, ffmpeg, and libopus' },
  { path: 'Procfile', category: 'Deployment', description: 'Railway worker process startup definition' },
  { path: 'database/db.py', category: 'Database & RBAC', description: 'Async SQLite (aiosqlite + WAL mode) schema, indexes & CRUD' },
  { path: 'utils/permissions.py', category: 'Database & RBAC', description: 'Server-side RBAC permission validator & role hierarchy checks' },
  { path: 'cogs/tickets.py', category: 'Cogs (Modules)', description: 'Phase 2 (Highest Priority): 4-Category Ticket System, Modals & Dual DM Transcripts' },
  { path: 'cogs/setup_wizard.py', category: 'Cogs (Modules)', description: 'Phase 1: Interactive /setup dashboard with dropdowns, buttons & modals' },
  { path: 'cogs/moderation.py', category: 'Cogs (Modules)', description: 'Phase 3: 19 Moderation commands, /purge filters & privacy-safe /snipe' },
  { path: 'cogs/admin.py', category: 'Cogs (Modules)', description: 'Phase 4: Server/User/Role/Channel/Bot info, prefix, logs & JSON backup' },
  { path: 'cogs/activity_roles.py', category: 'Cogs (Modules)', description: 'Phase 4: Spotify, Gaming, Voice Chat & Text Chat milestone auto-roles' },
  { path: 'cogs/reaction_roles.py', category: 'Cogs (Modules)', description: 'Phase 5: Interactive button/dropdown self-assignable reaction role panels' },
  { path: 'cogs/embeds.py', category: 'Cogs (Modules)', description: 'Phase 5: Interactive /embed builder with reusable SQLite templates' },
  { path: 'cogs/auto_responder.py', category: 'Cogs (Modules)', description: 'Phase 6: Exact/Contains auto-responder with cooldowns & role filters' },
  { path: 'cogs/ai_assistant.py', category: 'Cogs (Modules)', description: 'Phase 6: Zero-API-cost local rule-based AI assistant with SQLite knowledge base' },
  { path: 'cogs/music.py', category: 'Cogs (Modules)', description: 'Phase 7: Modular voice music player with queue, volume, loop & DJ role' },
  { path: 'README.md', category: 'Deployment', description: 'Phase 8: Railway deployment, persistent volume & Developer Portal guide' },
];

app.get('/api/bot-files', (_req, res) => {
  try {
    const files = BOT_FILES_LIST.map((item) => {
      const fullPath = path.join(__dirname, 'bot', item.path);
      const content = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '# File not found';
      return {
        ...item,
        content,
        lines: content.split('\n').length,
        bytes: Buffer.byteLength(content, 'utf-8'),
      };
    });
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read bot files' });
  }
});

// High-Thinking Architecture & Custom Rule Generator (uses gemini-4-argon with ThinkingLevel.HIGH)
app.post('/api/architect/think', async (req, res) => {
  const { query, guildName } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query is required.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.json({
      mode: 'local-fallback',
      answer:
        `[Local Rule-Based Architect Engine — ${guildName || 'Aegis Server'}]\n\n` +
        `1. **Ticket System Recommendation**: Use \`/ticket setup\` to map each of the 4 categories (General Help, File a Complaint, Apply for a Staff Role, Claim Winning Prize) to dedicated Discord category channels with isolated staff role overwrites.\n` +
        `2. **SQLite Persistence**: Mount a Railway Volume at \`/data\` and set \`DATABASE_PATH=/data/aegisbot.db\` so ticket transcripts, RBAC permissions, and moderation cases survive container redeployments.\n` +
        `3. **Gateway Intents**: Ensure \`PRESENCE INTENT\`, \`SERVER MEMBERS INTENT\`, and \`MESSAGE CONTENT INTENT\` are toggled ON in the Discord Developer Portal.`,
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: query,
      config: {
        systemInstruction:
          'You are a Senior Python Discord Bot Architect specializing in discord.py 2.x, aiosqlite, RBAC security, and Railway deployments. Provide clear, actionable configuration advice or discord.py snippets.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    res.json({
      mode: 'gemini-4-argon-high-thinking',
      answer: response.text ?? 'No response generated.',
    });
  } catch (err) {
    res.json({
      mode: 'local-fallback',
      answer:
        `[Local Rule-Based Architect Engine (Paid API Key not active — running zero-cost local advisor)]\n\n` +
        `For your query "${query}":\n` +
        `• All 10 Cogs in \`/bot/cogs/\` use server-side RBAC validation (\`utils/permissions.py\`) and \`aiosqlite\` WAL persistence (\`database/db.py\`).\n` +
        `• Use \`/setup\` or \`/ticket setup\` directly inside Discord to adjust roles, channels, and modal questions without editing Python files.`,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AegisBot Studio & API Server running at http://localhost:${PORT}`);
  });
}

startServer();
