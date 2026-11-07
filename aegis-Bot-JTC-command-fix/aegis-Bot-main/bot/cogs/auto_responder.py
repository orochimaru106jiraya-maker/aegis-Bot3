import json
import time
import random
import discord
from discord import app_commands
from discord.ext import commands
from typing import Dict
from utils.permissions import validate_member_access


class AutoResponderCog(commands.Cog):
    """Customizable rule-based Auto-Responder with exact/contains matching and cooldowns."""

    def __init__(self, bot):
        self.bot = bot
        self._cooldowns: Dict[tuple[int, int, int], float] = {}

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if not message.guild or message.author.bot or not message.content:
            return

        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM auto_responses WHERE guild_id = ? AND enabled = 1",
                (message.guild.id,),
            )
            triggers = [dict(r) for r in await cursor.fetchall()]
        finally:
            await conn.close()

        now = time.time()
        for trig in triggers:
            raw_content = message.content if trig["case_sensitive"] else message.content.lower()
            target = trig["trigger_text"] if trig["case_sensitive"] else trig["trigger_text"].lower()

            matched = (
                raw_content == target
                if trig["match_type"] == "exact"
                else target in raw_content
            )
            if not matched:
                continue

            cd_key = (message.guild.id, trig["trigger_id"], message.author.id)
            if now - self._cooldowns.get(cd_key, 0) < trig.get("cooldown_seconds", 5):
                continue
            self._cooldowns[cd_key] = now

            responses = json.loads(trig.get("responses_json") or "[]")
            if not responses:
                continue
            chosen = random.choice(responses)
            if trig.get("use_embed"):
                await message.channel.send(
                    content=message.author.mention if trig.get("mention_user") else None,
                    embed=discord.Embed(description=chosen, color=discord.Color.blurple()),
                )
            else:
                prefix = f"{message.author.mention} " if trig.get("mention_user") else ""
                await message.channel.send(f"{prefix}{chosen}")
            break

    ar_group = app_commands.Group(name="autoresponder", description="Manage automatic keyword and phrase responses.")

    @ar_group.command(name="add", description="Create a new automatic response trigger.")
    async def ar_add(
        self,
        interaction: discord.Interaction,
        trigger: str,
        response: str,
        match_type: str = "contains",
        use_embed: bool = False,
    ):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "autoresponder", default_admin=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO auto_responses (guild_id, trigger_text, match_type, responses_json, use_embed)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    interaction.guild.id,
                    trigger.strip(),
                    "exact" if match_type == "exact" else "contains",
                    json.dumps([response.strip()]),
                    int(use_embed),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()
        await interaction.response.send_message(f"Added auto-responder trigger `{trigger}`.", ephemeral=True)


async def setup(bot):
    await bot.add_cog(AutoResponderCog(bot))
