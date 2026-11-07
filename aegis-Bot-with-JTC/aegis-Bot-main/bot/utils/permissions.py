import discord
from discord import app_commands
from discord.ext import commands
from typing import Callable


async def validate_member_access(
    bot,
    member: discord.Member,
    command_name: str,
    default_admin: bool = False,
    default_mod: bool = False,
) -> tuple[bool, str]:
    """
    Server-side RBAC validator for both slash interactions and hybrid prefix commands.
    Never relies solely on hidden UI controls.
    """
    if member.guild.owner_id == member.id or member.guild_permissions.administrator:
        return True, "Authorized (Administrator)"

    guild_settings = await bot.db.get_guild_settings(member.guild.id)
    member_role_ids = {role.id for role in member.roles}
    admin_role_ids = set(guild_settings.get("admin_role_ids", []))
    mod_role_ids = set(guild_settings.get("mod_role_ids", []))

    is_custom_admin = bool(member_role_ids & admin_role_ids)
    is_custom_mod = is_custom_admin or bool(member_role_ids & mod_role_ids) or member.guild_permissions.manage_guild

    perm_rule = await bot.db.get_command_permission(member.guild.id, command_name)
    if perm_rule is not None:
        if not perm_rule.get("enabled", 1):
            return False, f"The command `/{command_name}` is currently disabled by server administrators."
        if member.id in perm_rule.get("allowed_user_ids", []):
            return True, "Authorized (Explicit User Grant)"
        if member_role_ids & set(perm_rule.get("allowed_role_ids", [])):
            return True, "Authorized (Explicit Role Grant)"
        if perm_rule.get("require_admin") and not is_custom_admin:
            return False, f"`/{command_name}` requires an authorized Administrator role."
        if perm_rule.get("require_mod") and not is_custom_mod:
            return False, f"`/{command_name}` requires an authorized Moderator role."
        if not perm_rule.get("require_admin") and not perm_rule.get("require_mod") and not perm_rule.get("allowed_role_ids"):
            return True, "Authorized"
        return False, f"Your roles are not permitted to execute `/{command_name}`."

    if default_admin and not is_custom_admin:
        return False, "This action requires Administrator privileges."
    if default_mod and not is_custom_mod:
        return False, "This action requires Moderator privileges."
    return True, "Authorized"


def require_Hierarchy(actor: discord.Member, target: discord.Member) -> tuple[bool, str]:
    """Prevents moderators from targeting members with equal or higher role hierarchy."""
    if target.id == actor.id:
        return False, "You cannot perform this moderation action on yourself."
    if target.id == actor.guild.owner_id:
        return False, "You cannot target the server owner."
    if actor.id != actor.guild.owner_id and target.top_role >= actor.top_role:
        return (
            False,
            f"Hierarchy protection: {target.mention} has an equal or higher top role ({target.top_role.mention}) than yours.",
        )
    if target.top_role >= actor.guild.me.top_role:
        return (
            False,
            f"Bot hierarchy error: My highest role is below or equal to {target.mention}'s top role.",
        )
    return True, "Hierarchy valid"


def check_access(command_name: str, default_admin: bool = False, default_mod: bool = False) -> Callable:
    """Decorator for hybrid and slash commands enforcing database-backed RBAC."""

    async def predicate(ctx: commands.Context) -> bool:
        if not ctx.guild or not isinstance(ctx.author, discord.Member):
            raise commands.CheckFailure("This command can only be executed inside a server.")
        allowed, reason = await validate_member_access(
            ctx.bot, ctx.author, command_name, default_admin=default_admin, default_mod=default_mod
        )
        if not allowed:
            raise commands.CheckFailure(reason)
        return True

    return commands.check(predicate)
