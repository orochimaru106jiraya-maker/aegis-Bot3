import os
import sys
import asyncio
import logging
import discord
from discord.ext import commands
from dotenv import load_dotenv

from database.db import DatabaseManager

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("aegisbot")

INITIAL_COGS = [
    "cogs.setup_wizard",
    "cogs.tickets",
    "cogs.jtc",
    "cogs.moderation",
    "cogs.admin",
    "cogs.activity_roles",
    "cogs.reaction_roles",
    "cogs.embeds",
    "cogs.auto_responder",
    "cogs.ai_assistant",
]


async def get_dynamic_prefix(bot: "AegisBot", message: discord.Message):
    if not message.guild:
        return commands.when_mentioned_or(bot.default_prefix)(bot, message)
    prefix = await bot.db.get_guild_prefix(message.guild.id, default=bot.default_prefix)
    return commands.when_mentioned_or(prefix)(bot, message)


class AegisBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.members = True          # Required for moderation, autoroles, userinfo
        intents.message_content = True  # Required for hybrid commands, snipe, auto-responder, text milestones
        intents.presences = True        # Required for Spotify & Gaming activity-based auto roles
        intents.voice_states = True     # Required for Voice Chat auto roles & Music cog

        self.default_prefix = os.getenv("DEFAULT_PREFIX", "!")
        db_path = os.getenv("DATABASE_PATH", "database/aegisbot.db")
        self.db = DatabaseManager(db_path)

        super().__init__(
            command_prefix=get_dynamic_prefix,
            intents=intents,
            help_command=None,
            case_insensitive=True,
            max_messages=1000,  # Keep RAM low for Railway free/trial hosting
        )

    async def setup_hook(self) -> None:
        logger.info("Initializing SQLite database and running schema migrations...")
        await self.db.initialize()

        cogs_to_load = list(INITIAL_COGS)
        if os.getenv("ENABLE_MUSIC_COG", "true").lower() == "true":
            cogs_to_load.append("cogs.music")

        for cog in cogs_to_load:
            try:
                await self.load_extension(cog)
                logger.info(f"Loaded extension: {cog}")
            except Exception as exc:
                logger.error(f"Failed to load extension {cog}: {exc}", exc_info=True)

        logger.info("Syncing global slash commands...")
        try:
            synced = await self.tree.sync()
            logger.info(f"Synchronized {len(synced)} global slash command(s).")
        except discord.HTTPException as exc:
            logger.warning(f"Slash command sync rate-limited or failed: {exc}")

    async def on_ready(self) -> None:
        logger.info(f"Logged in as {self.user} (ID: {self.user.id})")
        logger.info(f"Connected across {len(self.guilds)} guild(s). Ready.")
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name="/setup | /ticket setup",
            )
        )

    async def on_command_error(
        self, ctx: commands.Context, error: commands.CommandError
    ) -> None:
        if isinstance(error, commands.CommandNotFound):
            return
        if isinstance(error, commands.MissingPermissions):
            await ctx.reply(
                embed=discord.Embed(
                    title="Permission Denied",
                    description="You do not have the required server permissions to run this command.",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return
        if isinstance(error, commands.CheckFailure):
            await ctx.reply(
                embed=discord.Embed(
                    title="Access Restricted",
                    description=str(error) or "Your role does not have permission to execute this command.",
                    color=discord.Color.red(),
                ),
                ephemeral=True,
            )
            return
        logger.error(f"Error in command {ctx.command}: {error}", exc_info=True)


async def main():
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        logger.critical("DISCORD_TOKEN environment variable is missing. Set it in .env or Railway Variables.")
        sys.exit(1)

    bot = AegisBot()
    async with bot:
        await bot.start(token)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down AegisBot gracefully.")
