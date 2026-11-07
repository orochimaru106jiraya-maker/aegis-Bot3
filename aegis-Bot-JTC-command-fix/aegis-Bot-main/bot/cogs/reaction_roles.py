import json
import discord
from discord import app_commands
from discord.ext import commands
from typing import List, Dict, Any
from utils.permissions import validate_member_access


class DynamicReactionRoleButton(discord.ui.Button):
    def __init__(self, bot, panel_id: int, role_id: int, label: str, exclusive: bool):
        super().__init__(
            label=label[:80],
            style=discord.ButtonStyle.secondary,
            custom_id=f"aegis_rr:{panel_id}:{role_id}:{int(exclusive)}",
        )
        self.bot = bot
        self.panel_id = panel_id
        self.role_id = role_id
        self.exclusive = exclusive

    async def callback(self, interaction: discord.Interaction):
        role = interaction.guild.get_role(self.role_id)
        if not role:
            return await interaction.response.send_message("That role no longer exists.", ephemeral=True)

        if role in interaction.user.roles:
            await interaction.user.remove_roles(role, reason="Reaction Role toggle off")
            return await interaction.response.send_message(f"Removed role {role.mention}.", ephemeral=True)

        await interaction.user.add_roles(role, reason="Reaction Role self-assigned")
        await interaction.response.send_message(f"Assigned role {role.mention}.", ephemeral=True)


class ReactionRolePanelView(discord.ui.View):
    def __init__(self, bot, panel_id: int, roles_data: List[Dict[str, Any]], exclusive: bool):
        super().__init__(timeout=None)
        for item in roles_data[:25]:
            self.add_item(
                DynamicReactionRoleButton(
                    bot=bot,
                    panel_id=panel_id,
                    role_id=item["role_id"],
                    label=item["label"],
                    exclusive=exclusive,
                )
            )


class ReactionRolesCog(commands.Cog):
    """Self-assignable Reaction Role panels with exclusive group and role limit support."""

    def __init__(self, bot):
        self.bot = bot

    rr_group = app_commands.Group(name="reactionroles", description="Create and manage interactive reaction role panels.")

    @rr_group.command(name="create", description="Create a new button-based reaction role panel in a channel.")
    async def rr_create(
        self,
        interaction: discord.Interaction,
        channel: discord.TextChannel,
        title: str,
        description: str,
        role_1: discord.Role,
        role_2: discord.Role = None,
        role_3: discord.Role = None,
        exclusive: bool = False,
    ):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "reactionroles", default_admin=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        roles = [r for r in (role_1, role_2, role_3) if r is not None]
        roles_data = [{"role_id": r.id, "label": r.name} for r in roles]

        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                """
                INSERT INTO reaction_panels (guild_id, channel_id, title, description, mode, exclusive, roles_json)
                VALUES (?, ?, ?, ?, 'buttons', ?, ?)
                """,
                (
                    interaction.guild.id,
                    channel.id,
                    title,
                    description,
                    int(exclusive),
                    json.dumps(roles_data),
                ),
            )
            await conn.commit()
            panel_id = cursor.lastrowid
        finally:
            await conn.close()

        embed = discord.Embed(title=title, description=description, color=discord.Color.blurple())
        embed.set_footer(text=f"Reaction Role Panel #{panel_id} • {'Exclusive Group' if exclusive else 'Multi-Select'}")
        view = ReactionRolePanelView(self.bot, panel_id, roles_data, exclusive)
        await channel.send(embed=embed, view=view)
        await interaction.response.send_message(f"Published Reaction Role Panel `#{panel_id}` in {channel.mention}.", ephemeral=True)


async def setup(bot):
    await bot.add_cog(ReactionRolesCog(bot))
