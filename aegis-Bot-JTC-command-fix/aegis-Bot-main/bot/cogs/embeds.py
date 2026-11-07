import json
import time
import datetime
import discord
from discord.ext import commands
from utils.permissions import validate_member_access


class EmbedCoreModal(discord.ui.Modal, title="Configure Embed Title & Description"):
    title_input = discord.ui.TextInput(label="Embed Title", max_length=256, required=True)
    desc_input = discord.ui.TextInput(
        label="Description", style=discord.TextStyle.paragraph, max_length=2000, required=True
    )
    color_input = discord.ui.TextInput(label="Hex Color (e.g. #5865F2)", placeholder="#5865F2", required=False)
    footer_input = discord.ui.TextInput(label="Footer Text", required=False, max_length=256)

    def __init__(self, builder_view: "EmbedBuilderView"):
        super().__init__()
        self.builder_view = builder_view

    async def on_submit(self, interaction: discord.Interaction):
        self.builder_view.state["title"] = self.title_input.value.strip()
        self.builder_view.state["description"] = self.desc_input.value.strip()
        if self.color_input.value.strip():
            self.builder_view.state["color"] = self.color_input.value.strip()
        self.builder_view.state["footer"] = self.footer_input.value.strip()
        await interaction.response.edit_message(embed=self.builder_view.to_embed(), view=self.builder_view)


class EmbedFieldModal(discord.ui.Modal, title="Add Embed Field"):
    field_name = discord.ui.TextInput(label="Field Name", max_length=256, required=True)
    field_val = discord.ui.TextInput(
        label="Field Value", style=discord.TextStyle.paragraph, max_length=1024, required=True
    )

    def __init__(self, builder_view: "EmbedBuilderView"):
        super().__init__()
        self.builder_view = builder_view

    async def on_submit(self, interaction: discord.Interaction):
        self.builder_view.state["fields"].append(
            {"name": self.field_name.value.strip(), "value": self.field_val.value.strip(), "inline": False}
        )
        await interaction.response.edit_message(embed=self.builder_view.to_embed(), view=self.builder_view)


class EmbedBuilderView(discord.ui.View):
    def __init__(self, bot, guild_id: int):
        super().__init__(timeout=600)
        self.bot = bot
        self.guild_id = guild_id
        self.state = {
            "title": "New Custom Announcement",
            "description": "Use the buttons below to edit title, description, fields, and publish or save as a template.",
            "color": "#5865F2",
            "footer": "",
            "fields": [],
        }

    def to_embed(self) -> discord.Embed:
        raw_hex = self.state.get("color", "#5865F2").lstrip("#")
        try:
            color = discord.Color(int(raw_hex, 16))
        except ValueError:
            color = discord.Color.blurple()
        embed = discord.Embed(
            title=self.state["title"],
            description=self.state["description"],
            color=color,
            timestamp=datetime.datetime.now(datetime.timezone.utc),
        )
        for f in self.state["fields"]:
            embed.add_field(name=f["name"], value=f["value"], inline=f.get("inline", False))
        if self.state.get("footer"):
            embed.set_footer(text=self.state["footer"])
        return embed

    @discord.ui.button(label="Edit Title / Body / Color", style=discord.ButtonStyle.primary)
    async def edit_core(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(EmbedCoreModal(self))

    @discord.ui.button(label="Add Field", style=discord.ButtonStyle.secondary)
    async def add_field(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(EmbedFieldModal(self))

    @discord.ui.button(label="Save Template to SQLite", style=discord.ButtonStyle.secondary)
    async def save_template(self, interaction: discord.Interaction, button: discord.ui.Button):
        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO embed_templates (guild_id, name, embed_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guild_id, name) DO UPDATE SET
                    embed_json = excluded.embed_json,
                    updated_at = excluded.updated_at
                """,
                (self.guild_id, self.state["title"][:40], json.dumps(self.state), int(time.time())),
            )
            await conn.commit()
        finally:
            await conn.close()
        await interaction.response.send_message("Saved embed template to SQLite database.", ephemeral=True)

    @discord.ui.button(label="Publish to Channel", style=discord.ButtonStyle.success)
    async def publish_here(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.channel.send(embed=self.to_embed())
        await interaction.response.send_message("Published embed to this channel.", ephemeral=True)


class EmbedsCog(commands.Cog):
    """Interactive Custom Embed Builder with reusable SQLite templates."""

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="embed", description="Launch the interactive custom embed builder and template manager.")
    async def embed_cmd(self, ctx: commands.Context):
        allowed, reason = await validate_member_access(self.bot, ctx.author, "embed", default_mod=True)
        if not allowed:
            return await ctx.reply(reason, ephemeral=True)
        view = EmbedBuilderView(self.bot, ctx.guild.id)
        await ctx.reply(embed=view.to_embed(), view=view, ephemeral=True)


async def setup(bot):
    await bot.add_cog(EmbedsCog(bot))
