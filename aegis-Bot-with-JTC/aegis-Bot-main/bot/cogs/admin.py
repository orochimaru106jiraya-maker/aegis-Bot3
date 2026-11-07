import io
import json
import time
import platform
import discord
from discord.ext import commands
from typing import Optional
from utils.permissions import check_access


class AdminCog(commands.Cog):
    """Complete Server Administration, Info, Permissions, and Configuration Backup Module."""

    def __init__(self, bot):
        self.bot = bot
        self.started_at = int(time.time())

    @commands.hybrid_command(name="serverinfo", description="Display comprehensive server statistics and configuration.")
    async def serverinfo_cmd(self, ctx: commands.Context):
        g = ctx.guild
        embed = discord.Embed(title=f"Server Information — {g.name}", color=discord.Color.blurple())
        embed.add_field(name="Owner", value=f"<@{g.owner_id}>", inline=True)
        embed.add_field(name="Members", value=f"`{g.member_count}`", inline=True)
        embed.add_field(name="Roles", value=f"`{len(g.roles)}`", inline=True)
        embed.add_field(name="Text Channels", value=f"`{len(g.text_channels)}`", inline=True)
        embed.add_field(name="Voice Channels", value=f"`{len(g.voice_channels)}`", inline=True)
        embed.add_field(name="Boost Tier", value=f"Level `{g.premium_tier}` (`{g.premium_subscription_count}` boosts)", inline=True)
        embed.set_footer(text=f"Guild ID: {g.id}")
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="userinfo", description="Inspect a member's account, join date, and roles.")
    async def userinfo_cmd(self, ctx: commands.Context, member: Optional[discord.Member] = None):
        target = member or ctx.author
        roles = [r.mention for r in target.roles if r != ctx.guild.default_role]
        embed = discord.Embed(title=f"User Information — {target}", color=target.color or discord.Color.blurple())
        embed.add_field(name="User ID", value=f"`{target.id}`", inline=True)
        embed.add_field(name="Account Created", value=f"<t:{int(target.created_at.timestamp())}:R>", inline=True)
        if target.joined_at:
            embed.add_field(name="Joined Server", value=f"<t:{int(target.joined_at.timestamp())}:R>", inline=True)
        embed.add_field(name=f"Roles ({len(roles)})", value=" ".join(roles[:15]) or "None", inline=False)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="roleinfo", description="Inspect details and permissions of a server role.")
    async def roleinfo_cmd(self, ctx: commands.Context, role: discord.Role):
        embed = discord.Embed(title=f"Role Information — {role.name}", color=role.color)
        embed.add_field(name="Role ID", value=f"`{role.id}`", inline=True)
        embed.add_field(name="Members", value=f"`{len(role.members)}`", inline=True)
        embed.add_field(name="Position", value=f"`{role.position}`", inline=True)
        embed.add_field(name="Mentionable", value=f"`{role.mentionable}`", inline=True)
        embed.add_field(name="Hoisted", value=f"`{role.hoist}`", inline=True)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="channelinfo", description="Inspect details of a text or voice channel.")
    async def channelinfo_cmd(self, ctx: commands.Context, channel: Optional[discord.TextChannel] = None):
        ch = channel or ctx.channel
        embed = discord.Embed(title=f"Channel Information — #{ch.name}", color=discord.Color.blurple())
        embed.add_field(name="Channel ID", value=f"`{ch.id}`", inline=True)
        embed.add_field(name="Category", value=ch.category.name if ch.category else "None", inline=True)
        embed.add_field(name="Slowmode", value=f"`{ch.slowmode_delay}s`", inline=True)
        embed.add_field(name="Created", value=f"<t:{int(ch.created_at.timestamp())}:R>", inline=True)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="botinfo", description="Display AegisBot runtime metrics and architecture.")
    async def botinfo_cmd(self, ctx: commands.Context):
        embed = discord.Embed(title="AegisBot — Runtime & Architecture", color=discord.Color.blurple())
        embed.add_field(name="discord.py Version", value=f"`{discord.__version__}`", inline=True)
        embed.add_field(name="Python Version", value=f"`{platform.python_version()}`", inline=True)
        embed.add_field(name="Latency", value=f"`{round(self.bot.latency * 1000)}ms`", inline=True)
        embed.add_field(name="Uptime Since", value=f"<t:{self.started_at}:R>", inline=True)
        embed.add_field(name="Connected Guilds", value=f"`{len(self.bot.guilds)}`", inline=True)
        embed.add_field(name="Storage Engine", value="`SQLite (WAL + aiosqlite)`", inline=True)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="setprefix", description="Change the hybrid command prefix for this server.")
    @check_access("setprefix", default_admin=True)
    async def setprefix_cmd(self, ctx: commands.Context, new_prefix: str):
        prefix = new_prefix.strip()[:5]
        await self.bot.db.update_guild_settings(ctx.guild.id, prefix=prefix)
        await ctx.reply(f"Server command prefix updated to `{prefix}`.")

    @commands.hybrid_command(name="setlanguage", description="Set the bot localization language code (en, es, fr, de, hi).")
    @check_access("setlanguage", default_admin=True)
    async def setlanguage_cmd(self, ctx: commands.Context, language_code: str):
        lang = language_code.strip().lower()[:5]
        await self.bot.db.update_guild_settings(ctx.guild.id, language=lang)
        await ctx.reply(f"Server language updated to `{lang}`.")

    @commands.hybrid_command(name="setlogs", description="Set moderation and server log channels.")
    @check_access("setlogs", default_admin=True)
    async def setlogs_cmd(
        self,
        ctx: commands.Context,
        mod_log_channel: discord.TextChannel,
        server_log_channel: Optional[discord.TextChannel] = None,
    ):
        await self.bot.db.update_guild_settings(
            ctx.guild.id,
            mod_log_channel_id=mod_log_channel.id,
            server_log_channel_id=server_log_channel.id if server_log_channel else mod_log_channel.id,
        )
        await ctx.reply(f"Moderation logs bound to {mod_log_channel.mention}.")

    @commands.hybrid_command(name="settings", description="Display a complete overview of persistent server settings.")
    @check_access("settings", default_admin=True)
    async def settings_cmd(self, ctx: commands.Context):
        s = await self.bot.db.get_guild_settings(ctx.guild.id)
        t = await self.bot.db.get_ticket_settings(ctx.guild.id)
        mod_log_str = f"<#{s['mod_log_channel_id']}>" if s.get("mod_log_channel_id") else "Unset"
        panel_ch_str = f"<#{t['panel_channel_id']}>" if t.get("panel_channel_id") else "Unset"
        trans_ch_str = f"<#{t['transcript_channel_id']}>" if t.get("transcript_channel_id") else "Unset"
        embed = discord.Embed(title=f"Server Configuration Overview — {ctx.guild.name}", color=discord.Color.blurple())
        embed.add_field(name="Prefix & Language", value=f"Prefix: `{s['prefix']}` | Lang: `{s['language']}`", inline=False)
        embed.add_field(
            name="Moderation & Logging",
            value=(
                f"Mod Logs: {mod_log_str}\n"
                f"Mod Roles: {', '.join(f'<@&{r}>' for r in s['mod_role_ids']) or 'None'}\n"
                f"Admin Roles: {', '.join(f'<@&{r}>' for r in s['admin_role_ids']) or 'None'}"
            ),
            inline=False,
        )
        embed.add_field(
            name="Ticket System",
            value=(
                f"Panel Channel: {panel_ch_str}\n"
                f"Transcript Channel: {trans_ch_str}\n"
                f"Max Open/User: `{t['max_open_per_user']}` | Auto-Delete: `{t['auto_delete_seconds']}s`"
            ),
            inline=False,
        )
        await ctx.reply(embed=embed, ephemeral=True)

    @commands.hybrid_command(name="permissions", description="Configure role-based access or enable/disable a specific command.")
    @check_access("permissions", default_admin=True)
    async def permissions_cmd(
        self,
        ctx: commands.Context,
        command_name: str,
        enabled: bool = True,
        require_admin: bool = False,
        require_mod: bool = True,
        allowed_role: Optional[discord.Role] = None,
    ):
        role_ids = [allowed_role.id] if allowed_role else []
        await self.bot.db.set_command_permission(
            guild_id=ctx.guild.id,
            command_name=command_name.lower().lstrip("/"),
            module_name="custom",
            enabled=enabled,
            require_admin=require_admin,
            require_mod=require_mod,
            allowed_role_ids=role_ids,
        )
        await ctx.reply(
            f"Updated RBAC permission policy for `/{command_name.lstrip('/')}` (Enabled: `{enabled}`, Mod Required: `{require_mod}`).",
            ephemeral=True,
        )

    @commands.hybrid_command(name="dashboard", description="Export a JSON backup of server settings or open the interactive dashboard.")
    @check_access("dashboard", default_admin=True)
    async def dashboard_cmd(self, ctx: commands.Context, export_backup: bool = False):
        if export_backup:
            s = await self.bot.db.get_guild_settings(ctx.guild.id)
            t = await self.bot.db.get_ticket_settings(ctx.guild.id)
            payload = json.dumps({"guild_settings": s, "ticket_settings": t}, indent=2)
            return await ctx.reply(
                content="Server configuration backup generated:",
                file=discord.File(io.BytesIO(payload.encode("utf-8")), filename=f"guild-{ctx.guild.id}-backup.json"),
                ephemeral=True,
            )
        setup_cog = self.bot.get_cog("SetupWizardCog")
        if setup_cog:
            await setup_cog.setup_cmd(ctx)


async def setup(bot):
    await bot.add_cog(AdminCog(bot))
