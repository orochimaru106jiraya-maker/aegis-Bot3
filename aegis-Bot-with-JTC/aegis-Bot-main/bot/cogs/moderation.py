import re
import json
import time
import datetime
import discord
from discord import app_commands
from discord.ext import commands
from typing import Optional
from utils.permissions import check_access, require_Hierarchy

URL_REGEX = re.compile(r"https?://\S+", re.IGNORECASE)


class ConfirmSensitiveActionView(discord.ui.View):
    def __init__(self, author_id: int):
        super().__init__(timeout=30)
        self.author_id = author_id
        self.confirmed: Optional[bool] = None

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author_id:
            await interaction.response.send_message("Only the invoking moderator can confirm this action.", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Confirm Action", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.confirmed = True
        self.stop()
        await interaction.response.defer()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.confirmed = False
        self.stop()
        await interaction.response.edit_message(content="Moderation action cancelled.", embed=None, view=None)


class ModerationCog(commands.Cog):
    """Complete Moderation, Purge, Snipe, and Case Logging Module."""

    def __init__(self, bot):
        self.bot = bot

    async def dispatch_mod_log(
        self,
        guild: discord.Guild,
        case_id: int,
        action: str,
        moderator: discord.abc.User,
        target_str: str,
        reason: str,
    ) -> discord.Embed:
        embed = discord.Embed(
            title=f"Moderation Case #{case_id} — {action}",
            color=discord.Color.red() if action in ("BAN", "KICK", "MUTE", "TIMEOUT") else discord.Color.blurple(),
            timestamp=datetime.datetime.now(datetime.timezone.utc),
        )
        embed.add_field(name="Target", value=target_str, inline=True)
        embed.add_field(name="Moderator", value=f"{moderator.mention} (`{moderator.id}`)", inline=True)
        embed.add_field(name="Reason", value=reason or "No reason provided", inline=False)

        settings = await self.bot.db.get_guild_settings(guild.id)
        log_chan_id = settings.get("mod_log_channel_id")
        if log_chan_id:
            chan = guild.get_channel(log_chan_id)
            if isinstance(chan, discord.TextChannel):
                try:
                    await chan.send(embed=embed)
                except discord.HTTPException:
                    pass
        return embed

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message):
        if not message.guild or message.author.bot:
            return
        ticket = await self.bot.db.get_ticket_by_channel(message.channel.id)
        if ticket is not None:
            return  # Never expose private ticket messages in /snipe

        attachments = [a.url for a in message.attachments]
        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO snipe_messages (
                    guild_id, channel_id, snipe_type, author_id, author_name,
                    before_content, attachments_json, is_ticket_channel, created_at
                ) VALUES (?, ?, 'delete', ?, ?, ?, ?, 0, ?)
                """,
                (
                    message.guild.id,
                    message.channel.id,
                    message.author.id,
                    str(message.author),
                    message.content or "",
                    json.dumps(attachments),
                    int(time.time()),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        if not before.guild or before.author.bot or before.content == after.content:
            return
        ticket = await self.bot.db.get_ticket_by_channel(before.channel.id)
        if ticket is not None:
            return  # Never expose private ticket messages

        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO snipe_messages (
                    guild_id, channel_id, snipe_type, author_id, author_name,
                    before_content, after_content, attachments_json, is_ticket_channel, created_at
                ) VALUES (?, ?, 'edit', ?, ?, ?, ?, '[]', 0, ?)
                """,
                (
                    before.guild.id,
                    before.channel.id,
                    before.author.id,
                    str(before.author),
                    before.content or "",
                    after.content or "",
                    int(time.time()),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()

    @commands.hybrid_command(name="ban", description="Ban a member from the server with confirmation.")
    @check_access("ban", default_mod=True)
    async def ban_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Violation of server rules"):
        ok, err = require_Hierarchy(ctx.author, member)
        if not ok:
            return await ctx.reply(err, ephemeral=True)

        view = ConfirmSensitiveActionView(ctx.author.id)
        prompt_msg = await ctx.reply(
            f"Confirm permanent ban of **{member}** (`{member.id}`)?\nReason: `{reason}`",
            view=view,
        )
        await view.wait()
        if not view.confirmed:
            return

        await ctx.guild.ban(member, reason=f"{ctx.author}: {reason}")
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "BAN", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "BAN", ctx.author, f"{member} (`{member.id}`)", reason)
        await prompt_msg.edit(content=None, embed=embed, view=None)

    @commands.hybrid_command(name="unban", description="Unban a user by their Discord User ID.")
    @check_access("unban", default_mod=True)
    async def unban_cmd(self, ctx: commands.Context, user_id: str, *, reason: str = "Appeal accepted"):
        if not user_id.isdigit():
            return await ctx.reply("Please provide a valid numeric Discord User ID.", ephemeral=True)
        uid = int(user_id)
        user_obj = discord.Object(id=uid)
        await ctx.guild.unban(user_obj, reason=f"{ctx.author}: {reason}")
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "UNBAN", uid, f"User#{uid}", ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "UNBAN", ctx.author, f"`{uid}`", reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="kick", description="Kick a member from the server.")
    @check_access("kick", default_mod=True)
    async def kick_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Kicked by moderator"):
        ok, err = require_Hierarchy(ctx.author, member)
        if not ok:
            return await ctx.reply(err, ephemeral=True)
        await member.kick(reason=f"{ctx.author}: {reason}")
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "KICK", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "KICK", ctx.author, f"{member.mention}", reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="timeout", description="Timeout a member for a specified number of minutes.")
    @check_access("timeout", default_mod=True)
    async def timeout_cmd(
        self, ctx: commands.Context, member: discord.Member, minutes: int = 10, *, reason: str = "Timed out"
    ):
        ok, err = require_Hierarchy(ctx.author, member)
        if not ok:
            return await ctx.reply(err, ephemeral=True)
        duration = datetime.timedelta(minutes=max(1, min(40320, minutes)))
        await member.timeout(duration, reason=f"{ctx.author}: {reason}")
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "TIMEOUT", member.id, str(member), ctx.author.id, str(ctx.author), f"({minutes}m) {reason}"
        )
        embed = await self.dispatch_mod_log(
            ctx.guild, case_id, "TIMEOUT", ctx.author, f"{member.mention}", f"{minutes} minutes — {reason}"
        )
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="untimeout", description="Remove an active timeout from a member.")
    @check_access("untimeout", default_mod=True)
    async def untimeout_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Timeout lifted"):
        await member.timeout(None, reason=f"{ctx.author}: {reason}")
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "UNTIMEOUT", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "UNTIMEOUT", ctx.author, f"{member.mention}", reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="warn", description="Issue a formal warning to a member.")
    @check_access("warn", default_mod=True)
    async def warn_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str):
        ok, err = require_Hierarchy(ctx.author, member)
        if not ok:
            return await ctx.reply(err, ephemeral=True)
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "WARN", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "WARN", ctx.author, f"{member.mention}", reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="warnings", description="List active warnings for a member.")
    @check_access("warnings", default_mod=True)
    async def warnings_cmd(self, ctx: commands.Context, member: discord.Member):
        cases = await self.bot.db.get_mod_cases(ctx.guild.id, target_id=member.id, action="WARN")
        embed = discord.Embed(
            title=f"Active Warnings — {member} ({len(cases)})",
            color=discord.Color.orange(),
        )
        if not cases:
            embed.description = "This member has no active warnings."
        else:
            for c in cases[:15]:
                embed.add_field(
                    name=f"Case #{c['case_id']} • <t:{c['created_at']}:d>",
                    value=f"**Moderator:** {c['moderator_name']}\n**Reason:** {c['reason']}",
                    inline=False,
                )
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="clearwarnings", description="Clear all active warnings for a member.")
    @check_access("clearwarnings", default_mod=True)
    async def clearwarnings_cmd(self, ctx: commands.Context, member: discord.Member):
        cleared = await self.bot.db.clear_warnings(ctx.guild.id, member.id)
        await ctx.reply(f"Cleared `{cleared}` active warning(s) for {member.mention}.")

    @commands.hybrid_command(name="lock", description="Lock the current text channel for @everyone.")
    @check_access("lock", default_mod=True)
    async def lock_cmd(self, ctx: commands.Context, *, reason: str = "Channel locked"):
        await ctx.channel.set_permissions(ctx.guild.default_role, send_messages=False, reason=reason)
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "LOCK", ctx.channel.id, f"#{ctx.channel.name}", ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "LOCK", ctx.author, ctx.channel.mention, reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="unlock", description="Unlock the current text channel for @everyone.")
    @check_access("unlock", default_mod=True)
    async def unlock_cmd(self, ctx: commands.Context, *, reason: str = "Channel unlocked"):
        await ctx.channel.set_permissions(ctx.guild.default_role, send_messages=None, reason=reason)
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "UNLOCK", ctx.channel.id, f"#{ctx.channel.name}", ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "UNLOCK", ctx.author, ctx.channel.mention, reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="slowmode", description="Configure channel slowmode delay in seconds (0-21600).")
    @check_access("slowmode", default_mod=True)
    async def slowmode_cmd(self, ctx: commands.Context, seconds: int = 0):
        delay = max(0, min(21600, seconds))
        await ctx.channel.edit(slowmode_delay=delay)
        await ctx.reply(f"Slowmode for {ctx.channel.mention} set to `{delay}` seconds.")

    @commands.hybrid_command(name="hide", description="Hide the current channel from @everyone.")
    @check_access("hide", default_mod=True)
    async def hide_cmd(self, ctx: commands.Context):
        await ctx.channel.set_permissions(ctx.guild.default_role, view_channel=False)
        await ctx.reply(f"{ctx.channel.mention} is now hidden from `@everyone`.")

    @commands.hybrid_command(name="unhide", description="Unhide the current channel for @everyone.")
    @check_access("unhide", default_mod=True)
    async def unhide_cmd(self, ctx: commands.Context):
        await ctx.channel.set_permissions(ctx.guild.default_role, view_channel=None)
        await ctx.reply(f"{ctx.channel.mention} is now visible to `@everyone`.")

    @commands.hybrid_command(name="mute", description="Role-mute a member across text channels.")
    @check_access("mute", default_mod=True)
    async def mute_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Muted"):
        ok, err = require_Hierarchy(ctx.author, member)
        if not ok:
            return await ctx.reply(err, ephemeral=True)
        settings = await self.bot.db.get_guild_settings(ctx.guild.id)
        mute_role = ctx.guild.get_role(settings.get("mute_role_id")) if settings.get("mute_role_id") else None
        if not mute_role:
            mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
        if not mute_role:
            mute_role = await ctx.guild.create_role(name="Muted", reason="Auto-created Muted role")
            for ch in ctx.guild.text_channels:
                await ch.set_permissions(mute_role, send_messages=False)
            await self.bot.db.update_guild_settings(ctx.guild.id, mute_role_id=mute_role.id)

        await member.add_roles(mute_role, reason=reason)
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "MUTE", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "MUTE", ctx.author, member.mention, reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="unmute", description="Remove the Muted role from a member.")
    @check_access("unmute", default_mod=True)
    async def unmute_cmd(self, ctx: commands.Context, member: discord.Member, *, reason: str = "Unmuted"):
        settings = await self.bot.db.get_guild_settings(ctx.guild.id)
        mute_role = ctx.guild.get_role(settings.get("mute_role_id")) or discord.utils.get(ctx.guild.roles, name="Muted")
        if mute_role and mute_role in member.roles:
            await member.remove_roles(mute_role, reason=reason)
        case_id = await self.bot.db.add_mod_case(
            ctx.guild.id, "UNMUTE", member.id, str(member), ctx.author.id, str(ctx.author), reason
        )
        embed = await self.dispatch_mod_log(ctx.guild, case_id, "UNMUTE", ctx.author, member.mention, reason)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="modlogs", description="View moderation history for the server or a specific member.")
    @check_access("modlogs", default_mod=True)
    async def modlogs_cmd(self, ctx: commands.Context, member: Optional[discord.Member] = None):
        cases = await self.bot.db.get_mod_cases(ctx.guild.id, target_id=member.id if member else None)
        embed = discord.Embed(
            title=f"Moderation Logs ({len(cases)} record(s))",
            color=discord.Color.blurple(),
        )
        for c in cases[:12]:
            embed.add_field(
                name=f"Case #{c['case_id']} • {c['action']} • <t:{c['created_at']}:R>",
                value=f"**Target:** {c['target_name']}\n**Mod:** {c['moderator_name']}\n**Reason:** {c['reason']}",
                inline=False,
            )
        if not cases:
            embed.description = "No moderation records found."
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="case", description="Inspect details of a specific moderation case ID.")
    @check_access("case", default_mod=True)
    async def case_cmd(self, ctx: commands.Context, case_id: int):
        c = await self.bot.db.get_case_by_id(ctx.guild.id, case_id)
        if not c:
            return await ctx.reply(f"Case `#{case_id}` not found.", ephemeral=True)
        embed = discord.Embed(
            title=f"Case #{c['case_id']} — {c['action']}",
            color=discord.Color.blurple(),
        )
        embed.add_field(name="Target", value=f"{c['target_name']} (`{c['target_id']}`)", inline=True)
        embed.add_field(name="Moderator", value=f"{c['moderator_name']} (`{c['moderator_id']}`)", inline=True)
        embed.add_field(name="Timestamp", value=f"<t:{c['created_at']}:F>", inline=False)
        embed.add_field(name="Reason", value=c["reason"], inline=False)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="purge", description="Bulk-delete messages with optional filters (user, words, links, attachments, bots).")
    @check_access("purge", default_mod=True)
    async def purge_cmd(
        self,
        ctx: commands.Context,
        amount: int = 20,
        user: Optional[discord.Member] = None,
        contains: Optional[str] = None,
        links_only: bool = False,
        attachments_only: bool = False,
        bots_only: bool = False,
    ):
        limit = max(1, min(100, amount))

        def check_msg(msg: discord.Message) -> bool:
            if user and msg.author.id != user.id:
                return False
            if contains and contains.lower() not in (msg.content or "").lower():
                return False
            if links_only and not URL_REGEX.search(msg.content or ""):
                return False
            if attachments_only and not msg.attachments:
                return False
            if bots_only and not msg.author.bot:
                return False
            return True

        await ctx.defer(ephemeral=True)
        deleted = await ctx.channel.purge(limit=limit, check=check_msg, bulk=True)
        embed = discord.Embed(
            title="Purge Complete",
            description=f"Deleted **{len(deleted)}** message(s) in {ctx.channel.mention} matching your filter criteria.",
            color=discord.Color.green(),
        )
        await ctx.send(embed=embed, ephemeral=True)

    @commands.hybrid_command(name="snipe", description="Recover recently deleted messages in this channel (excludes private tickets).")
    @check_access("snipe", default_mod=True)
    async def snipe_cmd(self, ctx: commands.Context, index: int = 1):
        ticket = await self.bot.db.get_ticket_by_channel(ctx.channel.id)
        if ticket is not None:
            return await ctx.reply("Snipe is disabled inside private ticket channels for privacy.", ephemeral=True)

        settings = await self.bot.db.get_guild_settings(ctx.guild.id)
        max_hist = settings.get("snipe_history_limit", 10)
        idx = max(1, min(max_hist, index)) - 1

        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                """
                SELECT * FROM snipe_messages
                WHERE guild_id = ? AND channel_id = ? AND snipe_type = 'delete' AND is_ticket_channel = 0
                ORDER BY created_at DESC LIMIT ?
                """,
                (ctx.guild.id, ctx.channel.id, max_hist),
            )
            rows = await cursor.fetchall()
        finally:
            await conn.close()

        if idx >= len(rows):
            return await ctx.reply("No deleted message found at that history position.", ephemeral=True)

        row = dict(rows[idx])
        embed = discord.Embed(
            title=f"Deleted Message (#{idx + 1}/{len(rows)})",
            description=row["before_content"] or "*[No text content]*",
            color=discord.Color.orange(),
        )
        embed.set_author(name=f"{row['author_name']} ({row['author_id']})")
        embed.add_field(name="Deleted", value=f"<t:{row['created_at']}:R>", inline=True)
        attachments = json.loads(row.get("attachments_json") or "[]")
        if attachments:
            embed.add_field(name="Attachments", value="\n".join(attachments[:5]), inline=False)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="editsnipe", description="Recover recently edited messages in this channel.")
    @check_access("editsnipe", default_mod=True)
    async def editsnipe_cmd(self, ctx: commands.Context, index: int = 1):
        ticket = await self.bot.db.get_ticket_by_channel(ctx.channel.id)
        if ticket is not None:
            return await ctx.reply("EditSnipe is disabled inside private ticket channels.", ephemeral=True)

        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                """
                SELECT * FROM snipe_messages
                WHERE guild_id = ? AND channel_id = ? AND snipe_type = 'edit' AND is_ticket_channel = 0
                ORDER BY created_at DESC LIMIT 10
                """,
                (ctx.guild.id, ctx.channel.id),
            )
            rows = await cursor.fetchall()
        finally:
            await conn.close()

        idx = max(1, min(10, index)) - 1
        if idx >= len(rows):
            return await ctx.reply("No edited message found at that index.", ephemeral=True)

        row = dict(rows[idx])
        embed = discord.Embed(title=f"Edited Message (#{idx + 1}/{len(rows)})", color=discord.Color.blurple())
        embed.set_author(name=f"{row['author_name']} ({row['author_id']})")
        embed.add_field(name="Before", value=(row["before_content"] or "*Empty*")[:1024], inline=False)
        embed.add_field(name="After", value=(row["after_content"] or "*Empty*")[:1024], inline=False)
        await ctx.reply(embed=embed)


async def setup(bot):
    await bot.add_cog(ModerationCog(bot))
