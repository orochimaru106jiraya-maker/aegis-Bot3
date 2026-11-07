# Join-to-Create setup

This JTC module is integrated into the existing `discord.py` bot as `cogs.jtc`.
No new Python dependency is required. The bot already enables `voice_states` in `main.py`.

## Discord permissions

Give the bot these server/channel permissions:

- Manage Channels
- Move Members
- View Channels
- Connect

The bot's role must be high enough to manage the temporary voice channels. Do not grant Administrator solely for JTC.

## Configure in Discord

1. Create a voice channel that members will join to create their own room (for example, `➕ Join to Create`).
2. Create a category for the temporary rooms (for example, `Temporary Voice Rooms`).
3. Run `/jtc setup` and select the trigger voice channel and temporary-room category.
4. Optionally set the room name format. Use `{username}` or `{user}` as the member-name placeholder.
5. Run `/jtc config` to review settings.
6. Join the trigger voice channel to test creation.
7. While inside your generated room, run `/jtc panel` to open the owner controls.

## Commands

- `/jtc setup` — configure or update JTC (requires Manage Server)
- `/jtc config` — show settings
- `/jtc enable` / `/jtc disable` — turn creation on or off (requires Manage Server)
- `/jtc panel` — open rename, lock/unlock, hide/show, user-limit, and delete controls
- `/jtc add member` — grant a member access to your room
- `/jtc remove member` — revoke a member's room-specific access
- `/jtc transfer member` — transfer ownership to a member currently in your room
- `/jtc list` — list active rooms

If the owner leaves while other people remain, ownership automatically transfers to the first remaining member. When the room becomes empty, it is deleted and its database record is removed.

## Deployment

The `main.py` file now loads `cogs.jtc` automatically. Commit and push the updated project, then redeploy the existing Railway service. Keep the same persistent volume and `DATABASE_PATH` setting used by the current bot so JTC records and all existing bot data survive deployments.

The bot globally syncs application commands during startup. Discord may take a short time to display newly added slash commands.
