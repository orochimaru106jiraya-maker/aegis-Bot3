import os
import json
import time
import aiosqlite
from typing import Any, Dict, List, Optional

DEFAULT_TICKET_CATEGORIES = {
    "general": {
        "key": "general",
        "label": "General Help",
        "emoji": "💬",
        "naming_format": "general-{username}",
        "category_channel_id": None,
        "staff_role_ids": [],
        "questions": [
            "What do you need help with?",
            "Describe your issue.",
        ],
    },
    "complaint": {
        "key": "complaint",
        "label": "File a Complaint",
        "emoji": "🛡️",
        "naming_format": "complaint-{username}",
        "category_channel_id": None,
        "staff_role_ids": [],
        "questions": [
            "Who or what are you reporting?",
            "Describe the complaint.",
            "Provide supporting evidence if available.",
        ],
    },
    "staff": {
        "key": "staff",
        "label": "Apply for a Staff Role",
        "emoji": "📋",
        "naming_format": "staff-{username}",
        "category_channel_id": None,
        "staff_role_ids": [],
        "questions": [
            "Which position are you applying for?",
            "Why should we select you?",
            "Describe your experience.",
        ],
    },
    "prize": {
        "key": "prize",
        "label": "Claim Winning Prize",
        "emoji": "🏆",
        "naming_format": "prize-{username}",
        "category_channel_id": None,
        "staff_role_ids": [],
        "questions": [
            "What event or giveaway did you win?",
            "Provide proof of winning.",
            "What is your Discord username?",
        ],
    },
}


class DatabaseManager:
    """Async SQLite manager with WAL mode, migrations, indexes, and cached guild configs."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._prefix_cache: Dict[int, str] = {}

    async def _connect(self) -> aiosqlite.Connection:
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL;")
        await conn.execute("PRAGMA synchronous=NORMAL;")
        await conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    async def initialize(self) -> None:
        conn = await self._connect()
        try:
            await conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS guild_settings (
                    guild_id INTEGER PRIMARY KEY,
                    prefix TEXT NOT NULL DEFAULT '!',
                    language TEXT NOT NULL DEFAULT 'en',
                    mod_log_channel_id INTEGER,
                    server_log_channel_id INTEGER,
                    mute_role_id INTEGER,
                    dj_role_id INTEGER,
                    ai_channel_id INTEGER,
                    ai_personality TEXT NOT NULL DEFAULT 'Helpful, concise server assistant.',
                    snipe_history_limit INTEGER NOT NULL DEFAULT 10,
                    mod_role_ids TEXT NOT NULL DEFAULT '[]',
                    admin_role_ids TEXT NOT NULL DEFAULT '[]',
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS command_permissions (
                    guild_id INTEGER NOT NULL,
                    command_name TEXT NOT NULL,
                    module_name TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    require_admin INTEGER NOT NULL DEFAULT 0,
                    require_mod INTEGER NOT NULL DEFAULT 0,
                    allowed_role_ids TEXT NOT NULL DEFAULT '[]',
                    allowed_user_ids TEXT NOT NULL DEFAULT '[]',
                    PRIMARY KEY (guild_id, command_name)
                );

                CREATE TABLE IF NOT EXISTS mod_cases (
                    case_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    target_id INTEGER NOT NULL,
                    target_name TEXT NOT NULL,
                    moderator_id INTEGER NOT NULL,
                    moderator_name TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_target
                    ON mod_cases (guild_id, target_id);

                CREATE TABLE IF NOT EXISTS ticket_settings (
                    guild_id INTEGER PRIMARY KEY,
                    panel_channel_id INTEGER,
                    panel_message_id INTEGER,
                    panel_title TEXT NOT NULL DEFAULT 'Server Support & Applications',
                    panel_description TEXT NOT NULL DEFAULT 'Select a category below to open a private ticket with our staff team.',
                    panel_color TEXT NOT NULL DEFAULT '#5865F2',
                    transcript_channel_id INTEGER,
                    max_open_per_user INTEGER NOT NULL DEFAULT 2,
                    auto_delete_seconds INTEGER NOT NULL DEFAULT 300,
                    close_permission TEXT NOT NULL DEFAULT 'staff_or_creator',
                    categories_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tickets (
                    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    channel_id INTEGER NOT NULL UNIQUE,
                    category_key TEXT NOT NULL,
                    creator_id INTEGER NOT NULL,
                    creator_name TEXT NOT NULL,
                    claimed_by_id INTEGER,
                    claimed_by_name TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    answers_json TEXT NOT NULL DEFAULT '{}',
                    closed_by_id INTEGER,
                    closed_by_name TEXT,
                    close_reason TEXT,
                    transcript_text TEXT,
                    created_at INTEGER NOT NULL,
                    closed_at INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_tickets_guild_creator
                    ON tickets (guild_id, creator_id, status);

                CREATE TABLE IF NOT EXISTS ticket_claims (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id INTEGER NOT NULL,
                    guild_id INTEGER NOT NULL,
                    staff_id INTEGER NOT NULL,
                    staff_name TEXT NOT NULL,
                    action TEXT NOT NULL,
                    timestamp INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS snipe_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    channel_id INTEGER NOT NULL,
                    snipe_type TEXT NOT NULL,
                    author_id INTEGER NOT NULL,
                    author_name TEXT NOT NULL,
                    before_content TEXT,
                    after_content TEXT,
                    attachments_json TEXT NOT NULL DEFAULT '[]',
                    is_ticket_channel INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_snipe_channel
                    ON snipe_messages (guild_id, channel_id, snipe_type, created_at DESC);

                CREATE TABLE IF NOT EXISTS activity_role_settings (
                    guild_id INTEGER PRIMARY KEY,
                    spotify_enabled INTEGER NOT NULL DEFAULT 0,
                    spotify_role_id INTEGER,
                    gaming_enabled INTEGER NOT NULL DEFAULT 0,
                    gaming_default_role_id INTEGER,
                    gaming_specific_json TEXT NOT NULL DEFAULT '{}',
                    vc_enabled INTEGER NOT NULL DEFAULT 0,
                    vc_default_role_id INTEGER,
                    vc_channel_roles_json TEXT NOT NULL DEFAULT '{}',
                    text_enabled INTEGER NOT NULL DEFAULT 0,
                    text_milestones_json TEXT NOT NULL DEFAULT '{"50": null, "250": null, "1000": null}',
                    stack_roles INTEGER NOT NULL DEFAULT 1,
                    cooldown_seconds INTEGER NOT NULL DEFAULT 15
                );

                CREATE TABLE IF NOT EXISTS user_activity (
                    guild_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    message_count INTEGER NOT NULL DEFAULT 0,
                    last_message_at INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (guild_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS reaction_panels (
                    panel_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    channel_id INTEGER NOT NULL,
                    message_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    mode TEXT NOT NULL DEFAULT 'buttons',
                    exclusive INTEGER NOT NULL DEFAULT 0,
                    max_roles INTEGER NOT NULL DEFAULT 0,
                    roles_json TEXT NOT NULL DEFAULT '[]'
                );

                CREATE TABLE IF NOT EXISTS embed_templates (
                    template_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    embed_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                     UNIQUE(guild_id, name)
                );

                CREATE TABLE IF NOT EXISTS auto_responses (
                    trigger_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    trigger_text TEXT NOT NULL,
                    match_type TEXT NOT NULL DEFAULT 'contains',
                    case_sensitive INTEGER NOT NULL DEFAULT 0,
                    responses_json TEXT NOT NULL DEFAULT '[]',
                    use_embed INTEGER NOT NULL DEFAULT 0,
                    mention_user INTEGER NOT NULL DEFAULT 1,
                    cooldown_seconds INTEGER NOT NULL DEFAULT 5,
                    allowed_channel_ids TEXT NOT NULL DEFAULT '[]',
                    allowed_role_ids TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS ai_knowledge (
                    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL,
                    topic TEXT NOT NULL,
                    keywords TEXT NOT NULL,
                    response TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                """
            )
            await conn.commit()
        finally:
            await conn.close()

    async def get_guild_prefix(self, guild_id: int, default: str = "!") -> str:
        if guild_id in self._prefix_cache:
            return self._prefix_cache[guild_id]
        settings = await self.get_guild_settings(guild_id)
        prefix = settings.get("prefix", default)
        self._prefix_cache[guild_id] = prefix
        return prefix

    async def get_guild_settings(self, guild_id: int) -> Dict[str, Any]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM guild_settings WHERE guild_id = ?", (guild_id,)
            )
            row = await cursor.fetchone()
            if not row:
                now = int(time.time())
                await conn.execute(
                    "INSERT INTO guild_settings (guild_id, updated_at) VALUES (?, ?)",
                    (guild_id, now),
                )
                await conn.commit()
                cursor = await conn.execute(
                    "SELECT * FROM guild_settings WHERE guild_id = ?", (guild_id,)
                )
                row = await cursor.fetchone()
            data = dict(row)
            data["mod_role_ids"] = json.loads(data.get("mod_role_ids") or "[]")
            data["admin_role_ids"] = json.loads(data.get("admin_role_ids") or "[]")
            return data
        finally:
            await conn.close()

    async def update_guild_settings(self, guild_id: int, **kwargs: Any) -> None:
        await self.get_guild_settings(guild_id)
        if "prefix" in kwargs:
            self._prefix_cache[guild_id] = kwargs["prefix"]
        for list_key in ("mod_role_ids", "admin_role_ids"):
            if list_key in kwargs and isinstance(kwargs[list_key], list):
                kwargs[list_key] = json.dumps(kwargs[list_key])
        kwargs["updated_at"] = int(time.time())
        columns = ", ".join(f"{k} = ?" for k in kwargs.keys())
        values = list(kwargs.values()) + [guild_id]
        conn = await self._connect()
        try:
            await conn.execute(
                f"UPDATE guild_settings SET {columns} WHERE guild_id = ?", values
            )
            await conn.commit()
        finally:
            await conn.close()

    async def get_ticket_settings(self, guild_id: int) -> Dict[str, Any]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM ticket_settings WHERE guild_id = ?", (guild_id,)
            )
            row = await cursor.fetchone()
            if not row:
                await conn.execute(
                    "INSERT INTO ticket_settings (guild_id, categories_json) VALUES (?, ?)",
                    (guild_id, json.dumps(DEFAULT_TICKET_CATEGORIES)),
                )
                await conn.commit()
                cursor = await conn.execute(
                    "SELECT * FROM ticket_settings WHERE guild_id = ?", (guild_id,)
                )
                row = await cursor.fetchone()
            data = dict(row)
            data["categories"] = json.loads(data["categories_json"])
            return data
        finally:
            await conn.close()

    async def update_ticket_settings(self, guild_id: int, **kwargs: Any) -> None:
        await self.get_ticket_settings(guild_id)
        if "categories" in kwargs:
            kwargs["categories_json"] = json.dumps(kwargs.pop("categories"))
        columns = ", ".join(f"{k} = ?" for k in kwargs.keys())
        values = list(kwargs.values()) + [guild_id]
        conn = await self._connect()
        try:
            await conn.execute(
                f"UPDATE ticket_settings SET {columns} WHERE guild_id = ?", values
            )
            await conn.commit()
        finally:
            await conn.close()

    async def create_ticket(
        self,
        guild_id: int,
        channel_id: int,
        category_key: str,
        creator_id: int,
        creator_name: str,
        answers: Dict[str, str],
    ) -> int:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                """
                INSERT INTO tickets (
                    guild_id, channel_id, category_key, creator_id,
                    creator_name, status, answers_json, created_at
                ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    guild_id,
                    channel_id,
                    category_key,
                    creator_id,
                    creator_name,
                    json.dumps(answers),
                    int(time.time()),
                ),
            )
            await conn.commit()
            return cursor.lastrowid
        finally:
            await conn.close()

    async def get_open_user_tickets(
        self, guild_id: int, creator_id: int
    ) -> List[Dict[str, Any]]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'",
                (guild_id, creator_id),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    async def get_ticket_by_channel(self, channel_id: int) -> Optional[Dict[str, Any]]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM tickets WHERE channel_id = ?", (channel_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["answers"] = json.loads(data.get("answers_json") or "{}")
            return data
        finally:
            await conn.close()

    async def update_ticket(self, ticket_id: int, **kwargs: Any) -> None:
        columns = ", ".join(f"{k} = ?" for k in kwargs.keys())
        values = list(kwargs.values()) + [ticket_id]
        conn = await self._connect()
        try:
            await conn.execute(
                f"UPDATE tickets SET {columns} WHERE ticket_id = ?", values
            )
            await conn.commit()
        finally:
            await conn.close()

    async def log_ticket_claim(
        self,
        ticket_id: int,
        guild_id: int,
        staff_id: int,
        staff_name: str,
        action: str,
    ) -> None:
        conn = await self._connect()
        try:
            await conn.execute(
                """
                INSERT INTO ticket_claims (ticket_id, guild_id, staff_id, staff_name, action, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ticket_id, guild_id, staff_id, staff_name, action, int(time.time())),
            )
            await conn.commit()
        finally:
            await conn.close()

    async def get_ticket_claim_history(self, ticket_id: int) -> List[Dict[str, Any]]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM ticket_claims WHERE ticket_id = ? ORDER BY timestamp ASC",
                (ticket_id,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    async def add_mod_case(
        self,
        guild_id: int,
        action: str,
        target_id: int,
        target_name: str,
        moderator_id: int,
        moderator_name: str,
        reason: str,
    ) -> int:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                """
                INSERT INTO mod_cases (
                    guild_id, action, target_id, target_name,
                    moderator_id, moderator_name, reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    guild_id,
                    action,
                    target_id,
                    target_name,
                    moderator_id,
                    moderator_name,
                    reason,
                    int(time.time()),
                ),
            )
            await conn.commit()
            return cursor.lastrowid
        finally:
            await conn.close()

    async def get_mod_cases(
        self, guild_id: int, target_id: Optional[int] = None, action: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        conn = await self._connect()
        try:
            query = "SELECT * FROM mod_cases WHERE guild_id = ? AND active = 1"
            params: List[Any] = [guild_id]
            if target_id is not None:
                query += " AND target_id = ?"
                params.append(target_id)
            if action is not None:
                query += " AND action = ?"
                params.append(action)
            query += " ORDER BY case_id DESC LIMIT 50"
            cursor = await conn.execute(query, params)
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    async def get_case_by_id(self, guild_id: int, case_id: int) -> Optional[Dict[str, Any]]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM mod_cases WHERE guild_id = ? AND case_id = ?",
                (guild_id, case_id),
            )
            row = await cursor.fetchone()
            return dict(row) if row else None
        finally:
            await conn.close()

    async def clear_warnings(self, guild_id: int, target_id: int) -> int:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND target_id = ? AND action = 'WARN' AND active = 1",
                (guild_id, target_id),
            )
            await conn.commit()
            return cursor.rowcount
        finally:
            await conn.close()

    async def get_command_permission(
        self, guild_id: int, command_name: str
    ) -> Optional[Dict[str, Any]]:
        conn = await self._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM command_permissions WHERE guild_id = ? AND command_name = ?",
                (guild_id, command_name),
            )
            row = await cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["allowed_role_ids"] = json.loads(data.get("allowed_role_ids") or "[]")
            data["allowed_user_ids"] = json.loads(data.get("allowed_user_ids") or "[]")
            return data
        finally:
            await conn.close()

    async def set_command_permission(
        self,
        guild_id: int,
        command_name: str,
        module_name: str,
        enabled: bool = True,
        require_admin: bool = False,
        require_mod: bool = False,
        allowed_role_ids: Optional[List[int]] = None,
        allowed_user_ids: Optional[List[int]] = None,
    ) -> None:
        conn = await self._connect()
        try:
            await conn.execute(
                """
                INSERT INTO command_permissions (
                    guild_id, command_name, module_name, enabled,
                    require_admin, require_mod, allowed_role_ids, allowed_user_ids
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id, command_name) DO UPDATE SET
                    module_name = excluded.module_name,
                    enabled = excluded.enabled,
                    require_admin = excluded.require_admin,
                    require_mod = excluded.require_mod,
                    allowed_role_ids = excluded.allowed_role_ids,
                    allowed_user_ids = excluded.allowed_user_ids
                """,
                (
                    guild_id,
                    command_name,
                    module_name,
                    int(enabled),
                    int(require_admin),
                    int(require_mod),
                    json.dumps(allowed_role_ids or []),
                    json.dumps(allowed_user_ids or []),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()
