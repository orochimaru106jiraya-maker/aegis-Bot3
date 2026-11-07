import time
import collections
import discord
from discord import app_commands
from discord.ext import commands
from typing import Deque, Dict, List
from utils.permissions import validate_member_access

DEFAULT_KNOWLEDGE_BASE = [
    {
        "topic": "Opening a Support Ticket",
        "keywords": "ticket, help, support, complaint, prize, staff application, report",
        "response": "You can open a private support ticket in our Ticket Panel channel! Choose from General Help, File a Complaint, Apply for a Staff Role, or Claim Winning Prize.",
    },
    {
        "topic": "Server Rules & Appeals",
        "keywords": "rules, ban, warn, timeout, mute, appeal, moderator",
        "response": "Please follow Discord's Terms of Service and treat all members respectfully. To appeal a warning or timeout, open a 'File a Complaint' or 'General Help' ticket.",
    },
    {
        "topic": "Activity Roles (Spotify, Gaming, Voice, Text)",
        "keywords": "roles, spotify, gaming, voice, level, rank, activity",
        "response": "Our server automatically awards roles when you listen to Spotify, play games, join voice channels, or reach text chat message milestones!",
    },
]


class LocalAIAssistantCog(commands.Cog):
    """
    Zero-API-Cost Local Rule-Based Personal AI Assistant:
    - Uses TF-style keyword overlap scoring + recent conversation context memory
    - Backed by SQLite customizable knowledge base
    - Zero external paid API dependency; lightweight (<5 MB RAM) for Railway hosting
    """

    def __init__(self, bot):
        self.bot = bot
        self._memory: Dict[tuple[int, int], Deque[str]] = collections.defaultdict(
            lambda: collections.deque(maxlen=5)
        )

    async def get_guild_knowledge(self, guild_id: int) -> List[Dict[str, str]]:
        conn = await self.bot.db._connect()
        try:
            cursor = await conn.execute(
                "SELECT * FROM ai_knowledge WHERE guild_id = ?", (guild_id,)
            )
            rows = [dict(r) for r in await cursor.fetchall()]
            return rows if rows else DEFAULT_KNOWLEDGE_BASE
        finally:
            await conn.close()

    async def answer_query(self, guild_id: int, user_id: int, query: str) -> tuple[str, str]:
        settings = await self.bot.db.get_guild_settings(guild_id)
        personality = settings.get("ai_personality", "Helpful, concise server assistant.")
        kb = await self.get_guild_knowledge(guild_id)

        mem_key = (guild_id, user_id)
        self._memory[mem_key].append(query)
        combined_context = " ".join(self._memory[mem_key]).lower()
        query_lower = query.lower()

        best_entry = None
        best_score = 0

        for entry in kb:
            kw_list = [k.strip().lower() for k in entry["keywords"].split(",") if k.strip()]
            score = 0
            for kw in kw_list:
                if kw in query_lower:
                    score += 3
                elif kw in combined_context:
                    score += 1
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_entry and best_score > 0:
            return (
                best_entry["topic"],
                f"**[{personality}]**\n{best_entry['response']}",
            )

        topics = ", ".join(f"`{e['topic']}`" for e in kb[:6])
        return (
            "General Guidance",
            f"**[{personality}]**\nI searched the local server knowledge base for your question. "
            f"Available knowledge topics include: {topics}. If you need personalized staff help, please open a ticket!",
        )

    @commands.hybrid_command(name="ai", description="Ask the local rule-based server assistant a question (no external API required).")
    async def ai_cmd(self, ctx: commands.Context, *, question: str):
        topic, reply = await self.answer_query(ctx.guild.id, ctx.author.id, question)
        embed = discord.Embed(
            title=f"Local Assistant — {topic}",
            description=reply,
            color=discord.Color.blurple(),
        )
        embed.set_footer(text="Powered by Local Rule-Based Knowledge Engine (Zero API Cost)")
        await ctx.reply(embed=embed)

    ai_kb_group = app_commands.Group(name="aikb", description="Manage the local AI Assistant knowledge base.")

    @ai_kb_group.command(name="add", description="Add a new FAQ or knowledge entry to the local AI engine.")
    async def kb_add(
        self,
        interaction: discord.Interaction,
        topic: str,
        keywords_comma_separated: str,
        response: str,
    ):
        allowed, reason = await validate_member_access(self.bot, interaction.user, "aikb", default_admin=True)
        if not allowed:
            return await interaction.response.send_message(reason, ephemeral=True)

        conn = await self.bot.db._connect()
        try:
            await conn.execute(
                """
                INSERT INTO ai_knowledge (guild_id, topic, keywords, response, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    interaction.guild.id,
                    topic.strip(),
                    keywords_comma_separated.strip(),
                    response.strip(),
                    int(time.time()),
                ),
            )
            await conn.commit()
        finally:
            await conn.close()
        await interaction.response.send_message(f"Added knowledge topic `{topic}` to the local AI assistant.", ephemeral=True)


async def setup(bot):
    await bot.add_cog(LocalAIAssistantCog(bot))
