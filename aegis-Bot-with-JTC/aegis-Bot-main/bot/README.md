# AegisBot — Production All-in-One Discord Bot (`discord.py 2.x` + `aiosqlite`)

AegisBot is a complete, modular, low-memory Discord bot engineered for long-term stability, Railway hosting, and 100% in-Discord administration without editing Python files.

## 1. Folder Structure

```text
bot/
├── main.py                  # Bot entrypoint, intent setup, dynamic prefix, Cog loader
├── requirements.txt         # Lightweight Python dependencies
├── .env.example             # Environment variable template
├── railway.json             # Nixpacks config (Python 3.11 + ffmpeg + libopus)
├── Procfile                 # Worker process definition
├── database/
│   └── db.py                # Async SQLite (WAL mode) schema, migrations, indexes & CRUD
├── utils/
│   └── permissions.py       # Server-side RBAC & role hierarchy validators
└── cogs/
    ├── setup_wizard.py      # Interactive /setup dashboard (dropdowns, modals, buttons)
    ├── tickets.py           # 4-Category Ticket System, Modals, Claiming & Dual DM Transcripts
    ├── moderation.py        # 19 Moderation commands, /purge filters, privacy-safe /snipe
    ├── admin.py             # Server/User/Role/Channel/Bot info, prefix, logs, JSON backup
    ├── activity_roles.py    # Spotify, Gaming, Voice Chat, and Text Chat milestone roles
    ├── reaction_roles.py    # Button/Dropdown self-assignable role panels
    ├── embeds.py            # Interactive /embed builder with SQLite templates
    ├── auto_responder.py    # Exact/Contains auto-triggers with cooldowns
    ├── ai_assistant.py      # Local rule-based AI assistant (zero paid API cost)
    └── music.py             # Modular voice music player with queue, loop, volume & DJ controls
```

## 2. Discord Developer Portal Setup

1. Open [Discord Developer Portal](https://discord.com/developers/applications) and create an Application.
2. Navigate to **Bot** and enable all three **Privileged Gateway Intents**:
   - **PRESENCE INTENT** (Required for Spotify and Gaming activity auto-roles; note that users must have activity sharing enabled in their Discord privacy settings).
   - **SERVER MEMBERS INTENT** (Required for moderation hierarchy checks and role management).
   - **MESSAGE CONTENT INTENT** (Required for hybrid prefix commands, `/snipe`, `/editsnipe`, auto-responder, and text activity milestones).
3. Under **OAuth2 -> URL Generator**, select scopes `bot` and `applications.commands`, and permissions integer `8` (Administrator) or granular permissions (`Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Messages`, `Read Message History`, `Send Messages`, `Attach Files`, `Connect`, `Speak`).

## 3. Railway Deployment & Persistent SQLite Volume

> **Important Note on Ephemeral Filesystems:** By default, container filesystems on Railway are ephemeral—meaning local SQLite files inside the container directory are wiped whenever you redeploy or restart the service.
> To preserve your SQLite database across redeployments:
1. In your Railway project service, press `Cmd+K` / `Ctrl+K` and attach a **Volume** mounted at `/data`.
2. Set the environment variable `DATABASE_PATH=/data/aegisbot.db` in Railway's **Variables** tab.
3. Set `DISCORD_TOKEN=your_bot_token_here`.
4. Railway automatically reads `railway.json` to provision `ffmpeg` and `libopus` and starts `python main.py`.
