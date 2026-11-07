import React, { useState } from 'react';

interface CommandRef {
  cmd: string;
  module: string;
  hybrid: boolean;
  defaultRole: string;
  description: string;
}

const ALL_COMMANDS: CommandRef[] = [
  { cmd: '/setup', module: 'Setup Wizard', hybrid: true, defaultRole: 'Administrator', description: 'Open the interactive all-in-one server configuration dashboard.' },
  { cmd: '/ticket setup', module: 'Ticket System', hybrid: false, defaultRole: 'Administrator', description: 'Deploy the 4-category ticket panel and configure transcripts, limits & auto-delete.' },
  { cmd: '/ticket add', module: 'Ticket System', hybrid: false, defaultRole: 'Ticket Staff', description: 'Add a member to the current private ticket channel.' },
  { cmd: '/ticket remove', module: 'Ticket System', hybrid: false, defaultRole: 'Ticket Staff', description: 'Remove a member from the current ticket channel.' },
  { cmd: '/ticket transfer', module: 'Ticket System', hybrid: false, defaultRole: 'Ticket Staff', description: 'Transfer ticket claim ownership to another staff member.' },
  { cmd: '/ticket reopen', module: 'Ticket System', hybrid: false, defaultRole: 'Ticket Staff', description: 'Reopen a closed ticket channel and cancel its auto-delete timer.' },
  { cmd: '/ban', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Ban a member with confirmation button and hierarchy check.' },
  { cmd: '/unban', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Unban a user by Discord ID and log the case.' },
  { cmd: '/kick', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Kick a member from the server with hierarchy validation.' },
  { cmd: '/timeout', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Timeout a member for 1 to 40,320 minutes.' },
  { cmd: '/untimeout', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Remove an active timeout from a member.' },
  { cmd: '/warn', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Record a formal warning in SQLite and notify #mod-logs.' },
  { cmd: '/warnings', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'List active warnings for a member.' },
  { cmd: '/clearwarnings', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Clear all active warnings for a member.' },
  { cmd: '/lock', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Lock the current channel for @everyone.' },
  { cmd: '/unlock', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Unlock the current channel for @everyone.' },
  { cmd: '/slowmode', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Configure channel slowmode delay (0–21600s).' },
  { cmd: '/hide', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Hide the current channel from @everyone.' },
  { cmd: '/unhide', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Unhide the current channel for @everyone.' },
  { cmd: '/mute', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Assign the server Muted role across text channels.' },
  { cmd: '/unmute', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Remove the server Muted role from a member.' },
  { cmd: '/modlogs', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Query SQLite moderation history for the server or a member.' },
  { cmd: '/case', module: 'Moderation', hybrid: true, defaultRole: 'Moderator', description: 'Inspect full details of a specific moderation case ID.' },
  { cmd: '/purge', module: 'Purge System', hybrid: true, defaultRole: 'Moderator', description: 'Bulk delete messages by count, user, word, links, attachments, or bots.' },
  { cmd: '/snipe', module: 'Snipe System', hybrid: true, defaultRole: 'Moderator', description: 'Recover recently deleted messages (strictly blocked in ticket channels).' },
  { cmd: '/editsnipe', module: 'Snipe System', hybrid: true, defaultRole: 'Moderator', description: 'Recover recently edited messages (strictly blocked in ticket channels).' },
  { cmd: '/serverinfo', module: 'Administration', hybrid: true, defaultRole: 'Everyone', description: 'Show server owner, member counts, boost tier, and channel totals.' },
  { cmd: '/userinfo', module: 'Administration', hybrid: true, defaultRole: 'Everyone', description: 'Show account age, server join date, and assigned roles.' },
  { cmd: '/roleinfo', module: 'Administration', hybrid: true, defaultRole: 'Everyone', description: 'Show role ID, member count, position, and hoist status.' },
  { cmd: '/channelinfo', module: 'Administration', hybrid: true, defaultRole: 'Everyone', description: 'Show channel category, slowmode, and creation date.' },
  { cmd: '/botinfo', module: 'Administration', hybrid: true, defaultRole: 'Everyone', description: 'Display Python/discord.py version, latency, uptime, and SQLite engine.' },
  { cmd: '/setprefix', module: 'Administration', hybrid: true, defaultRole: 'Administrator', description: 'Change the server hybrid command prefix in SQLite.' },
  { cmd: '/setlanguage', module: 'Administration', hybrid: true, defaultRole: 'Administrator', description: 'Set server language code (en, es, fr, de, hi).' },
  { cmd: '/setlogs', module: 'Administration', hybrid: true, defaultRole: 'Administrator', description: 'Configure moderation and server log channels.' },
  { cmd: '/settings', module: 'Administration', hybrid: true, defaultRole: 'Administrator', description: 'Display a complete summary of all server settings.' },
  { cmd: '/permissions', module: 'Permission Mgmt', hybrid: true, defaultRole: 'Administrator', description: 'Configure RBAC role/user access or enable/disable any command.' },
  { cmd: '/dashboard', module: 'Administration', hybrid: true, defaultRole: 'Administrator', description: 'Open the setup dashboard or export a JSON configuration backup.' },
  { cmd: '/autoroles configure', module: 'Activity Roles', hybrid: false, defaultRole: 'Administrator', description: 'Configure Spotify, Gaming, Voice Chat, and Text Chat milestone roles.' },
  { cmd: '/reactionroles create', module: 'Reaction Roles', hybrid: false, defaultRole: 'Administrator', description: 'Create an interactive self-assignable role panel.' },
  { cmd: '/embed', module: 'Embed Builder', hybrid: true, defaultRole: 'Moderator', description: 'Launch the interactive modal/button embed builder & template saver.' },
  { cmd: '/autoresponder add', module: 'Auto Responder', hybrid: false, defaultRole: 'Administrator', description: 'Add exact or contains keyword triggers with cooldowns.' },
  { cmd: '/ai', module: 'Personal AI', hybrid: true, defaultRole: 'Everyone', description: 'Query the local rule-based server assistant (zero paid API required).' },
  { cmd: '/aikb add', module: 'Personal AI', hybrid: false, defaultRole: 'Administrator', description: 'Add a topic, keywords, and answer to the local SQLite AI knowledge base.' },
  { cmd: '/play', module: 'Music System', hybrid: true, defaultRole: 'Everyone', description: 'Play or queue a track from a supported audio URL or search query.' },
  { cmd: '/pause', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Pause current voice playback.' },
  { cmd: '/resume', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Resume paused voice playback.' },
  { cmd: '/skip', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Skip the current track.' },
  { cmd: '/stop', module: 'Music System', hybrid: true, defaultRole: 'DJ / Moderator', description: 'Stop playback and clear the queue.' },
  { cmd: '/queue', module: 'Music System', hybrid: true, defaultRole: 'Everyone', description: 'Display upcoming tracks in the server music queue.' },
  { cmd: '/nowplaying', module: 'Music System', hybrid: true, defaultRole: 'Everyone', description: 'Show the active song and interactive control buttons.' },
  { cmd: '/volume', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Adjust playback volume (1–100%).' },
  { cmd: '/loop', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Toggle looping of the current track.' },
  { cmd: '/shuffle', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Shuffle upcoming tracks in the queue.' },
  { cmd: '/remove', module: 'Music System', hybrid: true, defaultRole: 'DJ / Everyone', description: 'Remove a specific track number from the queue.' },
  { cmd: '/clearqueue', module: 'Music System', hybrid: true, defaultRole: 'DJ / Moderator', description: 'Remove all upcoming tracks from the queue.' },
  { cmd: '/disconnect', module: 'Music System', hybrid: true, defaultRole: 'DJ / Moderator', description: 'Disconnect the bot from the voice channel.' },
];

export const DeploymentAndGuides: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredCommands = ALL_COMMANDS.filter(
    (c) =>
      c.cmd.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top 3 Guide Sections: Railway, Developer Portal & Ephemeral Storage Warning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-2.5">
          <h3 className="text-sm font-semibold text-white">
            01. Railway Deployment & Persistent Volume
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Railway containers use an <strong>ephemeral filesystem</strong> by default—any local SQLite file written inside `/app` is reset when redeploying or replacing the container.
          </p>
          <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
            <li>Push the `/bot/` folder to a GitHub repository and connect it to Railway.</li>
            <li>Attach a <strong>Railway Volume</strong> mounted at `/data`.</li>
            <li>Set `DATABASE_PATH=/data/aegisbot.db` and `DISCORD_TOKEN=...` in Railway Variables.</li>
            <li>`railway.json` automatically provisions Python 3.11, `ffmpeg`, and `libopus`.</li>
          </ol>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-2.5">
          <h3 className="text-sm font-semibold text-white">
            02. Discord Developer Portal & Intents
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Enable all three Privileged Gateway Intents under <strong>Discord Developer Portal → Bot</strong>:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>
              <code className="text-indigo-300">PRESENCE INTENT</code>: Required for Spotify & Gaming auto-roles. Note: Discord does not expose activity if a user disables activity privacy or is invisible.
            </li>
            <li>
              <code className="text-indigo-300">SERVER MEMBERS INTENT</code>: Required for moderation hierarchy checks and role assignment.
            </li>
            <li>
              <code className="text-indigo-300">MESSAGE CONTENT INTENT</code>: Required for hybrid prefix commands, `/snipe`, auto-responder, and text milestones.
            </li>
          </ul>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-2.5">
          <h3 className="text-sm font-semibold text-white">
            03. Troubleshooting & Rate-Limit Safeguards
          </h3>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>
              <strong>Slash Commands Not Showing:</strong> Global `tree.sync()` can take up to 1 hour on Discord; re-invite the bot with `applications.commands` scope.
            </li>
            <li>
              <strong>Ticket DMs Failing:</strong> Users with privacy settings blocking server DMs trigger `discord.Forbidden`; AegisBot catches this and posts a notice in the ticket channel while still saving the transcript in `#transcripts`.
            </li>
            <li>
              <strong>Role Hierarchy Error:</strong> Ensure the `AegisBot` role is dragged above all Moderator, Muted, and Activity roles in Server Settings → Roles.
            </li>
          </ul>
        </div>
      </div>

      {/* Complete 56-Command Reference Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Complete Command Reference ({filteredCommands.length} Commands across 8 Phases)
            </h3>
            <p className="text-xs text-slate-400">
              All commands validate permissions on the server side (`utils/permissions.py`) and persist settings in SQLite (`database/db.py`).
            </p>
          </div>
          <input
            type="text"
            aria-label="Filter command list"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands or modules..."
            className="w-full sm:w-64 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
          />
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                <th className="py-2.5 px-3 font-medium">Command</th>
                <th className="py-2.5 px-3 font-medium">Module</th>
                <th className="py-2.5 px-3 font-medium">Type</th>
                <th className="py-2.5 px-3 font-medium">Default Access</th>
                <th className="py-2.5 px-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredCommands.map((c) => (
                <tr key={c.cmd} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono font-semibold text-indigo-300">{c.cmd}</td>
                  <td className="py-2.5 px-3 text-slate-300">{c.module}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">
                    {c.hybrid ? 'Hybrid (Slash + Prefix)' : 'Slash Group'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{c.defaultRole}</td>
                  <td className="py-2.5 px-3 text-slate-400">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
