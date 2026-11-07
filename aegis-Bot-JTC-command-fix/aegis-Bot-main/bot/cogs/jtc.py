import asyncio
import logging
import time
from typing import Optional

import aiosqlite
import discord
from discord import app_commands
from discord.ext import commands

logger = logging.getLogger("aegisbot.jtc")


class RenameRoomModal(discord.ui.Modal, title="Rename voice room"):
    new_name = discord.ui.TextInput(label="New channel name", min_length=1, max_length=90)

    def __init__(self, cog: "JoinToCreate", channel_id: int):
        super().__init__()
        self.cog = cog
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        channel = interaction.guild.get_channel(self.channel_id) if interaction.guild else None
        if not isinstance(channel, discord.VoiceChannel):
            return await interaction.response.send_message("That room no longer exists.", ephemeral=True)
        try:
            await channel.edit(name=str(self.new_name).strip(), reason="JTC owner rename")
            await interaction.response.send_message(f"Room renamed to **{channel.name}**.", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message("I need Manage Channels permission.", ephemeral=True)


class LimitRoomModal(discord.ui.Modal, title="Change room user limit"):
    limit = discord.ui.TextInput(label="User limit (0 = unlimited)", min_length=1, max_length=2, placeholder="0-99")

    def __init__(self, channel_id: int):
        super().__init__()
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        try:
            value = int(str(self.limit))
            if not 0 <= value <= 99:
                raise ValueError
        except ValueError:
            return await interaction.response.send_message("Enter a number from 0 to 99.", ephemeral=True)
        channel = interaction.guild.get_channel(self.channel_id) if interaction.guild else None
        if not isinstance(channel, discord.VoiceChannel):
            return await interaction.response.send_message("That room no longer exists.", ephemeral=True)
        try:
            await channel.edit(user_limit=value, reason="JTC owner changed room limit")
            await interaction.response.send_message(f"User limit set to **{value or 'unlimited'}**.", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message("I need Manage Channels permission.", ephemeral=True)


class JTCControlView(discord.ui.View):
    def __init__(self, cog: "JoinToCreate", channel_id: int):
        super().__init__(timeout=300)
        self.cog = cog
        self.channel_id = channel_id

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Use this control panel in your server.", ephemeral=True)
            return False
        record = await self.cog.get_channel_record(self.channel_id)
        if not record:
            await interaction.response.send_message("This temporary room is no longer registered.", ephemeral=True)
            return False
        member = interaction.user
        allowed = record["owner_id"] == member.id or member.guild_permissions.manage_channels or member.guild_permissions.administrator
        if not allowed:
            await interaction.response.send_message("Only the room owner or a server moderator can use these controls.", ephemeral=True)
            return False
        channel = interaction.guild.get_channel(self.channel_id)
        if not isinstance(channel, discord.VoiceChannel):
            await interaction.response.send_message("The voice room no longer exists.", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Rename", emoji="✏️", style=discord.ButtonStyle.primary, row=0)
    async def rename(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(RenameRoomModal(self.cog, self.channel_id))

    @discord.ui.button(label="User limit", emoji="👥", style=discord.ButtonStyle.secondary, row=0)
    async def limit(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(LimitRoomModal(self.channel_id))

    @discord.ui.button(label="Lock / Unlock", emoji="🔒", style=discord.ButtonStyle.secondary, row=0)
    async def lock(self, interaction: discord.Interaction, button: discord.ui.Button):
        channel = interaction.guild.get_channel(self.channel_id)
        overwrite = channel.overwrites_for(interaction.guild.default_role)
        overwrite.connect = None if overwrite.connect is False else False
        await channel.set_permissions(interaction.guild.default_role, overwrite=overwrite, reason="JTC lock toggle")
        await interaction.response.send_message(f"Room **{'locked' if overwrite.connect is False else 'unlocked'}**.", ephemeral=True)

    @discord.ui.button(label="Hide / Show", emoji="👁️", style=discord.ButtonStyle.secondary, row=1)
    async def hide(self, interaction: discord.Interaction, button: discord.ui.Button):
        channel = interaction.guild.get_channel(self.channel_id)
        overwrite = channel.overwrites_for(interaction.guild.default_role)
        overwrite.view_channel = None if overwrite.view_channel is False else False
        await channel.set_permissions(interaction.guild.default_role, overwrite=overwrite, reason="JTC visibility toggle")
        await interaction.response.send_message(f"Room **{'hidden' if overwrite.view_channel is False else 'visible'}** to @everyone.", ephemeral=True)

    @discord.ui.button(label="Delete room", emoji="🗑️", style=discord.ButtonStyle.danger, row=1)
    async def delete(self, interaction: discord.Interaction, button: discord.ui.Button):
        channel = interaction.guild.get_channel(self.channel_id)
        await self.cog.delete_room(channel, "Deleted through JTC control panel")
        await interaction.response.send_message("Temporary room deleted.", ephemeral=True)


class JoinToCreate(commands.Cog):
    jtc = app_commands.Group(name="jtc", description="Join-to-Create temporary voice rooms")

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._guild_locks: dict[int, asyncio.Lock] = {}
        self._last_create: dict[int, float] = {}

    async def cog_load(self):
        async with self.bot.db._connect() as conn:
            await conn.execute("""CREATE TABLE IF NOT EXISTS jtc_settings (
                guild_id INTEGER PRIMARY KEY,
                trigger_channel_id INTEGER NOT NULL,
                category_id INTEGER NOT NULL,
                name_template TEXT NOT NULL DEFAULT '{username} room',
                default_limit INTEGER NOT NULL DEFAULT 0,
                cooldown_seconds INTEGER NOT NULL DEFAULT 5,
                enabled INTEGER NOT NULL DEFAULT 1
            )""")
            await conn.execute("""CREATE TABLE IF NOT EXISTS jtc_channels (
                channel_id INTEGER PRIMARY KEY,
                guild_id INTEGER NOT NULL,
                owner_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )""")
            await conn.commit()

        # A Group declared inside a Cog is not automatically exposed as a
        # top-level command in every discord.py Cog pattern. Register it explicitly.
        existing = self.bot.tree.get_command("jtc")
        if existing is None:
            self.bot.tree.add_command(self.jtc)

    async def get_settings(self, guild_id: int) -> Optional[dict]:
        async with self.bot.db._connect() as conn:
            conn.row_factory = aiosqlite.Row
            cur = await conn.execute("SELECT * FROM jtc_settings WHERE guild_id=?", (guild_id,))
            row = await cur.fetchone()
            return dict(row) if row else None

    async def get_channel_record(self, channel_id: int) -> Optional[dict]:
        async with self.bot.db._connect() as conn:
            conn.row_factory = aiosqlite.Row
            cur = await conn.execute("SELECT * FROM jtc_channels WHERE channel_id=?", (channel_id,))
            row = await cur.fetchone()
            return dict(row) if row else None

    async def find_owner_room(self, guild_id: int, owner_id: int) -> Optional[int]:
        async with self.bot.db._connect() as conn:
            cur = await conn.execute("SELECT channel_id FROM jtc_channels WHERE guild_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 1", (guild_id, owner_id))
            row = await cur.fetchone()
            return int(row[0]) if row else None

    async def delete_room(self, channel: Optional[discord.VoiceChannel], reason: str):
        if channel:
            try:
                await channel.delete(reason=reason)
            except discord.NotFound:
                pass
            except discord.Forbidden:
                logger.warning("Missing Manage Channels permission to delete JTC room %s", channel.id)
                return
            async with self.bot.db._connect() as conn:
                await conn.execute("DELETE FROM jtc_channels WHERE channel_id=?", (channel.id,))
                await conn.commit()

    async def cleanup_stale_records(self):
        for guild in self.bot.guilds:
            async with self.bot.db._connect() as conn:
                conn.row_factory = aiosqlite.Row
                cur = await conn.execute("SELECT channel_id FROM jtc_channels WHERE guild_id=?", (guild.id,))
                rows = await cur.fetchall()
                stale = [(row["channel_id"],) for row in rows if guild.get_channel(row["channel_id"]) is None]
                if stale:
                    await conn.executemany("DELETE FROM jtc_channels WHERE channel_id=?", stale)
                    await conn.commit()

    @commands.Cog.listener()
    async def on_ready(self):
        await self.cleanup_stale_records()

    @commands.Cog.listener()
    async def on_voice_state_update(self, member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
        settings = await self.get_settings(member.guild.id)
        if not settings or not settings["enabled"]:
            return

        if after.channel and after.channel.id == settings["trigger_channel_id"] and (before.channel is None or before.channel.id != after.channel.id):
            lock = self._guild_locks.setdefault(member.guild.id, asyncio.Lock())
            async with lock:
                now = time.monotonic()
                cooldown = settings["cooldown_seconds"]
                if now - self._last_create.get(member.id, 0) < cooldown:
                    return
                existing_id = await self.find_owner_room(member.guild.id, member.id)
                existing = member.guild.get_channel(existing_id) if existing_id else None
                if isinstance(existing, discord.VoiceChannel):
                    try:
                        await member.move_to(existing, reason="JTC: reuse existing owned room")
                    except discord.HTTPException:
                        pass
                    return
                category = member.guild.get_channel(settings["category_id"])
                if not isinstance(category, discord.CategoryChannel):
                    logger.error("Configured JTC category %s is missing in guild %s", settings["category_id"], member.guild.id)
                    return
                me = member.guild.me
                if not me or not me.guild_permissions.manage_channels or not me.guild_permissions.move_members:
                    logger.error("JTC requires Manage Channels and Move Members permissions in guild %s", member.guild.id)
                    return
                display = member.display_name[:80]
                room_name = settings["name_template"].replace("{username}", display).replace("{user}", display)[:100]
                # Preserve category role overwrites (for example, staff visibility) while
                # ensuring the creator and bot can manage the new room.
                overwrites = dict(category.overwrites)
                overwrites[member.guild.default_role] = discord.PermissionOverwrite(view_channel=True, connect=True)
                overwrites[member] = discord.PermissionOverwrite(view_channel=True, connect=True, manage_channels=True, move_members=True)
                overwrites[me] = discord.PermissionOverwrite(view_channel=True, connect=True, manage_channels=True, move_members=True)
                try:
                    room = await member.guild.create_voice_channel(
                        name=room_name or f"{display}'s room", category=category,
                        overwrites=overwrites, user_limit=settings["default_limit"],
                        reason=f"JTC room for {member} ({member.id})",
                    )
                    async with self.bot.db._connect() as conn:
                        await conn.execute("INSERT OR REPLACE INTO jtc_channels(channel_id,guild_id,owner_id,created_at) VALUES(?,?,?,?)", (room.id, member.guild.id, member.id, int(time.time())))
                        await conn.commit()
                    self._last_create[member.id] = now
                    await member.move_to(room, reason="Join-to-Create room created")
                except discord.HTTPException:
                    logger.exception("Could not create or move member into JTC room")
                    return

        if before.channel and before.channel != after.channel:
            record = await self.get_channel_record(before.channel.id)
            if record and not before.channel.members:
                await self.delete_room(before.channel, "JTC room became empty")
            elif record and record["owner_id"] == member.id and before.channel.members:
                # Automatic ownership handoff: the first remaining member becomes owner.
                new_owner = before.channel.members[0]
                async with self.bot.db._connect() as conn:
                    await conn.execute("UPDATE jtc_channels SET owner_id=? WHERE channel_id=?", (new_owner.id, before.channel.id))
                    await conn.commit()
                try:
                    await before.channel.set_permissions(new_owner, view_channel=True, connect=True, manage_channels=True, move_members=True)
                except discord.HTTPException:
                    logger.exception("Could not apply JTC ownership handoff for channel %s", before.channel.id)

    @jtc.command(name="setup", description="Configure Join-to-Create for this server")
    @app_commands.checks.has_permissions(manage_guild=True)
    @app_commands.describe(trigger="Voice channel members join to create a room", category="Category for temporary rooms", name_template="Use {username} or {user}", default_limit="0 means unlimited", cooldown="Creation cooldown in seconds")
    async def setup(self, interaction: discord.Interaction, trigger: discord.VoiceChannel, category: discord.CategoryChannel, name_template: str = "{username}'s room", default_limit: app_commands.Range[int, 0, 99] = 0, cooldown: app_commands.Range[int, 0, 60] = 5):
        if "{username}" not in name_template and "{user}" not in name_template:
            return await interaction.response.send_message("Name format must include `{username}` or `{user}`.", ephemeral=True)
        async with self.bot.db._connect() as conn:
            await conn.execute("""INSERT INTO jtc_settings(guild_id,trigger_channel_id,category_id,name_template,default_limit,cooldown_seconds,enabled)
                VALUES(?,?,?,?,?,?,1) ON CONFLICT(guild_id) DO UPDATE SET trigger_channel_id=excluded.trigger_channel_id,
                category_id=excluded.category_id,name_template=excluded.name_template,default_limit=excluded.default_limit,
                cooldown_seconds=excluded.cooldown_seconds,enabled=1""", (interaction.guild_id, trigger.id, category.id, name_template, default_limit, cooldown))
            await conn.commit()
        embed = discord.Embed(title="Join-to-Create configured", description=f"**Join channel:** {trigger.mention}\n**Room category:** {category.name}\n**Name:** `{name_template}`\n**Default limit:** {default_limit or 'Unlimited'}\n**Cooldown:** {cooldown}s", color=discord.Color.green())
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @jtc.command(name="config", description="Show Join-to-Create configuration")
    async def config(self, interaction: discord.Interaction):
        settings = await self.get_settings(interaction.guild_id) if interaction.guild_id else None
        if not settings:
            return await interaction.response.send_message("JTC is not configured. Run `/jtc setup`.", ephemeral=True)
        trigger = interaction.guild.get_channel(settings["trigger_channel_id"])
        category = interaction.guild.get_channel(settings["category_id"])
        embed = discord.Embed(title="Join-to-Create settings", color=discord.Color.blurple())
        embed.add_field(name="Join channel", value=trigger.mention if trigger else "Missing", inline=False)
        embed.add_field(name="Room category", value=category.name if category else "Missing", inline=False)
        embed.add_field(name="Name format", value=settings["name_template"], inline=True)
        embed.add_field(name="Default limit", value=str(settings["default_limit"] or "Unlimited"), inline=True)
        embed.add_field(name="Status", value="Enabled" if settings["enabled"] else "Disabled", inline=True)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @jtc.command(name="disable", description="Disable Join-to-Create")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def disable(self, interaction: discord.Interaction):
        async with self.bot.db._connect() as conn:
            await conn.execute("UPDATE jtc_settings SET enabled=0 WHERE guild_id=?", (interaction.guild_id,))
            await conn.commit()
        await interaction.response.send_message("Join-to-Create disabled.", ephemeral=True)

    @jtc.command(name="enable", description="Enable Join-to-Create")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def enable(self, interaction: discord.Interaction):
        async with self.bot.db._connect() as conn:
            cur = await conn.execute("UPDATE jtc_settings SET enabled=1 WHERE guild_id=?", (interaction.guild_id,))
            await conn.commit()
            changed = cur.rowcount
        await interaction.response.send_message("Join-to-Create enabled." if changed else "Run `/jtc setup` first.", ephemeral=True)

    @jtc.command(name="panel", description="Open controls for your current temporary voice room")
    async def panel(self, interaction: discord.Interaction):
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not isinstance(member.voice.channel, discord.VoiceChannel):
            return await interaction.response.send_message("Join your temporary voice room first.", ephemeral=True)
        record = await self.get_channel_record(member.voice.channel.id)
        if not record:
            return await interaction.response.send_message("You are not in a registered temporary room.", ephemeral=True)
        await interaction.response.send_message(f"Controls for {member.voice.channel.mention}", view=JTCControlView(self, member.voice.channel.id), ephemeral=True)

    @jtc.command(name="transfer", description="Transfer ownership of your current temporary room")
    async def transfer(self, interaction: discord.Interaction, member: discord.Member):
        owner = interaction.user
        if not isinstance(owner, discord.Member) or not owner.voice or not isinstance(owner.voice.channel, discord.VoiceChannel):
            return await interaction.response.send_message("Join your temporary room first.", ephemeral=True)
        channel = owner.voice.channel
        record = await self.get_channel_record(channel.id)
        if not record or record["owner_id"] != owner.id:
            return await interaction.response.send_message("Only the current room owner can transfer ownership.", ephemeral=True)
        if member not in channel.members:
            return await interaction.response.send_message("The new owner must be in the same voice room.", ephemeral=True)
        async with self.bot.db._connect() as conn:
            await conn.execute("UPDATE jtc_channels SET owner_id=? WHERE channel_id=?", (member.id, channel.id))
            await conn.commit()
        await channel.set_permissions(member, view_channel=True, connect=True, manage_channels=True, move_members=True)
        await interaction.response.send_message(f"Room ownership transferred to {member.mention}.", ephemeral=True)


    @jtc.command(name="add", description="Allow a member to join your temporary room")
    async def add_member(self, interaction: discord.Interaction, member: discord.Member):
        owner = interaction.user
        if not isinstance(owner, discord.Member) or not owner.voice or not isinstance(owner.voice.channel, discord.VoiceChannel):
            return await interaction.response.send_message("Join your temporary room first.", ephemeral=True)
        channel = owner.voice.channel
        record = await self.get_channel_record(channel.id)
        if not record or record["owner_id"] != owner.id:
            return await interaction.response.send_message("Only the room owner can add members.", ephemeral=True)
        await channel.set_permissions(member, view_channel=True, connect=True, reason="JTC owner added member")
        await interaction.response.send_message(f"{member.mention} can now view and join {channel.mention}.", ephemeral=True)

    @jtc.command(name="remove", description="Remove a member's access to your temporary room")
    async def remove_member(self, interaction: discord.Interaction, member: discord.Member):
        owner = interaction.user
        if not isinstance(owner, discord.Member) or not owner.voice or not isinstance(owner.voice.channel, discord.VoiceChannel):
            return await interaction.response.send_message("Join your temporary room first.", ephemeral=True)
        channel = owner.voice.channel
        record = await self.get_channel_record(channel.id)
        if not record or record["owner_id"] != owner.id:
            return await interaction.response.send_message("Only the room owner can remove members.", ephemeral=True)
        if member.id == owner.id:
            return await interaction.response.send_message("You cannot remove yourself as the room owner.", ephemeral=True)
        await channel.set_permissions(member, overwrite=None, reason="JTC owner removed member")
        if member.voice and member.voice.channel and member.voice.channel.id == channel.id:
            try:
                await member.move_to(None, reason="Removed from JTC room by owner")
            except discord.HTTPException:
                pass
        await interaction.response.send_message(f"Removed {member.mention}'s room-specific access.", ephemeral=True)

    @jtc.command(name="list", description="List active temporary voice rooms")
    async def list_rooms(self, interaction: discord.Interaction):
        async with self.bot.db._connect() as conn:
            conn.row_factory = aiosqlite.Row
            cur = await conn.execute("SELECT channel_id,owner_id FROM jtc_channels WHERE guild_id=?", (interaction.guild_id,))
            rows = await cur.fetchall()
        lines = []
        for row in rows:
            channel = interaction.guild.get_channel(row["channel_id"])
            owner = interaction.guild.get_member(row["owner_id"])
            if channel:
                owner_label = owner.mention if owner else f"<@{row['owner_id']}>"
                lines.append(f"{channel.mention} — {owner_label}")
        embed = discord.Embed(title="Active temporary rooms", description="\n".join(lines) if lines else "No active rooms.", color=discord.Color.blurple())
        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(JoinToCreate(bot))
