import React, { useState } from 'react';
import {
  Hash,
  Lock,
  Mail,
  Send,
  ShieldAlert,
  Terminal,
  Trash2,
  UserPlus,
  UserMinus,
  FileText,
  Bell,
  Info,
  RotateCcw,
  ArrowRightLeft,
  Edit3,
  Check,
  X,
  Volume2,
} from 'lucide-react';
import {
  type TicketCategoryKey,
  type TicketCategoryConfig,
  type TicketRecord,
  type DirectMessageDelivery,
  type ModCase,
  type CommandPermissionRule,
  type AIKnowledgeEntry,
  type AutoResponderRule,
  type TicketMessage,
  formatTicketChannelName,
  validateTicketCreation,
  processTicketClose,
  generateTicketTranscript,
  evaluateCommandRBAC,
  filterMessagesForPurge,
  queryLocalAIEngine,
} from '../engine/botEngine';

interface LiveDiscordSandboxProps {
  ticketCategories: Record<TicketCategoryKey, TicketCategoryConfig>;
  maxOpenPerUser: number;
  autoDeleteSeconds: number;
  panelTitle: string;
  panelDescription: string;
  tickets: TicketRecord[];
  setTickets: React.Dispatch<React.SetStateAction<TicketRecord[]>>;
  dmInbox: DirectMessageDelivery[];
  setDmInbox: React.Dispatch<React.SetStateAction<DirectMessageDelivery[]>>;
  modCases: ModCase[];
  setModCases: React.Dispatch<React.SetStateAction<ModCase[]>>;
  permissionRules: CommandPermissionRule[];
  aiKnowledge: AIKnowledgeEntry[];
  aiPersonality: string;
  autoTriggers: AutoResponderRule[];
}

interface DeletedOrEditedSnipe {
  id: string;
  channelId: string;
  isTicket: boolean;
  type: 'delete' | 'edit';
  authorName: string;
  beforeContent: string;
  afterContent?: string;
  timestamp: string;
}

export const LiveDiscordSandbox: React.FC<LiveDiscordSandboxProps> = ({
  ticketCategories,
  maxOpenPerUser,
  autoDeleteSeconds,
  panelTitle,
  panelDescription,
  tickets,
  setTickets,
  dmInbox,
  setDmInbox,
  modCases,
  setModCases,
  permissionRules,
  aiKnowledge,
  aiPersonality,
  autoTriggers,
}) => {
  const [activeChannelId, setActiveChannelId] = useState<string>('ch-ticket-panel');
  const [activePersona, setActivePersona] = useState<{
    id: string;
    name: string;
    role: 'Member' | 'Moderator' | 'Admin';
    rolesList: string[];
  }>({
    id: 'u-alex',
    name: 'alex',
    role: 'Moderator',
    rolesList: ['Member', 'Moderator', 'Support Staff'],
  });

  const [creatorDmsEnabled, setCreatorDmsEnabled] = useState<boolean>(true);
  const [modDmsEnabled, setModDmsEnabled] = useState<boolean>(true);

  // Modal state for opening a new ticket
  const [activeModalCategory, setActiveModalCategory] = useState<TicketCategoryKey | null>(null);
  const [modalAnswers, setModalAnswers] = useState<Record<string, string>>({});
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Modal state for closing a ticket
  const [closingTicketId, setClosingTicketId] = useState<number | null>(null);
  const [closeReasonInput, setCloseReasonInput] = useState<string>('Issue resolved and verified with user.');

  // Rename / Add / Transfer state inside ticket
  const [renameInput, setRenameInput] = useState<string>('');
  const [showRenameInput, setShowRenameInput] = useState<boolean>(false);
  const [transferStaffInput, setTransferStaffInput] = useState<string>('SeniorMod_Elena');
  const [showTransferInput, setShowTransferInput] = useState<boolean>(false);
  const [activeTranscriptModal, setActiveTranscriptModal] = useState<string | null>(null);

  // General channel messages & snipe store
  const [channelMessages, setChannelMessages] = useState<Record<string, TicketMessage[]>>({
    'ch-general': [
      {
        id: 'g-1',
        authorId: 'u-sarah',
        authorName: 'sarah_dev',
        authorRole: 'Member',
        content: 'Hey everyone! How do I apply for a moderator position or claim giveaway rewards?',
        timestamp: '01:12 UTC',
      },
      {
        id: 'g-2',
        authorId: 'u-spam',
        authorName: 'promo_user',
        authorRole: 'Member',
        content: 'Check out this external link https://example.com/free-promo right now!',
        timestamp: '01:14 UTC',
      },
    ],
    'ch-ai': [
      {
        id: 'ai-1',
        authorId: 'bot',
        authorName: 'AegisBot',
        authorRole: 'Bot',
        content:
          'Local Rule-Based AI Assistant is active. Ask any question below or run `/ai <question>` — operates with 0 external paid API dependencies.',
        timestamp: '01:00 UTC',
      },
    ],
  });

  const [snipeStore, setSnipeStore] = useState<DeletedOrEditedSnipe[]>([
    {
      id: 'sn-1',
      channelId: 'ch-general',
      isTicket: false,
      type: 'delete',
      authorName: 'troll_account',
      beforeContent: 'I deleted this secret message hoping moderators would not see it!',
      timestamp: '01:18 UTC',
    },
    {
      id: 'sn-2',
      channelId: 'ch-general',
      isTicket: false,
      type: 'edit',
      authorName: 'sarah_dev',
      beforeContent: 'Wait is the server offline?',
      afterContent: 'Nevermind, everything is working smoothly!',
      timestamp: '01:19 UTC',
    },
  ]);

  const [chatInput, setChatInput] = useState<string>('');
  const [slashInput, setSlashInput] = useState<string>('/warn @promo_user Posting unsolicited links');

  // Music player simulator state
  const [musicState, setMusicState] = useState<{
    playing: boolean;
    paused: boolean;
    volume: number;
    loop: boolean;
    current: { title: string; requestedBy: string } | null;
    queue: { title: string; requestedBy: string }[];
  }>({
    playing: true,
    paused: false,
    volume: 75,
    loop: false,
    current: { title: 'Lofi Coding Beats — Late Night Synthwave', requestedBy: 'alex' },
    queue: [
      { title: 'Ambient Space Station — Deep Focus Mix', requestedBy: 'sarah_dev' },
      { title: 'Chiptune Boss Battle — 8-Bit Orchestra', requestedBy: 'ModKira' },
    ],
  });

  const currentTicket = tickets.find((t) => t.channelId === activeChannelId && t.status !== 'deleted');

  const openTicketModal = (categoryKey: TicketCategoryKey) => {
    const cfg = ticketCategories[categoryKey];
    const initial: Record<string, string> = {};
    cfg.questions.forEach((q, idx) => {
      if (categoryKey === 'general') {
        initial[q] = idx === 0 ? 'Role permission sync issue' : 'My Voice Chat milestone role did not appear after joining Lounge.';
      } else if (categoryKey === 'complaint') {
        initial[q] = idx === 0 ? 'User @promo_user (#4812)' : idx === 1 ? 'Posting spam links in #general-chat' : 'Screenshot log ID #994';
      } else if (categoryKey === 'staff') {
        initial[q] = idx === 0 ? 'Community Moderator' : idx === 1 ? 'Active 6 hours daily, experienced with discord.py moderation workflows' : 'Moderated a 15,000-member gaming community for 2 years.';
      } else {
        initial[q] = idx === 0 ? 'Weekend Coding Challenge #14' : idx === 1 ? 'Announcement message link #88210' : activePersona.name;
      }
    });
    setModalAnswers(initial);
    setActiveModalCategory(categoryKey);
  };

  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalCategory) return;

    // Validate required non-empty fields
    for (const [q, a] of Object.entries(modalAnswers)) {
      if (!a || !a.trim()) {
        setBannerFeedback({
          type: 'error',
          text: `Please provide an answer for "${q}" before submitting.`,
        });
        return;
      }
    }

    const validation = validateTicketCreation(
      tickets,
      activePersona.id,
      activeModalCategory,
      maxOpenPerUser
    );
    if (!validation.allowed) {
      setBannerFeedback({ type: 'error', text: validation.error || 'Ticket limit reached.' });
      setActiveModalCategory(null);
      return;
    }

    const cfg = ticketCategories[activeModalCategory];
    const nextId = tickets.length > 0 ? Math.max(...tickets.map((t) => t.ticketId)) + 1 : 101;
    const channelName = formatTicketChannelName(cfg.namingFormat, activePersona.name, nextId);
    const channelId = `ch-ticket-${nextId}`;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';

    const newTicket: TicketRecord = {
      ticketId: nextId,
      channelId,
      channelName,
      discordCategoryName: cfg.discordCategoryName,
      categoryKey: activeModalCategory,
      categoryLabel: cfg.label,
      creatorId: activePersona.id,
      creatorName: activePersona.name,
      creatorDmsEnabled,
      claimedById: null,
      claimedByName: null,
      claimedByDmsEnabled: modDmsEnabled,
      status: 'open',
      answers: { ...modalAnswers },
      messages: [
        {
          id: `tm-${Date.now()}`,
          authorId: 'bot',
          authorName: 'AegisBot',
          authorRole: 'Bot',
          content: `Welcome @${activePersona.name}! Authorized staff (${cfg.staffRoles.join(', ')}) have been notified. Your private ticket channel is isolated from other members.`,
          timestamp: nowStr,
        },
      ],
      claimHistory: [],
      createdAt: nowStr,
    };

    setTickets((prev) => [...prev, newTicket]);
    setActiveModalCategory(null);
    setActiveChannelId(channelId);
    setBannerFeedback({
      type: 'success',
      text: `Created Ticket #${nextId} (#${channelName}) under category "${cfg.discordCategoryName}".`,
    });
  };

  const handleClaimTicket = (ticket: TicketRecord) => {
    if (activePersona.role === 'Member') {
      setBannerFeedback({
        type: 'error',
        text: 'Permission Denied: Only authorized Ticket Staff or Moderators can claim tickets. Switch persona to Moderator or Admin.',
      });
      return;
    }
    if (ticket.claimedById) {
      setBannerFeedback({
        type: 'error',
        text: `Ticket #${ticket.ticketId} is already claimed by ${ticket.claimedByName}. Use Transfer or Unclaim first.`,
      });
      return;
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticket.ticketId
          ? {
              ...t,
              claimedById: activePersona.id,
              claimedByName: activePersona.name,
              claimedByDmsEnabled: modDmsEnabled,
              claimHistory: [
                ...t.claimHistory,
                {
                  staffId: activePersona.id,
                  staffName: activePersona.name,
                  action: 'CLAIMED',
                  timestamp: nowStr,
                },
              ],
              messages: [
                ...t.messages,
                {
                  id: `tm-${Date.now()}`,
                  authorId: 'bot',
                  authorName: 'AegisBot',
                  authorRole: 'Bot',
                  content: `Ticket #${ticket.ticketId} has been claimed by moderator @${activePersona.name}.`,
                  timestamp: nowStr,
                },
              ],
            }
          : t
      )
    );
    setBannerFeedback({
      type: 'success',
      text: `Ticket #${ticket.ticketId} claimed by ${activePersona.name}.`,
    });
  };

  const handleUnclaimTicket = (ticket: TicketRecord) => {
    if (!ticket.claimedById) return;
    if (activePersona.role === 'Member') {
      setBannerFeedback({ type: 'error', text: 'Only staff can unclaim tickets.' });
      return;
    }
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticket.ticketId
          ? {
              ...t,
              claimedById: null,
              claimedByName: null,
              claimHistory: [
                ...t.claimHistory,
                {
                  staffId: activePersona.id,
                  staffName: activePersona.name,
                  action: 'UNCLAIMED',
                  timestamp: nowStr,
                },
              ],
              messages: [
                ...t.messages,
                {
                  id: `tm-${Date.now()}`,
                  authorId: 'bot',
                  authorName: 'AegisBot',
                  authorRole: 'Bot',
                  content: `Ticket #${ticket.ticketId} is now unclaimed (released by @${activePersona.name}).`,
                  timestamp: nowStr,
                },
              ],
            }
          : t
      )
    );
  };

  const handleConfirmCloseTicket = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTicket = tickets.find((t) => t.ticketId === closingTicketId);
    if (!targetTicket) return;

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    const syncedTicket: TicketRecord = {
      ...targetTicket,
      creatorDmsEnabled,
      claimedByDmsEnabled: modDmsEnabled,
    };

    const outcome = processTicketClose({
      ticket: syncedTicket,
      closingModeratorId: activePersona.id,
      closingModeratorName: activePersona.name,
      closingModeratorDmsEnabled: modDmsEnabled,
      reason: closeReasonInput.trim() || 'Resolved by staff.',
      timestamp: nowStr,
    });

    const closeNoticeMsg: TicketMessage = {
      id: `tm-close-${Date.now()}`,
      authorId: 'bot',
      authorName: 'AegisBot',
      authorRole: 'Bot',
      content:
        `Ticket #${targetTicket.ticketId} closed by @${activePersona.name}. Reason: "${outcome.updatedTicket.closeReason}". ` +
        `Transcript saved to #transcripts. Creator DM: ${outcome.creatorDm.delivered ? 'Sent' : 'FAILED (DMs Disabled)'} · ` +
        `Staff DM (${outcome.moderatorDm.recipientName}): ${outcome.moderatorDm.delivered ? 'Sent' : 'FAILED (DMs Disabled)'}. ` +
        `Channel scheduled for auto-deletion in ${autoDeleteSeconds}s.`,
      timestamp: nowStr,
    };

    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === targetTicket.ticketId
          ? {
              ...outcome.updatedTicket,
              messages: [...outcome.updatedTicket.messages, closeNoticeMsg],
            }
          : t
      )
    );

    setDmInbox((prev) => [outcome.moderatorDm, outcome.creatorDm, ...prev]);
    setClosingTicketId(null);

    if (outcome.dmWarnings.length > 0) {
      setBannerFeedback({
        type: 'info',
        text: `Ticket #${targetTicket.ticketId} closed and logged to #transcripts. Staff Notice: ${outcome.dmWarnings.join(' ')}`,
      });
    } else {
      setBannerFeedback({
        type: 'success',
        text: `Ticket #${targetTicket.ticketId} closed! Transcript generated, saved to #transcripts, and separate DMs delivered to both Creator (${outcome.creatorDm.recipientName}) and Staff (${outcome.moderatorDm.recipientName}).`,
      });
    }
  };

  const handleReopenTicket = (ticket: TicketRecord) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticket.ticketId
          ? {
              ...t,
              status: 'open',
              messages: [
                ...t.messages,
                {
                  id: `tm-${Date.now()}`,
                  authorId: 'bot',
                  authorName: 'AegisBot',
                  authorRole: 'Bot',
                  content: `Ticket #${ticket.ticketId} reopened by @${activePersona.name}. Auto-deletion cancelled.`,
                  timestamp: nowStr,
                },
              ],
            }
          : t
      )
    );
    setBannerFeedback({ type: 'success', text: `Ticket #${ticket.ticketId} reopened.` });
  };

  const handleDeleteTicketChannel = (ticket: TicketRecord) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketId === ticket.ticketId ? { ...t, status: 'deleted' } : t))
    );
    setActiveChannelId('ch-ticket-panel');
    setBannerFeedback({
      type: 'info',
      text: `Deleted channel #${ticket.channelName}. Ticket #${ticket.ticketId} record and transcript remain preserved in SQLite.`,
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    const userMsg: TicketMessage = {
      id: `msg-${Date.now()}`,
      authorId: activePersona.id,
      authorName: activePersona.name,
      authorRole: activePersona.role,
      content: chatInput.trim(),
      timestamp: nowStr,
    };

    if (currentTicket) {
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketId === currentTicket.ticketId
            ? { ...t, messages: [...t.messages, userMsg] }
            : t
        )
      );
      setChatInput('');
      return;
    }

    // Normal channel message + check auto-responder or AI channel
    const updatedList = [...(channelMessages[activeChannelId] || []), userMsg];

    if (activeChannelId === 'ch-ai') {
      const aiRes = queryLocalAIEngine(chatInput.trim(), aiKnowledge, [], aiPersonality);
      updatedList.push({
        id: `ai-reply-${Date.now()}`,
        authorId: 'bot',
        authorName: 'AegisBot (Local AI)',
        authorRole: 'Bot',
        content: `[Topic: ${aiRes.matchedTopic}] ${aiRes.reply}`,
        timestamp: nowStr,
      });
    } else {
      // Check auto-responder rules
      for (const trig of autoTriggers) {
        if (!trig.enabled) continue;
        const hay = trig.caseSensitive ? chatInput.trim() : chatInput.trim().toLowerCase();
        const needle = trig.caseSensitive ? trig.trigger : trig.trigger.toLowerCase();
        const hit = trig.matchType === 'exact' ? hay === needle : hay.includes(needle);
        if (hit && trig.responses.length > 0) {
          updatedList.push({
            id: `ar-${Date.now()}`,
            authorId: 'bot',
            authorName: 'AegisBot Auto-Responder',
            authorRole: 'Bot',
            content: `${trig.mentionUser ? `@${activePersona.name} ` : ''}${trig.responses[0]}`,
            timestamp: nowStr,
          });
          break;
        }
      }
    }

    setChannelMessages((prev) => ({ ...prev, [activeChannelId]: updatedList }));
    setChatInput('');
  };

  const handleExecuteSlashCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = slashInput.trim();
    if (!raw) return;

    const parts = raw.replace(/^\//, '').split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';

    const rule = permissionRules.find((r) => r.commandName === cmd) || {
      commandName: cmd,
      moduleName: 'General',
      enabled: true,
      requireAdmin: false,
      requireMod: ['ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'clearwarnings', 'lock', 'unlock', 'slowmode', 'hide', 'unhide', 'mute', 'unmute', 'modlogs', 'case', 'purge', 'snipe', 'editsnipe'].includes(cmd),
      allowedRoles: [],
      allowedUsers: [],
    };

    const rbac = evaluateCommandRBAC({
      rule,
      userId: activePersona.id,
      userRoles: activePersona.rolesList,
    });

    if (!rbac.allowed) {
      setBannerFeedback({ type: 'error', text: `RBAC Guard: ${rbac.reason}` });
      return;
    }

    if (['ban', 'kick', 'timeout', 'warn', 'mute', 'unban', 'untimeout', 'unmute', 'lock', 'unlock'].includes(cmd)) {
      const target = parts[1] || '@target_user';
      const reason = parts.slice(2).join(' ') || 'Executed via slash command';
      const nextCaseId = modCases.length > 0 ? Math.max(...modCases.map((c) => c.caseId)) + 1 : 1;
      const newCase: ModCase = {
        caseId: nextCaseId,
        action: cmd.toUpperCase(),
        targetId: target.replace(/[^a-zA-Z0-9_-]/g, ''),
        targetName: target,
        moderatorId: activePersona.id,
        moderatorName: activePersona.name,
        reason,
        active: true,
        timestamp: nowStr,
      };
      setModCases((prev) => [newCase, ...prev]);
      setBannerFeedback({
        type: 'success',
        text: `Logged Moderation Case #${nextCaseId} (${cmd.toUpperCase()} on ${target}) to SQLite & #mod-logs.`,
      });
      return;
    }

    if (cmd === 'clearwarnings') {
      const target = (parts[1] || '').replace('@', '');
      setModCases((prev) =>
        prev.map((c) =>
          c.action === 'WARN' && (!target || c.targetName.includes(target))
            ? { ...c, active: false }
            : c
        )
      );
      setBannerFeedback({ type: 'success', text: `Cleared active warnings for ${parts[1] || 'target user'}.` });
      return;
    }

    if (cmd === 'purge') {
      const linksOnly = raw.includes('links');
      const count = parseInt(parts[1] || '10', 10) || 10;
      const currentMsgs = channelMessages['ch-general'] || [];
      const res = filterMessagesForPurge(currentMsgs, {
        limit: count,
        linksOnly,
      });
      setChannelMessages((prev) => ({ ...prev, 'ch-general': res.remaining }));
      setBannerFeedback({
        type: 'success',
        text: `/purge deleted ${res.deleted.length} message(s) in #general-chat${linksOnly ? ' (filtered: links_only)' : ''}.`,
      });
      return;
    }

    if (cmd === 'snipe' || cmd === 'editsnipe') {
      if (currentTicket) {
        setBannerFeedback({
          type: 'error',
          text: 'Privacy Protection: /snipe and /editsnipe are strictly blocked inside private ticket channels.',
        });
        return;
      }
      const matchType = cmd === 'snipe' ? 'delete' : 'edit';
      const found = snipeStore.find((s) => !s.isTicket && s.type === matchType);
      if (!found) {
        setBannerFeedback({ type: 'info', text: 'No recently deleted/edited messages in this channel.' });
      } else {
        setBannerFeedback({
          type: 'info',
          text:
            cmd === 'snipe'
              ? `Sniped deleted message by @${found.authorName} (${found.timestamp}): "${found.beforeContent}"`
              : `EditSniped @${found.authorName}: Before: "${found.beforeContent}" -> After: "${found.afterContent}"`,
        });
      }
      return;
    }

    if (cmd === 'ai') {
      const q = parts.slice(1).join(' ') || 'How do tickets work?';
      const aiRes = queryLocalAIEngine(q, aiKnowledge, [], aiPersonality);
      setBannerFeedback({
        type: 'success',
        text: `Local AI [${aiRes.matchedTopic}]: ${aiRes.reply}`,
      });
      return;
    }

    if (cmd === 'play') {
      const songTitle = parts.slice(1).join(' ') || 'Synthwave Horizon — Official Audio';
      setMusicState((prev) => ({
        ...prev,
        playing: true,
        paused: false,
        queue: [...prev.queue, { title: songTitle, requestedBy: activePersona.name }],
      }));
      setBannerFeedback({ type: 'success', text: `Queued track "${songTitle}" in Music Player.` });
      return;
    }

    setBannerFeedback({
      type: 'success',
      text: `Executed /${cmd} as @${activePersona.name} (${activePersona.role}).`,
    });
  };

  const openTicketsList = tickets.filter((t) => t.status !== 'deleted');

  return (
    <div className="space-y-4">
      {/* Sandbox Persona & DM Simulation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-400">Active Discord Persona:</span>
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
            {(
              [
                { id: 'u-alex', name: 'alex', role: 'Member', rolesList: ['Member'] },
                {
                  id: 'mod-kira',
                  name: 'ModKira',
                  role: 'Moderator',
                  rolesList: ['Member', 'Moderator', 'Support Staff'],
                },
                {
                  id: 'admin-vance',
                  name: 'AdminVance',
                  role: 'Admin',
                  rolesList: ['Member', 'Moderator', 'Administrator'],
                },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePersona({ ...p, rolesList: [...p.rolesList] })}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  activePersona.id === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.name} ({p.role})
              </button>
            ))}
          </div>
        </div>

        {/* DM Privacy Settings Simulator for testing Requirement 3.Closing System #6 & #7 */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={creatorDmsEnabled}
              onChange={(e) => setCreatorDmsEnabled(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-500"
            />
            <span>Creator DMs Open</span>
          </label>
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={modDmsEnabled}
              onChange={(e) => setModDmsEnabled(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-500"
            />
            <span>Claimed Mod DMs Open</span>
          </label>
        </div>
      </div>

      {/* Live Slash / Hybrid Command Bar */}
      <form
        onSubmit={handleExecuteSlashCommand}
        className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-slate-900 border border-slate-800 rounded-lg"
      >
        <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 shrink-0 px-2">
          <Terminal className="w-4 h-4" />
          <span>Slash / Hybrid Runner</span>
        </div>
        <input
          type="text"
          aria-label="Slash command input"
          value={slashInput}
          onChange={(e) => setSlashInput(e.target.value)}
          placeholder="Try /warn @user reason, /purge 10 links, /snipe, /editsnipe, /ai question, /play song..."
          className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          Run Command
        </button>
      </form>

      {bannerFeedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border text-xs ${
            bannerFeedback.type === 'error'
              ? 'bg-red-950/50 border-red-800/80 text-red-200'
              : bannerFeedback.type === 'info'
              ? 'bg-amber-950/50 border-amber-800/80 text-amber-200'
              : 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
          }`}
        >
          <span>{bannerFeedback.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setBannerFeedback(null)}
            className="text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-Column Discord Server Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Sidebar: Server Channels & Private Ticket Channels */}
        <aside className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Support & Ticket Panel
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-ticket-panel')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-ticket-panel'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">ticket-panel</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">4 Types</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-transcripts')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-transcripts'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">transcripts</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {tickets.filter((t) => t.transcriptText).length}
                  </span>
                </button>
              </div>
            </div>

            {/* Dynamic Category Channels for Active/Closed Tickets */}
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Private Ticket Channels ({openTicketsList.length})
              </div>
              {openTicketsList.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500">
                  No active tickets. Click a category button in #ticket-panel to open one.
                </p>
              ) : (
                <div className="space-y-1">
                  {openTicketsList.map((t) => (
                    <button
                      key={t.channelId}
                      type="button"
                      onClick={() => setActiveChannelId(t.channelId)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                        activeChannelId === t.channelId
                          ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
                          : 'text-slate-300 hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{t.channelName}</span>
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {t.status.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Community, Moderation, AI & Music Channels */}
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Server & Bot Modules
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-dm-inbox')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-dm-inbox'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">dm-receipts-inbox</span>
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 tabular-nums">
                    {dmInbox.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-mod-logs')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-mod-logs'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="truncate">mod-logs</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {modCases.filter((c) => c.active).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-general')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-general'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">general-chat</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-ai')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-ai'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">ai-assistant</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelId('ch-music')}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeChannelId === 'ch-music'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">music-stage</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div>Max Open Tickets / User: <span className="font-mono text-slate-200">{maxOpenPerUser}</span></div>
            <div>Auto-Delete Delay: <span className="font-mono text-slate-200">{autoDeleteSeconds}s</span></div>
          </div>
        </aside>

        {/* Right Main Viewport: Active Discord Channel Render */}
        <section className="lg:col-span-9 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between min-h-[540px]">
          {/* 1. #ticket-panel View */}
          {activeChannelId === 'ch-ticket-panel' && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Hash className="w-4 h-4 text-indigo-400" />
                  <span>ticket-panel</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs font-normal text-slate-400">
                    Persistent View (`PersistentTicketPanelView`) — Survives Bot Restarts
                  </span>
                </div>
              </div>

              {/* Simulated Discord Bot Embed for the 4-Category Ticket Panel */}
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono text-indigo-400">
                    AegisBot APP · Persistent Interactive Ticket Panel
                  </div>
                  <h2 className="text-lg font-semibold text-white">{panelTitle}</h2>
                  <p className="text-sm text-slate-300 leading-relaxed">{panelDescription}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {(Object.keys(ticketCategories) as TicketCategoryKey[]).map((key) => {
                    const cat = ticketCategories[key];
                    return (
                      <div
                        key={key}
                        className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-white">{cat.label}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            Category: {cat.discordCategoryName} · Format: {cat.namingFormat}
                          </div>
                          <ul className="text-xs text-slate-400 pt-1 space-y-0.5 list-disc list-inside">
                            {cat.questions.map((q, i) => (
                              <li key={i} className="truncate">{q}</li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => openTicketModal(key)}
                          className="w-full py-2 px-4 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          Open {cat.label} Ticket
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Summary of Existing Tickets */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Recent Server Tickets in SQLite ({tickets.length})
                </h3>
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                        <th className="py-2.5 px-3 font-medium">ID</th>
                        <th className="py-2.5 px-3 font-medium">Channel</th>
                        <th className="py-2.5 px-3 font-medium">Category</th>
                        <th className="py-2.5 px-3 font-medium">Creator</th>
                        <th className="py-2.5 px-3 font-medium">Claimed By</th>
                        <th className="py-2.5 px-3 font-medium">Status</th>
                        <th className="py-2.5 px-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {tickets.map((t) => (
                        <tr key={t.ticketId} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300">
                            #{t.ticketId}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-indigo-300">
                            #{t.channelName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{t.categoryLabel}</td>
                          <td className="py-2.5 px-3 text-slate-300">@{t.creatorName}</td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {t.claimedByName ? `@${t.claimedByName}` : 'Unclaimed'}
                          </td>
                          <td className="py-2.5 px-3 font-mono uppercase text-slate-300">
                            {t.status}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {t.status !== 'deleted' ? (
                              <button
                                type="button"
                                onClick={() => setActiveChannelId(t.channelId)}
                                className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              >
                                View Channel
                              </button>
                            ) : (
                              <span className="text-slate-500">Deleted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. Active Individual Ticket Channel View */}
          {currentTicket && (
            <div className="flex flex-col justify-between h-full space-y-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      <span>{currentTicket.channelName}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-xs font-mono text-slate-400">
                        {currentTicket.discordCategoryName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 pt-0.5">
                      Ticket #{currentTicket.ticketId} · Creator: @{currentTicket.creatorName} · Claimed By:{' '}
                      <span className="text-slate-200 font-medium">
                        {currentTicket.claimedByName ? `@${currentTicket.claimedByName}` : 'Unclaimed'}
                      </span>{' '}
                      · Status: <span className="font-mono uppercase text-slate-200">{currentTicket.status}</span>
                    </div>
                  </div>
                </div>

                {/* Ticket Initial Embed + Answers */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      Ticket #{currentTicket.ticketId} — {currentTicket.categoryLabel}
                    </h3>
                    <span className="text-xs font-mono text-slate-400">
                      Created {currentTicket.createdAt}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs border-y border-slate-800/80 py-2.5">
                    <div>
                      <span className="text-slate-400">Creator: </span>
                      <span className="text-slate-100 font-medium">@{currentTicket.creatorName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Claimed Moderator: </span>
                      <span className="text-indigo-300 font-medium">
                        {currentTicket.claimedByName ? `@${currentTicket.claimedByName}` : 'Unclaimed'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Permissions: </span>
                      <span className="text-slate-200">Creator + Staff Only</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(currentTicket.answers).map(([q, a]) => (
                      <div key={q} className="text-xs">
                        <div className="font-semibold text-slate-300">{q}</div>
                        <div className="text-slate-400 pt-0.5">{a}</div>
                      </div>
                    ))}
                  </div>

                  {/* Interactive Ticket Management Controls (Requirement 3.Ticket Management) */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleClaimTicket(currentTicket)}
                      disabled={Boolean(currentTicket.claimedById)}
                      className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      Claim Ticket
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnclaimTicket(currentTicket)}
                      disabled={!currentTicket.claimedById}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      Release Claim
                    </button>
                    {currentTicket.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => setClosingTicketId(currentTicket.ticketId)}
                        className="px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        Close Ticket
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReopenTicket(currentTicket)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reopen Ticket</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteTicketChannel(currentTicket)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-900/60 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Ticket</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRenameInput((v) => !v);
                        setRenameInput(currentTicket.channelName);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Rename Ticket</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTransferInput((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Transfer Ticket</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTranscriptModal(generateTicketTranscript(currentTicket))
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ticket Transcript</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
                        setTickets((prev) =>
                          prev.map((t) =>
                            t.ticketId === currentTicket.ticketId
                              ? {
                                  ...t,
                                  messages: [
                                    ...t.messages,
                                    {
                                      id: `tm-${Date.now()}`,
                                      authorId: 'bot',
                                      authorName: 'AegisBot',
                                      authorRole: 'Bot',
                                      content: 'Added @helper_member to this ticket channel.',
                                      timestamp: nowStr,
                                    },
                                  ],
                                }
                              : t
                          )
                        );
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
                        setTickets((prev) =>
                          prev.map((t) =>
                            t.ticketId === currentTicket.ticketId
                              ? {
                                  ...t,
                                  messages: [
                                    ...t.messages,
                                    {
                                      id: `tm-${Date.now()}`,
                                      authorId: 'bot',
                                      authorName: 'AegisBot',
                                      authorRole: 'Bot',
                                      content: 'Removed @helper_member from this ticket channel.',
                                      timestamp: nowStr,
                                    },
                                  ],
                                }
                              : t
                          )
                        );
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>Remove Member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBannerFeedback({
                          type: 'info',
                          text: `Pinged assigned staff roles (${ticketCategories[currentTicket.categoryKey].staffRoles.join(', ')}) for Ticket #${currentTicket.ticketId}.`,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Notify Staff</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBannerFeedback({
                          type: 'info',
                          text: `Ticket #${currentTicket.ticketId} Claim Audit Trail: ${
                            currentTicket.claimHistory.length === 0
                              ? 'No claims recorded yet'
                              : currentTicket.claimHistory
                                  .map((c) => `${c.action} by ${c.staffName} at ${c.timestamp}`)
                                  .join(' -> ')
                          }`,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Ticket Information</span>
                    </button>
                  </div>

                  {/* Inline Rename Box */}
                  {showRenameInput && (
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        aria-label="New ticket channel name"
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!renameInput.trim()) return;
                          setTickets((prev) =>
                            prev.map((t) =>
                              t.ticketId === currentTicket.ticketId
                                ? { ...t, channelName: renameInput.trim() }
                                : t
                            )
                          );
                          setShowRenameInput(false);
                        }}
                        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded"
                      >
                        Save Name
                      </button>
                    </div>
                  )}

                  {/* Inline Transfer Box */}
                  {showTransferInput && (
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        aria-label="Transfer to staff member"
                        value={transferStaffInput}
                        onChange={(e) => setTransferStaffInput(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!transferStaffInput.trim()) return;
                          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
                          setTickets((prev) =>
                            prev.map((t) =>
                              t.ticketId === currentTicket.ticketId
                                ? {
                                    ...t,
                                    claimedById: `staff-${transferStaffInput.trim()}`,
                                    claimedByName: transferStaffInput.trim(),
                                    claimHistory: [
                                      ...t.claimHistory,
                                      {
                                        staffId: `staff-${transferStaffInput.trim()}`,
                                        staffName: transferStaffInput.trim(),
                                        action: 'TRANSFERRED',
                                        timestamp: nowStr,
                                      },
                                    ],
                                  }
                                : t
                            )
                          );
                          setShowTransferInput(false);
                        }}
                        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded"
                      >
                        Confirm Transfer
                      </button>
                    </div>
                  )}
                </div>

                {/* Message History inside Ticket */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {currentTicket.messages.map((m) => (
                    <div key={m.id} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md text-xs">
                      <div className="flex items-center gap-2 text-slate-400 pb-1">
                        <span className="font-semibold text-slate-200">@{m.authorName}</span>
                        <span>·</span>
                        <span>{m.authorRole}</span>
                        <span>·</span>
                        <span className="font-mono">{m.timestamp}</span>
                      </div>
                      <div className="text-slate-300 leading-relaxed">{m.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Composer inside Ticket */}
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-3 border-t border-slate-800">
                <input
                  type="text"
                  aria-label="Message ticket channel"
                  disabled={currentTicket.status === 'closed'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    currentTicket.status === 'closed'
                      ? 'Ticket is closed. Reopen the ticket to send additional messages.'
                      : `Message #${currentTicket.channelName} as @${activePersona.name}...`
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={currentTicket.status === 'closed'}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {/* 3. #dm-receipts-inbox View (Verifies Dual DM Requirement on Ticket Close) */}
          {activeChannelId === 'ch-dm-inbox' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">
                  Direct Message (DM) Delivery Inspector — Creator & Moderator Receipts
                </h2>
                <p className="text-xs text-slate-400 pt-1">
                  When any ticket is closed, AegisBot sends two separate DMs with the full transcript: (1) to the Ticket Creator and (2) to the Claimed Moderator (or Closing Moderator if unclaimed).
                </p>
              </div>

              {dmInbox.length === 0 ? (
                <div className="p-8 text-center border border-slate-800 rounded-lg bg-slate-950/40 space-y-2">
                  <div className="text-sm font-medium text-slate-300">No Ticket Closing DMs Dispatched Yet</div>
                  <p className="text-xs text-slate-500">
                    Open a ticket in #ticket-panel, claim it as a Moderator, and click "Close Ticket" to inspect both DM payloads here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dmInbox.map((dm) => (
                    <div
                      key={dm.id}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-semibold text-indigo-300">
                          {dm.recipientType === 'CREATOR'
                            ? `DM to Ticket Creator (@${dm.recipientName})`
                            : `DM to Moderator (@${dm.recipientName})`}
                        </span>
                        <span className="font-mono text-slate-400">
                          {dm.delivered ? 'DELIVERED' : 'FAILED (DMs Disabled)'}
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-300">
                        <div><span className="text-slate-500">Ticket ID:</span> #{dm.ticketId}</div>
                        <div><span className="text-slate-500">Ticket Category:</span> {dm.categoryLabel}</div>
                        <div><span className="text-slate-500">Ticket Creator:</span> @{dm.creatorName}</div>
                        <div><span className="text-slate-500">Closing Moderator:</span> @{dm.closingModeratorName}</div>
                        <div><span className="text-slate-500">Closing Reason:</span> {dm.closeReason}</div>
                      </div>
                      {dm.failureWarning && (
                        <div className="p-2 bg-rose-950/50 border border-rose-800/70 rounded text-rose-200">
                          {dm.failureWarning}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTranscriptModal(dm.transcriptText)}
                        className="w-full py-1.5 px-3 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded"
                      >
                        Inspect Attached Transcript (`ticket-{dm.ticketId}-transcript.txt`)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. #transcripts Storage Channel View */}
          {activeChannelId === 'ch-transcripts' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">
                  #transcripts — Permanent Transcript Archive Channel
                </h2>
                <p className="text-xs text-slate-400 pt-1">
                  Every closed ticket automatically archives its transcript file and metadata here in addition to SQLite storage.
                </p>
              </div>
              {tickets.filter((t) => t.transcriptText).length === 0 ? (
                <div className="p-8 text-center border border-slate-800 rounded-lg bg-slate-950/40 text-xs text-slate-400">
                  No closed ticket transcripts archived yet. Close an open ticket to populate this channel.
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets
                    .filter((t) => t.transcriptText)
                    .map((t) => (
                      <div key={t.ticketId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">
                            Transcript — Ticket #{t.ticketId} ({t.categoryLabel})
                          </span>
                          <span className="font-mono text-slate-400">Closed at {t.closedAt}</span>
                        </div>
                        <div className="text-slate-400">
                          Creator: @{t.creatorName} · Claimed By: {t.claimedByName || 'Unclaimed'} · Closed By: @{t.closedByName} · Reason: "{t.closeReason}"
                        </div>
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48">
                          {t.transcriptText}
                        </pre>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 5. #mod-logs Channel View */}
          {activeChannelId === 'ch-mod-logs' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">
                  #mod-logs — SQLite Moderation Case Log (`/modlogs` & `/case`)
                </h2>
                <p className="text-xs text-slate-400 pt-1">
                  Records every `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/mute`, `/unmute`, `/lock`, and `/unlock` action.
                </p>
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                      <th className="py-2.5 px-3 font-medium">Case ID</th>
                      <th className="py-2.5 px-3 font-medium">Action</th>
                      <th className="py-2.5 px-3 font-medium">Target</th>
                      <th className="py-2.5 px-3 font-medium">Moderator</th>
                      <th className="py-2.5 px-3 font-medium">Reason</th>
                      <th className="py-2.5 px-3 font-medium">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {modCases.map((c) => (
                      <tr key={c.caseId} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300">#{c.caseId}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-indigo-300">{c.action}</td>
                        <td className="py-2.5 px-3 text-slate-200">{c.targetName}</td>
                        <td className="py-2.5 px-3 text-slate-300">@{c.moderatorName}</td>
                        <td className="py-2.5 px-3 text-slate-300">{c.reason}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{c.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. #general-chat or #ai-assistant View */}
          {(activeChannelId === 'ch-general' || activeChannelId === 'ch-ai') && (
            <div className="flex flex-col justify-between h-full space-y-4">
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      #{activeChannelId === 'ch-general' ? 'general-chat' : 'ai-assistant'}
                    </h2>
                    <p className="text-xs text-slate-400 pt-0.5">
                      {activeChannelId === 'ch-general'
                        ? 'Test Auto-Responder triggers, /purge filters, /snipe, and /editsnipe.'
                        : 'Zero-API-Cost Local Rule-Based Personal AI Assistant channel.'}
                    </p>
                  </div>
                  {activeChannelId === 'ch-general' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const found = snipeStore.find((s) => !s.isTicket && s.type === 'delete');
                          if (found) {
                            setBannerFeedback({
                              type: 'info',
                              text: `/snipe recovered message from @${found.authorName}: "${found.beforeContent}"`,
                            });
                          }
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                      >
                        Run /snipe
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const found = snipeStore.find((s) => !s.isTicket && s.type === 'edit');
                          if (found) {
                            setBannerFeedback({
                              type: 'info',
                              text: `/editsnipe recovered edit from @${found.authorName}: "${found.beforeContent}" -> "${found.afterContent}"`,
                            });
                          }
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                      >
                        Run /editsnipe
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {(channelMessages[activeChannelId] || []).map((m) => (
                    <div key={m.id} className="p-3 bg-slate-950 border border-slate-800 rounded-md text-xs flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="font-semibold text-slate-200">@{m.authorName}</span>
                          <span>·</span>
                          <span>{m.authorRole}</span>
                          <span>·</span>
                          <span className="font-mono">{m.timestamp}</span>
                        </div>
                        <div className="text-slate-300">{m.content}</div>
                      </div>
                      {activeChannelId === 'ch-general' && (
                        <button
                          type="button"
                          aria-label={`Delete message from ${m.authorName}`}
                          onClick={() => {
                            setSnipeStore((prev) => [
                              {
                                id: `sn-${Date.now()}`,
                                channelId: 'ch-general',
                                isTicket: false,
                                type: 'delete',
                                authorName: m.authorName,
                                beforeContent: m.content,
                                timestamp: m.timestamp,
                              },
                              ...prev,
                            ]);
                            setChannelMessages((prev) => ({
                              ...prev,
                              'ch-general': (prev['ch-general'] || []).filter((x) => x.id !== m.id),
                            }));
                          }}
                          className="text-slate-500 hover:text-rose-400 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-3 border-t border-slate-800">
                <input
                  type="text"
                  aria-label="Send message"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    activeChannelId === 'ch-ai'
                      ? 'Ask the local AI assistant about tickets, rules, or activity roles...'
                      : 'Send a message (or type "help" to trigger the Auto-Responder)...'
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Send Message
                </button>
              </form>
            </div>
          )}

          {/* 7. #music-stage View */}
          {activeChannelId === 'ch-music' && (
            <div className="space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">
                  #music-stage — Modular Voice Music System (`cogs/music.py`)
                </h2>
                <p className="text-xs text-slate-400 pt-1">
                  Interactive `MusicControlPanel` view supporting `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`, `/remove`, `/clearqueue`, and `/disconnect`.
                </p>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-indigo-400">
                      {musicState.paused ? 'PAUSED' : musicState.playing ? 'NOW PLAYING' : 'STOPPED'} · Volume: {musicState.volume}% · Loop: {musicState.loop ? 'ON' : 'OFF'}
                    </div>
                    <h3 className="text-base font-semibold text-white pt-1">
                      {musicState.current ? musicState.current.title : 'No active track'}
                    </h3>
                    {musicState.current && (
                      <div className="text-xs text-slate-400">
                        Requested by @{musicState.current.requestedBy}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMusicState((s) => ({ ...s, paused: !s.paused }))}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                    >
                      {musicState.paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMusicState((s) => {
                          const [next, ...rest] = s.queue;
                          return { ...s, current: next || null, queue: rest };
                        })
                      }
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicState((s) => ({ ...s, loop: !s.loop }))}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                    >
                      Toggle Loop
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicState((s) => ({ ...s, playing: false, current: null, queue: [] }))}
                      className="px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded"
                    >
                      Stop & Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-300">
                    Upcoming Queue ({musicState.queue.length})
                  </div>
                  {musicState.queue.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-900 rounded text-xs">
                      <span className="text-slate-200 font-mono">
                        {i + 1}. {item.title} <span className="text-slate-500">(by @{item.requestedBy})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMusicState((s) => ({
                            ...s,
                            queue: s.queue.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-slate-400 hover:text-rose-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Discord Questionnaire Modal for Creating a Ticket */}
      {activeModalCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="ticket-modal-title" className="text-base font-semibold text-white">
                Discord Modal — {ticketCategories[activeModalCategory].label}
              </h3>
              <button
                type="button"
                aria-label="Close ticket modal"
                onClick={() => setActiveModalCategory(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="space-y-4">
              {ticketCategories[activeModalCategory].questions.map((question) => (
                <div key={question} className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    {question}
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={modalAnswers[question] || ''}
                    onChange={(e) =>
                      setModalAnswers((prev) => ({ ...prev, [question]: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveModalCategory(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Submit Ticket Modal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Ticket Confirmation & Reason Modal */}
      {closingTicketId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-ticket-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
            <h3 id="close-ticket-modal-title" className="text-base font-semibold text-white">
              Close Ticket #{closingTicketId} & Dispatch Transcripts
            </h3>
            <p className="text-xs text-slate-400">
              Closing this ticket generates a full transcript, sends a DM to the Ticket Creator, sends a separate DM to the Claimed/Closing Moderator, and archives the transcript in #transcripts.
            </p>
            <form onSubmit={handleConfirmCloseTicket} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Closing Reason
                </label>
                <textarea
                  rows={3}
                  required
                  value={closeReasonInput}
                  onChange={(e) => setCloseReasonInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-md text-slate-100"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClosingTicketId(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-md"
                >
                  Confirm Close & Send DMs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transcript Viewer Modal */}
      {activeTranscriptModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ticket Transcript Preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white">Generated Ticket Transcript</h3>
              <button
                type="button"
                aria-label="Close transcript modal"
                onClick={() => setActiveTranscriptModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-slate-200 overflow-x-auto max-h-96">
              {activeTranscriptModal}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
