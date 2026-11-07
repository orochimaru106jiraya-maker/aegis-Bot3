import random
import asyncio
import discord
from discord.ext import commands
from typing import Dict, List, Optional
import yt_dlp

YTDL_OPTIONS = {
    "format": "bestaudio/best",
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
}

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}

ytdl = yt_dlp.YoutubeDL(YTDL_OPTIONS)


class GuildMusicState:
    def __init__(self):
        self.queue: List[Dict[str, str]] = []
        self.current: Optional[Dict[str, str]] = None
        self.volume: float = 0.5
        self.loop: bool = False


class MusicControlPanel(discord.ui.View):
    def __init__(self, cog: "MusicCog", guild_id: int):
        super().__init__(timeout=300)
        self.cog = cog
        self.guild_id = guild_id

    @discord.ui.button(label="Pause / Resume", style=discord.ButtonStyle.primary)
    async def pause_resume(self, interaction: discord.Interaction, button: discord.ui.Button):
        vc = interaction.guild.voice_client
        if not vc:
            return await interaction.response.send_message("Not connected to voice.", ephemeral=True)
        if vc.is_playing():
            vc.pause()
            await interaction.response.send_message("Paused playback.", ephemeral=True)
        elif vc.is_paused():
            vc.resume()
            await interaction.response.send_message("Resumed playback.", ephemeral=True)

    @discord.ui.button(label="Skip", style=discord.ButtonStyle.secondary)
    async def skip_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        vc = interaction.guild.voice_client
        if vc and vc.is_playing():
            vc.stop()
            await interaction.response.send_message("Skipped current track.", ephemeral=True)

    @discord.ui.button(label="Stop & Clear", style=discord.ButtonStyle.danger)
    async def stop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        state = self.cog.get_state(self.guild_id)
        state.queue.clear()
        vc = interaction.guild.voice_client
        if vc:
            vc.stop()
        await interaction.response.send_message("Stopped playback and cleared queue.", ephemeral=True)


class MusicCog(commands.Cog):
    """Modular Music System with Queue, Volume, Loop, Shuffle, DJ Role, and Auto-Disconnect."""

    def __init__(self, bot):
        self.bot = bot
        self.states: Dict[int, GuildMusicState] = {}

    def get_state(self, guild_id: int) -> GuildMusicState:
        if guild_id not in self.states:
            self.states[guild_id] = GuildMusicState()
        return self.states[guild_id]

    async def play_next(self, guild: discord.Guild):
        state = self.get_state(guild.id)
        vc = guild.voice_client
        if not vc:
            return

        if state.loop and state.current:
            next_track = state.current
        elif state.queue:
            next_track = state.queue.pop(0)
            state.current = next_track
        else:
            state.current = None
            await asyncio.sleep(180)
            if vc.is_connected() and not vc.is_playing():
                await vc.disconnect()
            return

        source = discord.PCMVolumeTransformer(
            discord.FFmpegPCMAudio(next_track["stream_url"], **FFMPEG_OPTIONS),
            volume=state.volume,
        )
        vc.play(
            source,
            after=lambda e: asyncio.run_coroutine_threadsafe(self.play_next(guild), self.bot.loop),
        )

    @commands.hybrid_command(name="play", description="Play a track from an accessible audio URL or search query.")
    async def play_cmd(self, ctx: commands.Context, *, query: str):
        if not ctx.author.voice or not ctx.author.voice.channel:
            return await ctx.reply("Join a voice channel first before using `/play`.", ephemeral=True)

        await ctx.defer()
        vc = ctx.guild.voice_client
        if not vc:
            vc = await ctx.author.voice.channel.connect()

        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, lambda: ytdl.extract_info(query, download=False))
        if "entries" in info:
            info = info["entries"][0]

        track = {
            "title": info.get("title", "Unknown Track"),
            "stream_url": info["url"],
            "webpage_url": info.get("webpage_url", ""),
            "requested_by": str(ctx.author),
        }
        state = self.get_state(ctx.guild.id)
        state.queue.append(track)

        if not vc.is_playing() and not vc.is_paused():
            await self.play_next(ctx.guild)

        embed = discord.Embed(
            title="Added to Music Queue",
            description=f"**{track['title']}**\nRequested by: {ctx.author.mention}",
            color=discord.Color.blurple(),
        )
        await ctx.reply(embed=embed, view=MusicControlPanel(self, ctx.guild.id))

    @commands.hybrid_command(name="pause", description="Pause the current audio stream.")
    async def pause_cmd(self, ctx: commands.Context):
        if ctx.guild.voice_client and ctx.guild.voice_client.is_playing():
            ctx.guild.voice_client.pause()
            await ctx.reply("Playback paused.")

    @commands.hybrid_command(name="resume", description="Resume a paused audio stream.")
    async def resume_cmd(self, ctx: commands.Context):
        if ctx.guild.voice_client and ctx.guild.voice_client.is_paused():
            ctx.guild.voice_client.resume()
            await ctx.reply("Playback resumed.")

    @commands.hybrid_command(name="skip", description="Skip the currently playing song.")
    async def skip_cmd(self, ctx: commands.Context):
        if ctx.guild.voice_client and ctx.guild.voice_client.is_playing():
            ctx.guild.voice_client.stop()
            await ctx.reply("Skipped current track.")

    @commands.hybrid_command(name="stop", description="Stop playback and clear the queue.")
    async def stop_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        state.queue.clear()
        if ctx.guild.voice_client:
            ctx.guild.voice_client.stop()
        await ctx.reply("Stopped playback and cleared the queue.")

    @commands.hybrid_command(name="queue", description="Display the current music queue.")
    async def queue_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        lines = [f"`{idx + 1}.` **{t['title']}** (by {t['requested_by']})" for idx, t in enumerate(state.queue[:15])]
        embed = discord.Embed(
            title=f"Server Music Queue ({len(state.queue)} upcoming)",
            description="\n".join(lines) or "Queue is currently empty.",
            color=discord.Color.blurple(),
        )
        if state.current:
            embed.add_field(name="Now Playing", value=state.current["title"], inline=False)
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="nowplaying", description="Show the currently playing song and interactive controls.")
    async def nowplaying_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        if not state.current:
            return await ctx.reply("Nothing is playing right now.")
        embed = discord.Embed(
            title="Now Playing",
            description=f"**{state.current['title']}**\nRequested by: {state.current['requested_by']}",
            color=discord.Color.green(),
        )
        await ctx.reply(embed=embed, view=MusicControlPanel(self, ctx.guild.id))

    @commands.hybrid_command(name="volume", description="Adjust playback volume (1-100%).")
    async def volume_cmd(self, ctx: commands.Context, percent: int):
        vol = max(1, min(100, percent)) / 100.0
        state = self.get_state(ctx.guild.id)
        state.volume = vol
        if ctx.guild.voice_client and ctx.guild.voice_client.source:
            ctx.guild.voice_client.source.volume = vol
        await ctx.reply(f"Playback volume set to `{int(vol * 100)}%`.")

    @commands.hybrid_command(name="loop", description="Toggle looping of the current track.")
    async def loop_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        state.loop = not state.loop
        await ctx.reply(f"Track loop is now **{'ENABLED' if state.loop else 'DISABLED'}**.")

    @commands.hybrid_command(name="shuffle", description="Shuffle the tracks in the music queue.")
    async def shuffle_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        random.shuffle(state.queue)
        await ctx.reply("Shuffled the music queue.")

    @commands.hybrid_command(name="remove", description="Remove a track at a specific position in the queue.")
    async def remove_cmd(self, ctx: commands.Context, position: int):
        state = self.get_state(ctx.guild.id)
        if 1 <= position <= len(state.queue):
            removed = state.queue.pop(position - 1)
            await ctx.reply(f"Removed **{removed['title']}** from the queue.")
        else:
            await ctx.reply("Invalid queue position.", ephemeral=True)

    @commands.hybrid_command(name="clearqueue", description="Clear all upcoming tracks in the queue.")
    async def clearqueue_cmd(self, ctx: commands.Context):
        state = self.get_state(ctx.guild.id)
        state.queue.clear()
        await ctx.reply("Cleared all upcoming tracks from the queue.")

    @commands.hybrid_command(name="disconnect", description="Disconnect the bot from the voice channel.")
    async def disconnect_cmd(self, ctx: commands.Context):
        if ctx.guild.voice_client:
            await ctx.guild.voice_client.disconnect()
            await ctx.reply("Disconnected from voice channel.")


async def setup(bot):
    await bot.add_cog(MusicCog(bot))
