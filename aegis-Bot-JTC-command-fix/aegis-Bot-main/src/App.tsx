import React, { useEffect, useState } from 'react';
import {
  DEFAULT_TICKET_CATEGORIES,
  type TicketCategoryKey,
  type TicketCategoryConfig,
  type TicketRecord,
  type DirectMessageDelivery,
  type ModCase,
  type CommandPermissionRule,
  type AIKnowledgeEntry,
  type AutoResponderRule,
} from './engine/botEngine';
import { LiveDiscordSandbox } from './components/LiveDiscordSandbox';
import { SetupDashboardView } from './components/SetupDashboardView';
import { PythonCodeExplorer, type BotFileEntry } from './components/PythonCodeExplorer';
import { DeploymentAndGuides } from './components/DeploymentAndGuides';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'sandbox' | 'setup' | 'database' | 'codebase' | 'guides'
  >('sandbox');

  const [botFiles, setBotFiles] = useState<BotFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(true);

  // Persistent Bot Configuration State (mirrors SQLite tables)
  const [ticketCategories, setTicketCategories] = useState<
    Record<TicketCategoryKey, TicketCategoryConfig>
  >(DEFAULT_TICKET_CATEGORIES);
  const [maxOpenPerUser, setMaxOpenPerUser] = useState<number>(2);
  const [autoDeleteSeconds, setAutoDeleteSeconds] = useState<number>(300);
  const [panelTitle, setPanelTitle] = useState<string>('Aegis Server Support & Applications');
  const [panelDescription, setPanelDescription] = useState<string>(
    'Select one of the four ticket categories below to open an isolated private ticket channel with our staff team.'
  );

  const [tickets, setTickets] = useState<TicketRecord[]>([
    {
      ticketId: 100,
      channelId: 'ch-ticket-100',
      channelName: 'general-sarahdev',
      discordCategoryName: 'SUPPORT TICKETS',
      categoryKey: 'general',
      categoryLabel: 'General Help',
      creatorId: 'u-sarah',
      creatorName: 'sarah_dev',
      creatorDmsEnabled: true,
      claimedById: 'mod-kira',
      claimedByName: 'ModKira',
      claimedByDmsEnabled: true,
      status: 'open',
      answers: {
        'What do you need help with?': 'Spotify Auto-Role question',
        'Describe your issue.': 'Does the Spotify role automatically remove when I pause playback?',
      },
      messages: [
        {
          id: 'init-100',
          authorId: 'bot',
          authorName: 'AegisBot',
          authorRole: 'Bot',
          content:
            'Ticket #100 created for @sarah_dev. Claimed by @ModKira.',
          timestamp: '01:05 UTC',
        },
      ],
      claimHistory: [
        {
          staffId: 'mod-kira',
          staffName: 'ModKira',
          action: 'CLAIMED',
          timestamp: '01:06 UTC',
        },
      ],
      createdAt: '01:05 UTC',
    },
  ]);

  const [dmInbox, setDmInbox] = useState<DirectMessageDelivery[]>([]);

  const [modCases, setModCases] = useState<ModCase[]>([
    {
      caseId: 1,
      action: 'WARN',
      targetId: 'u-spam',
      targetName: '@promo_user',
      moderatorId: 'mod-kira',
      moderatorName: 'ModKira',
      reason: 'Posting unsolicited promotional links in #general-chat',
      active: true,
      timestamp: '01:15 UTC',
    },
  ]);

  const [permissionRules, setPermissionRules] = useState<CommandPermissionRule[]>([
    {
      commandName: 'ban',
      moduleName: 'Moderation',
      enabled: true,
      requireAdmin: false,
      requireMod: true,
      allowedRoles: ['Moderator', 'Admin'],
      allowedUsers: [],
    },
    {
      commandName: 'kick',
      moduleName: 'Moderation',
      enabled: true,
      requireAdmin: false,
      requireMod: true,
      allowedRoles: ['Moderator', 'Admin'],
      allowedUsers: [],
    },
    {
      commandName: 'warn',
      moduleName: 'Moderation',
      enabled: true,
      requireAdmin: false,
      requireMod: true,
      allowedRoles: ['Moderator', 'Admin'],
      allowedUsers: [],
    },
    {
      commandName: 'purge',
      moduleName: 'Purge System',
      enabled: true,
      requireAdmin: false,
      requireMod: true,
      allowedRoles: ['Moderator', 'Admin'],
      allowedUsers: [],
    },
    {
      commandName: 'snipe',
      moduleName: 'Snipe System',
      enabled: true,
      requireAdmin: false,
      requireMod: true,
      allowedRoles: ['Moderator', 'Admin'],
      allowedUsers: [],
    },
    {
      commandName: 'setup',
      moduleName: 'Setup Wizard',
      enabled: true,
      requireAdmin: true,
      requireMod: false,
      allowedRoles: ['Administrator'],
      allowedUsers: [],
    },
  ]);

  const [aiPersonality, setAiPersonality] = useState<string>(
    'Helpful, concise server assistant.'
  );
  const [aiKnowledge, setAiKnowledge] = useState<AIKnowledgeEntry[]>([
    {
      id: 1,
      topic: 'Opening a Support Ticket (4 Categories)',
      keywords: ['ticket', 'help', 'complaint', 'staff', 'prize', 'support'],
      response:
        'Head to #ticket-panel and select General Help, File a Complaint, Apply for a Staff Role, or Claim Winning Prize to open a private channel.',
    },
    {
      id: 2,
      topic: 'Activity Auto-Roles (Spotify, Gaming, Voice, Text)',
      keywords: ['spotify', 'gaming', 'voice', 'role', 'activity', 'milestone'],
      response:
        'AegisBot automatically assigns roles when you listen to Spotify, play games, join voice channels, or hit 50 / 250 / 1000 messages.',
    },
    {
      id: 3,
      topic: 'Appeals & Moderation Policy',
      keywords: ['ban', 'warn', 'timeout', 'mute', 'appeal', 'rules'],
      response:
        'All moderation actions are logged with a Case ID. Open a File a Complaint ticket with your Case ID to appeal.',
    },
  ]);

  const [autoTriggers, setAutoTriggers] = useState<AutoResponderRule[]>([
    {
      id: 1,
      trigger: 'help',
      matchType: 'contains',
      caseSensitive: false,
      responses: [
        'Need assistance? Open a ticket in #ticket-panel or ask `/ai <your question>`!',
      ],
      useEmbed: false,
      mentionUser: true,
      cooldownSeconds: 5,
      enabled: true,
    },
  ]);

  useEffect(() => {
    fetch('/api/bot-files')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setBotFiles(data.files);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFiles(false));
  }, []);

  const handleDownloadFullBundle = () => {
    const bundleContent = botFiles
      .map(
        (f) =>
          `# ====================================================================\n` +
          `# FILE: bot/${f.path}\n` +
          `# DESCRIPTION: ${f.description}\n` +
          `# ====================================================================\n\n` +
          `${f.content}\n\n`
      )
      .join('\n');

    const blob = new Blob([bundleContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aegisbot-complete-railway-source.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract (frontend-design §2) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('sandbox');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          AegisBot Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav aria-label="Main Navigation" className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'sandbox'
                ? 'text-white border-indigo-500'
                : 'border-transparent'
            }`}
          >
            Live Sandbox
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('setup')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'setup'
                ? 'text-white border-indigo-500'
                : 'border-transparent'
            }`}
          >
            Setup Wizard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'database'
                ? 'text-white border-indigo-500'
                : 'border-transparent'
            }`}
          >
            SQLite Inspector
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('codebase')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'codebase'
                ? 'text-white border-indigo-500'
                : 'border-transparent'
            }`}
          >
            Python Codebase
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guides')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'guides'
                ? 'text-white border-indigo-500'
                : 'border-transparent'
            }`}
          >
            Deployment Guides
          </button>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadFullBundle}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0"
          >
            Download Bot Bundle
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Clean Contextual Summary Bar (Unboxed metadata with · separators) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight font-display">
              All-in-One Modular Discord Bot — discord.py 2.x &amp; aiosqlite
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 pt-1">
              <span>10 Modular Cogs</span>
              <span aria-hidden="true">·</span>
              <span>4-Category Ticket System with Dual DM Transcripts</span>
              <span aria-hidden="true">·</span>
              <span>Server-Side RBAC & SQLite WAL Persistence</span>
              <span aria-hidden="true">·</span>
              <span>Railway Ready</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono tabular-nums">
            <span>Open Tickets: {tickets.filter((t) => t.status === 'open').length}</span>
            <span aria-hidden="true">·</span>
            <span>DMs Dispatched: {dmInbox.length}</span>
            <span aria-hidden="true">·</span>
            <span>Mod Cases: {modCases.length}</span>
            <span aria-hidden="true">·</span>
            <span>Source Files: {botFiles.length}</span>
          </div>
        </div>

        {/* Active View Render */}
        {activeTab === 'sandbox' && (
          <LiveDiscordSandbox
            ticketCategories={ticketCategories}
            maxOpenPerUser={maxOpenPerUser}
            autoDeleteSeconds={autoDeleteSeconds}
            panelTitle={panelTitle}
            panelDescription={panelDescription}
            tickets={tickets}
            setTickets={setTickets}
            dmInbox={dmInbox}
            setDmInbox={setDmInbox}
            modCases={modCases}
            setModCases={setModCases}
            permissionRules={permissionRules}
            aiKnowledge={aiKnowledge}
            aiPersonality={aiPersonality}
            autoTriggers={autoTriggers}
          />
        )}

        {activeTab === 'setup' && (
          <SetupDashboardView
            ticketCategories={ticketCategories}
            setTicketCategories={setTicketCategories}
            maxOpenPerUser={maxOpenPerUser}
            setMaxOpenPerUser={setMaxOpenPerUser}
            autoDeleteSeconds={autoDeleteSeconds}
            setAutoDeleteSeconds={setAutoDeleteSeconds}
            panelTitle={panelTitle}
            setPanelTitle={setPanelTitle}
            panelDescription={panelDescription}
            setPanelDescription={setPanelDescription}
            permissionRules={permissionRules}
            setPermissionRules={setPermissionRules}
            aiKnowledge={aiKnowledge}
            setAiKnowledge={setAiKnowledge}
            aiPersonality={aiPersonality}
            setAiPersonality={setAiPersonality}
            autoTriggers={autoTriggers}
            setAutoTriggers={setAutoTriggers}
          />
        )}

        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Live SQLite (`aiosqlite` WAL Mode) Database Tables Inspector
                  </h2>
                  <p className="text-xs text-slate-400">
                    Inspect the live rows stored in `tickets`, `ticket_claims`, `mod_cases`, `command_permissions`, and `ai_knowledge`.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="text-xs font-mono font-semibold text-indigo-300">
                    TABLE: tickets ({tickets.length} rows)
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60">
                    {JSON.stringify(
                      tickets.map((t) => ({
                        ticket_id: t.ticketId,
                        channel_name: t.channelName,
                        category_key: t.categoryKey,
                        creator_name: t.creatorName,
                        claimed_by: t.claimedByName,
                        status: t.status,
                        close_reason: t.closeReason || null,
                      })),
                      null,
                      2
                    )}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="text-xs font-mono font-semibold text-indigo-300">
                    TABLE: mod_cases ({modCases.length} rows)
                  </div>
                  <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60">
                    {JSON.stringify(modCases, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'codebase' && (
          <PythonCodeExplorer files={botFiles} loading={loadingFiles} />
        )}

        {activeTab === 'guides' && <DeploymentAndGuides />}
      </main>
    </div>
  );
}
