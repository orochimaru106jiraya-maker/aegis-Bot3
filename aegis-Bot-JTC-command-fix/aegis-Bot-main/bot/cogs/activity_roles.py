import json
import time
import discord
from discord import app_commands
from discord.ext import commands
from typing import Dict, Optional
from utils.permissions import validate_member_access


class ActivityRolesCog(commands.Cog):
    """
    Activity-Based Auto Role Assignment System:
    - Spotify Listening Detection (requires Presence Intent + user sharing Spotify status)
    - Gaming Activity Detection (requires Presence Intent)
    - Voice Chat Participation Roles (general & per-channel)
    - Text Chat Milestone Roles (anti-spam cooldown protected)
    """

    def __init__(self, bot):
        self.bot = bot
        self._presence_cooldowns: Dict[tuple[int, int], float] = {}

    async def get_activity_config(self, guild_id: int) -> dict:
        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM activity_role_settings WHERE guild_id = ?", (guild_id,)
            )
            row = await cursor.fetchone()
            if not row:
                await conn.execute(
                    "INSERT INTO activity_role_settings (guild_id) VALUES (?)", (guild_id,)
                )
                await conn.commit()
                cursor = await conn.execute(
                    "SELECT * FROM activity_role_settings WHERE guild_id = ?", (guild_id,)
                )
                row = await cursor.fetchone()
            data = dict(row)
            data["gaming_specific"] = json.loads(data.get("gaming_specific_json") or "{}")
            data["vc_channel_roles"] = json.loads(data.get("vc_channel_roles_json") or "{}")
            data["text_milestones"] = json.loads(data.get("text_milestones_json") or "{}")
            return data
        finally:
            await conn.close()

    @commands.Cog.listener()
    async def on_presence_update(self, before: discord.Member, after: discord.Member):
        if after.bot or not after.guild:
            return
        cfg = await self.get_activity_config(after.guild.id)
        if not cfg.get("spotify_enabled") and not cfg.get("gaming_enabled"):
            return

        now = time.time()
        key = (after.guild.id, after.id)
        if now - self._presence_cooldowns.get(key, 0) < cfg.get("cooldown_seconds", 15):
            return
        self._presence_cooldowns[key] = now

        # 1. Spotify Activity Role
        if cfg.get("spotify_enabled") and cfg.get("spotify_role_id"):
            spotify_role = after.guild.get_role(cfg["spotify_role_id"])
            if spotify_role:
                listening_spotify = any(isinstance(a, discord.Spotify) for a in after.activities)
                if listening_spotify and spotify_role not in after.roles:
                    try:
                        await after.add_roles(spotify_role, reason="Activity Auto-Role: Listening to Spotify")
                    except discord.HTTPException:
                        pass
                elif not listening_spotify and spotify_role in after.roles:
                    try:
                        await after.remove_roles(spotify_role, reason="Activity Auto-Role: Stopped Spotify")
                    except discord.HTTPException:
                        pass

        # 2. Gaming Activity Role
        if cfg.get("gaming_enabled") and cfg.get("gaming_default_role_id"):
            game_role = after.guild.get_role(cfg["gaming_default_role_id"])
            if game_role:
                playing_game = any(
                    a.type == discord.ActivityType.playing for a in after.activities
                )
                if playing_game and game_role not in after.roles:
                    try:
                        await after.add_roles(game_role, reason="Activity Auto-Role: Playing a game")
                    except discord.HTTPException:
                        pass
                elif not playing_game and game_role in after.roles:
                    try:
                        await after.remove_roles(game_role, reason="Activity Auto-Role: Stopped playing")
                    except discord.HTTPException:
                        pass

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ):
        if member.bot:
            return
        cfg = await self.get_activity_config(member.guild.id)
        if not cfg.get("vc_enabled") or not cfg.get("vc_default_role_id"):
            return

        vc_role = member.guild.get_role(cfg["vc_default_role_id"])
        if not vc_role:
            return

        if after.channel is not None and vc_role not in member.roles:
            try:
                await member.add_roles(vc_role, reason=f"Joined voice channel {after.channel.name}")
            except discord.HTTPException:
                pass
        elif after.channel is None and vc_role in member.roles:
            try:
                await member.remove_roles(vc_role, reason="Left voice channel")
            except discord.HTTPException:
                pass

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if not message.guild or message.author.bot or not isinstance(message.author, discord.Member):
            return
        cfg = await self.get_activity_config(message.guild.id)
        if not cfg.get("text_enabled"):
            return

        now = int(time.time())
        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                "SELECT message_count, last_message_at FROM user_activity WHERE guild_id = ? AND user_id = ?",
                (message.guild.id, message.author.id),
            )
            row = await cursor.fetchone()
            if row and now - row["last_message_at"] < cfg.get("cooldown_seconds", 15):
                return
            new_count = (row["message_count"] + 1) if row else 1
            await conn.execute(
                """
                INSERT INTO user_activity (guild_id, user_id, message_count, last_message_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guild_id, user_id) DO UPDATE SET
                    message_count = excluded.message_count,
                    last_message_at = excluded.last_message_at
                """,
                (message.guild.id, message.author.id, new_count, now),
            )
            await conn.commit()
        finally:
            await conn.close()

        milestones: Dict[str, Optional[int]] = cfg.get("text_milestones", {})
        for threshold_str, role_id in milestones.items():
            if role_id and new_count >= int(threshold_str):
                role = message.guild.get_role(int(role_id))
                if role and role not in message.author.roles:
                    try:
                        await message.author.add_roles(role, reason=f"Reached {threshold_str} messages milestone")
                    except discord.HTTPException:
                        pass

    autorole_group = app_commands.Group(
        name="autoroles", description="Configure Spotify, Gaming, Voice, and Text Chat activity auto-roles."
    )

    @autorole_group.command(name="configure", description="Configure roles and toggles for activity-based auto roles.")
    async def configure_autoroles(
        self,
        interaction: discord.Interaction,
        spotify_enabled: bool = True,
        spotify_role: Optional[discord.Role] = None,
        gaming_enabled: bool = True,
        gaming_role: Optional[discord.Role] = None,
        vc_enabled: bool = True,
        vc_role: Optional[discord.Role] = None,
        text_enabled: bool = True,
    ):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "autoroles", default_admin=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO activity_role_settings (
                    guild_id, spotify_enabled, spotify_role_id,
                    gaming_enabled, gaming_default_role_id,
                    vc_enabled, vc_default_role_id, text_enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    spotify_enabled = excluded.spotify_enabled,
                    spotify_role_id = COALESCE(excluded.spotify_role_id, activity_role_settings.spotify_role_id),
                    gaming_enabled = excluded.gaming_enabled,
                    gaming_default_role_id = COALESCE(excluded.gaming_default_role_id, activity_role_settings.gaming_default_role_id),
                    vc_enabled = excluded.vc_enabled,
                    vc_default_role_id = COALESCE(excluded.vc_default_role_id, activity_role_settings.vc_default_role_id),
                    text_enabled = excluded.text_enabled
                """,
                (
                    interaction.guild.id,
                    int(spotify_enabled),
                    spotify_role.id if spotify_role else None,
                    int(gaming_enabled),
                    gaming_role.id if gaming_role else None,
                    int(vc_enabled),
                    vc_role.id if vc_role else None,
                    int(text_enabled),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()

        await interaction.response.send_message(
            "Activity auto-role configuration saved to SQLite. Note: Spotify and Gaming detection require `PRESENCE INTENT` enabled in the Discord Developer Portal and the user displaying activity in their Discord profile.",
            ephemeral=True,
        )


async def setup(bot):
    await bot.add_cog(ActivityRolesCog(bot))
