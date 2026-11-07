import io
import time
import asyncio
import datetime
import discord
from discord import app_commands
from discord.ext import commands
from typing import Dict, Any, List, Optional
from utils.permissions import validate_member_access


class TicketQuestionnaireModal(discord.ui.Modal):
    """Dynamic modal presenting the configured questions for one of the 4 ticket categories."""

    def __init__(self, bot, category_key: str, category_cfg: Dict[str, Any]):
        super().__init__(title=f"Ticket — {category_cfg['label']}"[:45])
        self.bot = bot
        self.category_key = category_key
        self.category_cfg = category_cfg
        self.question_inputs: List[discord.ui.TextInput] = []

        for idx, question_text in enumerate(category_cfg.get("questions", [])[:5]):
            inp = discord.ui.TextInput(
                label=question_text[:45],
                style=discord.TextStyle.paragraph if idx > 0 else discord.TextStyle.short,
                placeholder="Enter your detailed response...",
                required=True,
                max_length=1000,
            )
            self.question_inputs.append(inp)
            self.add_item(inp)

    async def on_submit(self, interaction: discord.Interaction):
        guild = interaction.guild
        user = interaction.user
        ticket_settings = await self.bot.db.get_ticket_settings(guild.id)
        open_tickets = await self.bot.db.get_open_user_tickets(guild.id, user.id)

        max_open = ticket_settings.get("max_open_per_user", 2)
        if len(open_tickets) >= max_open:
            return await interaction.response.send_message(
                f"You already have `{len(open_tickets)}` open ticket(s) (maximum allowed is `{max_open}`).",
                ephemeral=True,
            )

        for existing in open_tickets:
            if existing["category_key"] == self.category_key:
                return await interaction.response.send_message(
                    f"You already have an open **{self.category_cfg['label']}** ticket in <#{existing['channel_id']}>.",
                    ephemeral=True,
                )

        await interaction.response.defer(ephemeral=True)

        naming_format = self.category_cfg.get("naming_format") or f"{self.category_key}-{{username}}"
        safe_username = "".join(c for c in user.name.lower() if c.isalnum() or c == "-") or "user"
        channel_name = naming_format.replace("{username}", safe_username).replace("{id}", str(user.id))[:95]

        category_channel_id = self.category_cfg.get("category_channel_id")
        discord_category = guild.get_channel(category_channel_id) if category_channel_id else None
        if not isinstance(discord_category, discord.CategoryChannel):
            discord_category = None

        overwrites = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            guild.me: discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                manage_channels=True,
                manage_messages=True,
                read_message_history=True,
                attach_files=True,
            ),
            user: discord.PermissionOverwrite(
                view_channel=True,
                send_messages=True,
                read_message_history=True,
                attach_files=True,
                embed_links=True,
            ),
        }

        guild_settings = await self.bot.db.get_guild_settings(guild.id)
        staff_role_ids = set(self.category_cfg.get("staff_role_ids", [])) | set(
            guild_settings.get("mod_role_ids", [])
        ) | set(guild_settings.get("admin_role_ids", []))

        for role_id in staff_role_ids:
            role = guild.get_role(role_id)
            if role:
                overwrites[role] = discord.PermissionOverwrite(
                    view_channel=True,
                    send_messages=True,
                    read_message_history=True,
                    attach_files=True,
                    manage_messages=True,
                )

        ticket_channel = await guild.create_text_channel(
            name=channel_name,
            category=discord_category,
            overwrites=overwrites,
            reason=f"Ticket opened by {user} ({self.category_cfg['label']})",
        )

        answers = {
            inp.label: inp.value.strip() for inp in self.question_inputs
        }
        ticket_id = await self.bot.db.create_ticket(
            guild_id=guild.id,
            channel_id=ticket_channel.id,
            category_key=self.category_key,
            creator_id=user.id,
            creator_name=str(user),
            answers=answers,
        )

        embed = build_ticket_embed(
            ticket_id=ticket_id,
            category_label=self.category_cfg["label"],
            creator_mention=user.mention,
            claimed_by_mention="Unclaimed",
            status="OPEN",
            answers=answers,
        )

        staff_mentions = " ".join(f"<@&{rid}>" for rid in self.category_cfg.get("staff_role_ids", []))
        await ticket_channel.send(
            content=f"{user.mention} {staff_mentions}".strip(),
            embed=embed,
            view=TicketManagementView(self.bot),
        )

        await interaction.followup.send(
            f"Your **{self.category_cfg['label']}** ticket has been created: {ticket_channel.mention}",
            ephemeral=True,
        )


def build_ticket_embed(
    ticket_id: int,
    category_label: str,
    creator_mention: str,
    claimed_by_mention: str,
    status: str,
    answers: Dict[str, str],
) -> discord.Embed:
    color = discord.Color.green() if status == "OPEN" else discord.Color.orange()
    embed = discord.Embed(
        title=f"Ticket #{ticket_id} — {category_label}",
        description="Staff will assist you shortly. Use the controls below to manage this ticket.",
        color=color,
        timestamp=datetime.datetime.now(datetime.timezone.utc),
    )
    embed.add_field(name="Ticket Creator", value=creator_mention, inline=True)
    embed.add_field(name="Claimed By", value=claimed_by_mention, inline=True)
    embed.add_field(name="Status", value=f"`{status}`", inline=True)

    for question, answer in answers.items():
        embed.add_field(name=question[:256], value=answer[:1024] or "N/A", inline=False)

    embed.set_footer(text=f"Ticket ID: #{ticket_id}")
    return embed


class CloseReasonModal(discord.ui.Modal, title="Close Ticket"):
    reason_input = discord.ui.TextInput(
        label="Reason for closing this ticket",
        placeholder="Issue resolved / Answered user questions",
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=500,
    )

    def __init__(self, bot):
        super().__init__()
        self.bot = bot

    async def on_submit(self, interaction: discord.Interaction):
        cog = self.bot.get_cog("TicketsCog")
        if cog:
            await cog.execute_close_ticket(interaction, self.reason_input.value.strip())


class RenameTicketModal(discord.ui.Modal, title="Rename Ticket Channel"):
    new_name = discord.ui.TextInput(
        label="New Channel Name",
        placeholder="resolved-username",
        required=True,
        max_length=90,
    )

    def __init__(self, bot):
        super().__init__()
        self.bot = bot

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.channel.edit(name=self.new_name.value.strip())
        await interaction.response.send_message(
            f"Ticket channel renamed to `{self.new_name.value.strip()}`.", ephemeral=False
        )


class PersistentTicketPanelView(discord.ui.View):
    """Persistent 4-Category Ticket Creation Panel that survives bot restarts."""

    def __init__(self, bot):
        super().__init__(timeout=None)
        self.bot = bot

    async def _open_category_modal(self, interaction: discord.Interaction, category_key: str):
        ticket_settings = await self.bot.db.get_ticket_settings(interaction.guild.id)
        categories = ticket_settings.get("categories", {})
        cat_cfg = categories.get(category_key)
        if not cat_cfg:
            return await interaction.response.send_message("Category configuration not found.", ephemeral=True)
        await interaction.response.send_modal(
            TicketQuestionnaireModal(self.bot, category_key, cat_cfg)
        )

    @discord.ui.button(
        label="General Help",
        style=discord.ButtonStyle.primary,
        custom_id="aegis_ticket_panel:general",
    )
    async def btn_general(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._open_category_modal(interaction, "general")

    @discord.ui.button(
        label="File a Complaint",
        style=discord.ButtonStyle.danger,
        custom_id="aegis_ticket_panel:complaint",
    )
    async def btn_complaint(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._open_category_modal(interaction, "complaint")

    @discord.ui.button(
        label="Apply for a Staff Role",
        style=discord.ButtonStyle.secondary,
        custom_id="aegis_ticket_panel:staff",
    )
    async def btn_staff(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._open_category_modal(interaction, "staff")

    @discord.ui.button(
        label="Claim Winning Prize",
        style=discord.ButtonStyle.success,
        custom_id="aegis_ticket_panel:prize",
    )
    async def btn_prize(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._open_category_modal(interaction, "prize")


class TicketManagementView(discord.ui.View):
    """Persistent inside-ticket control bar for staff & ticket creators."""

    def __init__(self, bot):
        super().__init__(timeout=None)
        self.bot = bot

    @discord.ui.button(
        label="Claim Ticket",
        style=discord.ButtonStyle.success,
        custom_id="aegis_ticket_ctrl:claim",
        row=0,
    )
    async def claim_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        cog = self.bot.get_cog("TicketsCog")
        if cog:
            await cog.handle_claim(interaction)

    @discord.ui.button(
        label="Unclaim",
        style=discord.ButtonStyle.secondary,
        custom_id="aegis_ticket_ctrl:unclaim",
        row=0,
    )
    async def unclaim_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        cog = self.bot.get_cog("TicketsCog")
        if cog:
            await cog.handle_unclaim(interaction)

    @discord.ui.button(
        label="Close Ticket",
        style=discord.ButtonStyle.danger,
        custom_id="aegis_ticket_ctrl:close",
        row=0,
    )
    async def close_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(CloseReasonModal(self.bot))

    @discord.ui.button(
        label="Transcript",
        style=discord.ButtonStyle.secondary,
        custom_id="aegis_ticket_ctrl:transcript",
        row=1,
    )
    async def transcript_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        cog = self.bot.get_cog("TicketsCog")
        if cog:
            await cog.handle_transcript(interaction)

    @discord.ui.button(
        label="Rename",
        style=discord.ButtonStyle.secondary,
        custom_id="aegis_ticket_ctrl:rename",
        row=1,
    )
    async def rename_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "ticket_manage", default_mod=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)
        await interaction.response.send_modal(RenameTicketModal(self.bot))

    @discord.ui.button(
        label="Ticket Info",
        style=discord.ButtonStyle.primary,
        custom_id="aegis_ticket_ctrl:info",
        row=1,
    )
    async def info_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        cog = self.bot.get_cog("TicketsCog")
        if cog:
            await cog.handle_info(interaction)


class TicketsCog(commands.Cog):
    """Complete 4-Category Ticket Management System with Dual DM Transcripts."""

    def __init__(self, bot):
        self.bot = bot
        self.bot.add_view(PersistentTicketPanelView(bot))
        self.bot.add_view(TicketManagementView(bot))

    async def is_ticket_staff(self, member: discord.Member, category_key: str) -> bool:
        if member.guild_permissions.administrator or member.id == member.guild.owner_id:
            return True
        ticket_settings = await self.bot.db.get_ticket_settings(member.guild.id)
        cat_cfg = ticket_settings.get("categories", {}).get(category_key, {})
        staff_roles = set(cat_cfg.get("staff_role_ids", []))
        guild_settings = await self.bot.db.get_guild_settings(member.guild.id)
        staff_roles |= set(guild_settings.get("mod_role_ids", [])) | set(guild_settings.get("admin_role_ids", []))
        member_roles = {r.id for r in member.roles}
        return bool(member_roles & staff_roles)

    async def generate_channel_transcript(
        self, channel: discord.TextChannel, ticket_data: Dict[str, Any]
    ) -> str:
        lines = [
            "==================================================================",
            f"AEGISBOT TICKET TRANSCRIPT — TICKET #{ticket_data['ticket_id']}",
            f"Server: {channel.guild.name} ({channel.guild.id})",
            f"Category: {ticket_data['category_key'].upper()}",
            f"Creator: {ticket_data['creator_name']} ({ticket_data['creator_id']})",
            f"Claimed By: {ticket_data.get('claimed_by_name') or 'Unclaimed'}",
            "==================================================================",
            "",
            "--- INITIAL QUESTIONNAIRE ANSWERS ---",
        ]
        for q, a in ticket_data.get("answers", {}).items():
            lines.append(f"Q: {q}\nA: {a}\n")
        lines.append("--- MESSAGE HISTORY ---")

        async for msg in channel.history(limit=500, oldest_first=True):
            timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            content = msg.clean_content or ""
            attachments = ", ".join(a.url for a in msg.attachments)
            if attachments:
                content = f"{content} [Attachments: {attachments}]".strip()
            lines.append(f"[{timestamp}] {msg.author} ({msg.author.id}): {content}")

        return "\n".join(lines)

    async def handle_claim(self, interaction: discord.Interaction):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("This channel is not an active ticket.", ephemeral=True)

        if not await self.is_ticket_staff(interaction.user, ticket["category_key"]):
            return await interaction.response.send_message(
                "Only authorized ticket staff can claim tickets.", ephemeral=True
            )

        if ticket.get("claimed_by_id"):
            if ticket["claimed_by_id"] == interaction.user.id:
                return await interaction.response.send_message("You have already claimed this ticket.", ephemeral=True)
            return await interaction.response.send_message(
                f"This ticket is already claimed by <@{ticket['claimed_by_id']}>. An administrator can transfer or unclaim it.",
                ephemeral=True,
            )

        await self.bot.db.update_ticket(
            ticket["ticket_id"],
            claimed_by_id=interaction.user.id,
            claimed_by_name=str(interaction.user),
        )
        await self.bot.db.log_ticket_claim(
            ticket["ticket_id"],
            interaction.guild.id,
            interaction.user.id,
            str(interaction.user),
            "CLAIMED",
        )

        ticket_settings = await self.bot.db.get_ticket_settings(interaction.guild.id)
        cat_label = ticket_settings["categories"].get(ticket["category_key"], {}).get("label", ticket["category_key"])

        updated_embed = build_ticket_embed(
            ticket_id=ticket["ticket_id"],
            category_label=cat_label,
            creator_mention=f"<@{ticket['creator_id']}>",
            claimed_by_mention=interaction.user.mention,
            status=ticket["status"].upper(),
            answers=ticket["answers"],
        )
        await interaction.response.edit_message(embed=updated_embed, view=TicketManagementView(self.bot))
        await interaction.channel.send(
            f"Ticket claimed by {interaction.user.mention}."
        )

    async def handle_unclaim(self, interaction: discord.Interaction):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket or not ticket.get("claimed_by_id"):
            return await interaction.response.send_message("This ticket is not currently claimed.", ephemeral=True)

        is_admin = interaction.user.guild_permissions.administrator
        if ticket["claimed_by_id"] != interaction.user.id and not is_admin:
            return await interaction.response.send_message(
                "Only the claiming moderator or a server administrator can unclaim this ticket.",
                ephemeral=True,
            )

        await self.bot.db.update_ticket(
            ticket["ticket_id"], claimed_by_id=None, claimed_by_name=None
        )
        await self.bot.db.log_ticket_claim(
            ticket["ticket_id"],
            interaction.guild.id,
            interaction.user.id,
            str(interaction.user),
            "UNCLAIMED",
        )

        ticket_settings = await self.bot.db.get_ticket_settings(interaction.guild.id)
        cat_label = ticket_settings["categories"].get(ticket["category_key"], {}).get("label", ticket["category_key"])
        updated_embed = build_ticket_embed(
            ticket_id=ticket["ticket_id"],
            category_label=cat_label,
            creator_mention=f"<@{ticket['creator_id']}>",
            claimed_by_mention="Unclaimed",
            status=ticket["status"].upper(),
            answers=ticket["answers"],
        )
        await interaction.response.edit_message(embed=updated_embed, view=TicketManagementView(self.bot))
        await interaction.channel.send(f"Ticket unclaimed by {interaction.user.mention}.")

    async def execute_close_ticket(self, interaction: discord.Interaction, reason: str):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("Not a registered ticket channel.", ephemeral=True)
        if ticket["status"] == "closed":
            return await interaction.response.send_message("This ticket is already closed.", ephemeral=True)

        ticket_settings = await self.bot.db.get_ticket_settings(interaction.guild.id)
        is_staff = await self.is_ticket_staff(interaction.user, ticket["category_key"])
        if ticket_settings.get("close_permission") == "staff_only" and not is_staff:
            return await interaction.response.send_message(
                "Only authorized staff members are permitted to close tickets.", ephemeral=True
            )
        if not is_staff and interaction.user.id != ticket["creator_id"]:
            return await interaction.response.send_message("You lack permission to close this ticket.", ephemeral=True)

        await interaction.response.defer()

        transcript_str = await self.generate_channel_transcript(interaction.channel, ticket)
        now_ts = int(time.time())

        await self.bot.db.update_ticket(
            ticket["ticket_id"],
            status="closed",
            closed_by_id=interaction.user.id,
            closed_by_name=str(interaction.user),
            close_reason=reason,
            transcript_text=transcript_str,
            closed_at=now_ts,
        )

        cat_label = ticket_settings["categories"].get(ticket["category_key"], {}).get("label", ticket["category_key"])
        dm_warnings: List[str] = []

        # 1. Send DM to Ticket Creator
        creator_member = interaction.guild.get_member(ticket["creator_id"])
        if creator_member:
            creator_embed = discord.Embed(
                title=f"Ticket #{ticket['ticket_id']} Closed — {interaction.guild.name}",
                color=discord.Color.orange(),
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            creator_embed.add_field(name="Ticket ID", value=f"`#{ticket['ticket_id']}`", inline=True)
            creator_embed.add_field(name="Category", value=cat_label, inline=True)
            creator_embed.add_field(name="Closed By", value=str(interaction.user), inline=True)
            creator_embed.add_field(name="Closing Reason", value=reason, inline=False)
            try:
                transcript_file = discord.File(
                    io.BytesIO(transcript_str.encode("utf-8")),
                    filename=f"ticket-{ticket['ticket_id']}-transcript.txt",
                )
                await creator_member.send(embed=creator_embed, file=transcript_file)
            except (discord.Forbidden, discord.HTTPException):
                dm_warnings.append(f"Could not DM ticket creator <@{ticket['creator_id']}> (DMs disabled).")
        else:
            dm_warnings.append(f"Ticket creator <@{ticket['creator_id']}> is no longer in the server.")

        # 2. Send separate DM to Claimed Moderator (or Closing Moderator if unclaimed)
        target_staff_id = ticket.get("claimed_by_id") or interaction.user.id
        staff_member = interaction.guild.get_member(target_staff_id)
        if staff_member:
            staff_embed = discord.Embed(
                title=f"Staff Receipt: Ticket #{ticket['ticket_id']} Closed",
                color=discord.Color.blurple(),
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            staff_embed.add_field(name="Ticket ID", value=f"`#{ticket['ticket_id']}`", inline=True)
            staff_embed.add_field(name="Ticket Creator", value=f"{ticket['creator_name']} (<@{ticket['creator_id']}>)", inline=True)
            staff_embed.add_field(name="Category", value=cat_label, inline=True)
            staff_embed.add_field(name="Closing Reason", value=reason, inline=False)
            try:
                transcript_file_staff = discord.File(
                    io.BytesIO(transcript_str.encode("utf-8")),
                    filename=f"ticket-{ticket['ticket_id']}-transcript.txt",
                )
                await staff_member.send(embed=staff_embed, file=transcript_file_staff)
            except (discord.Forbidden, discord.HTTPException):
                dm_warnings.append(f"Could not DM staff member <@{target_staff_id}> (DMs disabled).")

        # 3. Save transcript in configured transcript storage channel
        transcript_chan_id = ticket_settings.get("transcript_channel_id")
        if transcript_chan_id:
            transcript_chan = interaction.guild.get_channel(transcript_chan_id)
            if isinstance(transcript_chan, discord.TextChannel):
                log_embed = discord.Embed(
                    title=f"Transcript — Ticket #{ticket['ticket_id']}",
                    color=discord.Color.teal(),
                    timestamp=datetime.datetime.now(datetime.timezone.utc),
                )
                log_embed.add_field(name="Creator", value=f"<@{ticket['creator_id']}>", inline=True)
                log_embed.add_field(name="Category", value=cat_label, inline=True)
                log_embed.add_field(
                    name="Claimed By",
                    value=f"<@{ticket['claimed_by_id']}>" if ticket.get("claimed_by_id") else "Unclaimed",
                    inline=True,
                )
                log_embed.add_field(name="Closed By", value=interaction.user.mention, inline=True)
                log_embed.add_field(name="Reason", value=reason, inline=False)
                await transcript_chan.send(
                    embed=log_embed,
                    file=discord.File(
                        io.BytesIO(transcript_str.encode("utf-8")),
                        filename=f"ticket-{ticket['ticket_id']}-transcript.txt",
                    ),
                )

        # Lock creator send permission while closed
        if creator_member:
            await interaction.channel.set_permissions(
                creator_member, view_channel=True, send_messages=False
            )

        auto_del = ticket_settings.get("auto_delete_seconds", 300)
        close_summary = discord.Embed(
            title=f"Ticket #{ticket['ticket_id']} Closed",
            description=(
                f"**Closed by:** {interaction.user.mention}\n"
                f"**Reason:** {reason}\n"
                f"**Auto-Delete:** Channel scheduled for deletion in `{auto_del}` seconds (unless reopened)."
            ),
            color=discord.Color.red(),
        )
        if dm_warnings:
            close_summary.add_field(
                name="DM Delivery Notice",
                value="\n".join(dm_warnings),
                inline=False,
            )

        await interaction.followup.send(embed=close_summary)

        if auto_del > 0:
            await asyncio.sleep(auto_del)
            refreshed = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
            if refreshed and refreshed.get("status") == "closed":
                try:
                    await interaction.channel.delete(reason=f"Ticket #{ticket['ticket_id']} auto-delete timer expired")
                except discord.HTTPException:
                    pass

    async def handle_transcript(self, interaction: discord.Interaction):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("Not a ticket channel.", ephemeral=True)
        transcript_str = await self.generate_channel_transcript(interaction.channel, ticket)
        await interaction.response.send_message(
            content=f"Generated live transcript for Ticket `#{ticket['ticket_id']}`:",
            file=discord.File(
                io.BytesIO(transcript_str.encode("utf-8")),
                filename=f"ticket-{ticket['ticket_id']}-transcript.txt",
            ),
            ephemeral=True,
        )

    async def handle_info(self, interaction: discord.Interaction):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("Not a ticket channel.", ephemeral=True)
        claims = await self.bot.db.get_ticket_claim_history(ticket["ticket_id"])
        claim_lines = [
            f"• `<t:{c['timestamp']}:R>` — **{c['action']}** by <@{c['staff_id']}>"
            for c in claims
        ] or ["No claim events recorded yet."]

        embed = discord.Embed(
            title=f"Ticket #{ticket['ticket_id']} Information & Audit Trail",
            color=discord.Color.blurple(),
        )
        embed.add_field(name="Creator", value=f"<@{ticket['creator_id']}>", inline=True)
        embed.add_field(name="Category Key", value=f"`{ticket['category_key']}`", inline=True)
        embed.add_field(name="Status", value=f"`{ticket['status'].upper()}`", inline=True)
        embed.add_field(name="Claim History", value="\n".join(claim_lines[:10]), inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    ticket_group = app_commands.Group(name="ticket", description="Manage the 4-category ticket system and panels.")

    @ticket_group.command(name="setup", description="Configure the interactive 4-category ticket panel and settings.")
    @app_commands.describe(
        panel_channel="Channel where the 4-category ticket creation panel will be published",
        transcript_channel="Channel where closed ticket transcripts will be stored",
        max_open_per_user="Maximum simultaneous open tickets allowed per user",
        auto_delete_seconds="Seconds to wait after closing before deleting the channel (0 to disable)",
    )
    async def ticket_setup(
        self,
        interaction: discord.Interaction,
        panel_channel: discord.TextChannel,
        transcript_channel: Optional[discord.TextChannel] = None,
        max_open_per_user: int = 2,
        auto_delete_seconds: int = 300,
    ):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "ticket_setup", default_admin=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        await self.bot.db.update_ticket_settings(
            interaction.guild.id,
            panel_channel_id=panel_channel.id,
            transcript_channel_id=transcript_channel.id if transcript_channel else None,
            max_open_per_user=max(1, min(10, max_open_per_user)),
            auto_delete_seconds=max(0, auto_delete_seconds),
        )
        cfg = await self.bot.db.get_ticket_settings(interaction.guild.id)

        panel_embed = discord.Embed(
            title=cfg["panel_title"],
            description=(
                f"{cfg['panel_description']}\n\n"
                "• **General Help** — Support questions and troubleshooting\n"
                "• **File a Complaint** — Report rule violations with evidence\n"
                "• **Apply for a Staff Role** — Submit a staff application\n"
                "• **Claim Winning Prize** — Verify event or giveaway rewards"
            ),
            color=discord.Color.blurple(),
        )
        msg = await panel_channel.send(embed=panel_embed, view=PersistentTicketPanelView(self.bot))
        await self.bot.db.update_ticket_settings(interaction.guild.id, panel_message_id=msg.id)

        await interaction.response.send_message(
            f"Ticket panel deployed in {panel_channel.mention}! All 4 categories are active and persistent.",
            ephemeral=True,
        )

    @ticket_group.command(name="add", description="Add a user to the current ticket channel.")
    async def ticket_add_member(self, interaction: discord.Interaction, member: discord.Member):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("This command only works inside a ticket channel.", ephemeral=True)
        if not await self.is_ticket_staff(interaction.user, ticket["category_key"]):
            return await interaction.response.send_message("Only ticket staff can add members.", ephemeral=True)
        await interaction.channel.set_permissions(member, view_channel=True, send_messages=True, read_message_history=True)
        await interaction.response.send_message(f"Added {member.mention} to Ticket `#{ticket['ticket_id']}`.")

    @ticket_group.command(name="remove", description="Remove a user from the current ticket channel.")
    async def ticket_remove_member(self, interaction: discord.Interaction, member: discord.Member):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("This command only works inside a ticket channel.", ephemeral=True)
        if not await self.is_ticket_staff(interaction.user, ticket["category_key"]):
            return await interaction.response.send_message("Only ticket staff can remove members.", ephemeral=True)
        await interaction.channel.set_permissions(member, overwrite=None)
        await interaction.response.send_message(f"Removed {member.mention} from Ticket `#{ticket['ticket_id']}`.")

    @ticket_group.command(name="transfer", description="Transfer ticket claim ownership to another staff member.")
    async def ticket_transfer(self, interaction: discord.Interaction, new_staff: discord.Member):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("This command only works inside a ticket channel.", ephemeral=True)
        if not await self.is_ticket_staff(interaction.user, ticket["category_key"]):
            return await interaction.response.send_message("Only ticket staff can transfer tickets.", ephemeral=True)
        await self.bot.db.update_ticket(
            ticket["ticket_id"],
            claimed_by_id=new_staff.id,
            claimed_by_name=str(new_staff),
        )
        await self.bot.db.log_ticket_claim(
            ticket["ticket_id"],
            interaction.guild.id,
            new_staff.id,
            str(new_staff),
            f"TRANSFERRED_FROM_{interaction.user.id}",
        )
        await interaction.response.send_message(
            f"Ticket `#{ticket['ticket_id']}` transferred to {new_staff.mention} by {interaction.user.mention}."
        )

    @ticket_group.command(name="reopen", description="Reopen a closed ticket channel before deletion.")
    async def ticket_reopen(self, interaction: discord.Interaction):
        ticket = await self.bot.db.get_ticket_by_channel(interaction.channel.id)
        if not ticket:
            return await interaction.response.send_message("Not a ticket channel.", ephemeral=True)
        if not await self.is_ticket_staff(interaction.user, ticket["category_key"]):
            return await interaction.response.send_message("Only ticket staff can reopen tickets.", ephemeral=True)
        await self.bot.db.update_ticket(ticket["ticket_id"], status="open")
        creator = interaction.guild.get_member(ticket["creator_id"])
        if creator:
            await interaction.channel.set_permissions(creator, view_channel=True, send_messages=True)
        await interaction.response.send_message(f"Ticket `#{ticket['ticket_id']}` has been reopened by {interaction.user.mention}.")


async def setup(bot):
    await bot.add_cog(TicketsCog(bot))
