import discord
from discord.ext import commands
from utils.permissions import validate_member_access


class PrefixLanguageModal(discord.ui.Modal, title="Configure Prefix & Language"):
    prefix_input = discord.ui.TextInput(
        label="Command Prefix",
        placeholder="!",
        min_length=1,
        max_length=5,
        required=True,
    )
    language_input = discord.ui.TextInput(
        label="Language Code (en, es, fr, de, hi)",
        placeholder="en",
        min_length=2,
        max_length=5,
        required=True,
    )

    def __init__(self, bot):
        super().__init__()
        self.bot = bot

    async def on_submit(self, interaction: discord.Interaction):
        allowed, reason = await validate_member_access(
            self.bot, interaction.user, "setup", default_admin=True
        )
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        await self.bot.db.update_guild_settings(
            interaction.guild.id,
            prefix=self.prefix_input.value.strip(),
            language=self.language_input.value.strip().lower(),
        )
        await interaction.response.send_message(
            f"Updated server prefix to `{self.prefix_input.value.strip()}` and language to `{self.language_input.value.strip().lower()}`.",
            ephemeral=True,
        )


class SetupSectionSelect(discord.ui.Select):
    def __init__(self, bot):
        self.bot = bot
        options = [
            discord.SelectOption(
                label="1. Moderation & Logging Setup",
                value="moderation",
                description="Configure mod roles, admin roles, and mod log channel",
            ),
            discord.SelectOption(
                label="2. Ticket System Setup (4 Categories)",
                value="tickets",
                description="Configure ticket panel, categories, staff roles, and transcripts",
            ),
            discord.SelectOption(
                label="3. Activity Auto-Roles Setup",
                value="activity_roles",
                description="Spotify, Gaming, Voice Chat, and Text Chat milestones",
            ),
            discord.SelectOption(
                label="4. Reaction Roles Setup",
                value="reaction_roles",
                description="Interactive self-assignable role panels",
            ),
            discord.SelectOption(
                label="5. Music & DJ Setup",
                value="music",
                description="Configure DJ role and voice inactivity limits",
            ),
            discord.SelectOption(
                label="6. Auto Responder & Local AI Setup",
                value="ai_auto",
                description="Manage local AI knowledge base, AI channel, and triggers",
            ),
            discord.SelectOption(
                label="7. Permission & RBAC Management",
                value="permissions",
                description="Configure command-level role and user permissions",
            ),
            discord.SelectOption(
                label="8. Custom Embed Builder",
                value="embeds",
                description="Launch the interactive /embed template studio",
            ),
        ]
        super().__init__(
            placeholder="Choose a module to configure...",
            min_values=1,
            max_values=1,
            options=options,
        )

    async def callback(self, interaction: discord.Interaction):
        allowed, reason = await validate_member_access(
            self.bot, interaction.user, "setup", default_admin=True
        )
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        choice = self.values[0]
        settings = await self.bot.db.get_guild_settings(interaction.guild.id)
        ticket_cfg = await self.bot.db.get_ticket_settings(interaction.guild.id)

        embed = discord.Embed(color=discord.Color.blurple())
        if choice == "tickets":
            panel_ch = f"<#{ticket_cfg['panel_channel_id']}>" if ticket_cfg.get("panel_channel_id") else "Not set"
            trans_ch = f"<#{ticket_cfg['transcript_channel_id']}>" if ticket_cfg.get("transcript_channel_id") else "Not set"
            embed.title = "Ticket System Configuration"
            embed.description = (
                "Use `/ticket setup` to launch the dedicated Ticket Wizard, or review current status below:\n\n"
                f"• **Panel Channel**: {panel_ch}\n"
                f"• **Transcript Channel**: {trans_ch}\n"
                f"• **Max Open Tickets / User**: `{ticket_cfg.get('max_open_per_user', 2)}`\n"
                f"• **Auto-Delete Delay**: `{ticket_cfg.get('auto_delete_seconds', 300)}s`\n"
                "• **Configured Categories**: General Help, File a Complaint, Apply for a Staff Role, Claim Winning Prize"
            )
        elif choice == "moderation":
            mod_ch = f"<#{settings['mod_log_channel_id']}>" if settings.get("mod_log_channel_id") else "Not set"
            srv_ch = f"<#{settings['server_log_channel_id']}>" if settings.get("server_log_channel_id") else "Not set"
            embed.title = "Moderation & Logging Setup"
            embed.description = (
                f"• **Mod Log Channel**: {mod_ch}\n"
                f"• **Server Log Channel**: {srv_ch}\n"
                f"• **Mod Roles**: {', '.join(f'<@&{r}>' for r in settings.get('mod_role_ids', [])) or 'None configured'}\n"
                f"• **Snipe History Limit**: `{settings.get('snipe_history_limit', 10)}` messages/channel\n\n"
                "Use `/setlogs` and `/permissions` to update channels and role assignments."
            )
        else:
            embed.title = f"Module Setup: {choice.replace('_', ' ').title()}"
            embed.description = (
                "All module settings are stored in SQLite and persist across restarts.\n"
                "Use the buttons below or dedicated slash commands (`/ticket setup`, `/permissions`, `/embed`, `/ai`) to customize further."
            )

        await interaction.response.edit_message(embed=embed, view=self.view)


class SetupWizardView(discord.ui.View):
    def __init__(self, bot):
        super().__init__(timeout=600)
        self.bot = bot
        self.add_item(SetupSectionSelect(bot))

    @discord.ui.button(label="Edit Prefix & Language", style=discord.ButtonStyle.primary, row=1)
    async def edit_prefix_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(PrefixLanguageModal(self.bot))

    @discord.ui.button(label="Refresh Overview", style=discord.ButtonStyle.secondary, row=1)
    async def refresh_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        cog = self.bot.get_cog("SetupWizardCog")
        if cog:
            embed = await cog.build_overview_embed(interaction.guild)
            await interaction.response.edit_message(embed=embed, view=self)


class SetupWizardCog(commands.Cog):
    """Interactive /setup and /dashboard command suite."""

    def __init__(self, bot):
        self.bot = bot

    async def build_overview_embed(self, guild: discord.Guild) -> discord.Embed:
        settings = await self.bot.db.get_guild_settings(guild.id)
        ticket_cfg = await self.bot.db.get_ticket_settings(guild.id)
        panel_str = f"<#{ticket_cfg['panel_channel_id']}>" if ticket_cfg.get("panel_channel_id") else "Unset"
        trans_str = f"<#{ticket_cfg['transcript_channel_id']}>" if ticket_cfg.get("transcript_channel_id") else "Unset"
        mod_log_str = f"<#{settings['mod_log_channel_id']}>" if settings.get("mod_log_channel_id") else "Unset"
        ai_ch_str = f"<#{settings['ai_channel_id']}>" if settings.get("ai_channel_id") else "Unset"

        embed = discord.Embed(
            title=f"AegisBot Interactive Setup Wizard — {guild.name}",
            description=(
                "Manage all server modules, ticket categories, RBAC permissions, and logging "
                "directly inside Discord without editing any Python code."
            ),
            color=discord.Color.blurple(),
        )
        embed.add_field(
            name="Core & Administration",
            value=(
                f"Prefix: `{settings.get('prefix', '!')}`\n"
                f"Language: `{settings.get('language', 'en')}`\n"
                f"Mod Roles: `{len(settings.get('mod_role_ids', []))}` configured"
            ),
            inline=True,
        )
        embed.add_field(
            name="Ticket System (4 Types)",
            value=(
                f"Panel: {panel_str}\n"
                f"Transcripts: {trans_str}\n"
                f"Max Open/User: `{ticket_cfg.get('max_open_per_user', 2)}`"
            ),
            inline=True,
        )
        embed.add_field(
            name="Logging & AI",
            value=(
                f"Mod Logs: {mod_log_str}\n"
                f"AI Channel: {ai_ch_str}\n"
                f"Snipe Cap: `{settings.get('snipe_history_limit', 10)}`"
            ),
            inline=True,
        )
        embed.set_footer(text="Select any section from the dropdown below to configure.")
        return embed

    @commands.hybrid_command(name="setup", description="Open the interactive all-in-one server setup dashboard.")
    async def setup_cmd(self, ctx: commands.Context):
        allowed, reason = await validate_member_access(self.bot, ctx.author, "setup", default_admin=True)
        if not allowed:
            return await ctx.reply(reason, ephemeral=True)
        embed = await self.build_overview_embed(ctx.guild)
        await ctx.reply(embed=embed, view=SetupWizardView(self.bot), ephemeral=True)


async def setup(bot):
    await bot.add_cog(SetupWizardCog(bot))
