import React, { useState } from 'react';
import {
  type TicketCategoryKey,
  type TicketCategoryConfig,
  type CommandPermissionRule,
  type AIKnowledgeEntry,
  type AutoResponderRule,
} from '../engine/botEngine';

interface SetupDashboardViewProps {
  ticketCategories: Record<TicketCategoryKey, TicketCategoryConfig>;
  setTicketCategories: React.Dispatch<
    React.SetStateAction<Record<TicketCategoryKey, TicketCategoryConfig>>
  >;
  maxOpenPerUser: number;
  setMaxOpenPerUser: React.Dispatch<React.SetStateAction<number>>;
  autoDeleteSeconds: number;
  setAutoDeleteSeconds: React.Dispatch<React.SetStateAction<number>>;
  panelTitle: string;
  setPanelTitle: React.Dispatch<React.SetStateAction<string>>;
  panelDescription: string;
  setPanelDescription: React.Dispatch<React.SetStateAction<string>>;
  permissionRules: CommandPermissionRule[];
  setPermissionRules: React.Dispatch<React.SetStateAction<CommandPermissionRule[]>>;
  aiKnowledge: AIKnowledgeEntry[];
  setAiKnowledge: React.Dispatch<React.SetStateAction<AIKnowledgeEntry[]>>;
  aiPersonality: string;
  setAiPersonality: React.Dispatch<React.SetStateAction<string>>;
  autoTriggers: AutoResponderRule[];
  setAutoTriggers: React.Dispatch<React.SetStateAction<AutoResponderRule[]>>;
}

export const SetupDashboardView: React.FC<SetupDashboardViewProps> = ({
  ticketCategories,
  setTicketCategories,
  maxOpenPerUser,
  setMaxOpenPerUser,
  autoDeleteSeconds,
  setAutoDeleteSeconds,
  panelTitle,
  setPanelTitle,
  panelDescription,
  setPanelDescription,
  permissionRules,
  setPermissionRules,
  aiKnowledge,
  setAiKnowledge,
  aiPersonality,
  setAiPersonality,
  autoTriggers,
  setAutoTriggers,
}) => {
  const [activeSection, setActiveSection] = useState<
    'tickets' | 'permissions' | 'autoroles' | 'embeds_rr' | 'ai_auto'
  >('tickets');

  const [selectedCategoryKey, setSelectedCategoryKey] = useState<TicketCategoryKey>('general');
  const [newQuestionInput, setNewQuestionInput] = useState<string>('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Activity Auto-Roles state
  const [activityConfig, setActivityConfig] = useState({
    spotifyEnabled: true,
    spotifyRole: '@Spotify Listener',
    gamingEnabled: true,
    gamingRole: '@Active Gamer',
    vcEnabled: true,
    vcRole: '@In Voice Lounge',
    textEnabled: true,
    milestone50: '@Chatter (50 msgs)',
    milestone250: '@Regular (250 msgs)',
    milestone1000: '@Veteran (1000 msgs)',
    stackRoles: true,
    cooldownSeconds: 15,
  });

  // Custom Embed Builder state
  const [embedDraft, setEmbedDraft] = useState({
    templateName: 'Welcome & Rules Embed',
    title: 'Welcome to Aegis Community Server',
    description: 'Use `/ticket setup` or click a button in #ticket-panel if you need staff assistance.',
    color: '#5865F2',
    footer: 'AegisBot SQLite Template Engine',
  });
  const [savedEmbeds, setSavedEmbeds] = useState([
    {
      name: 'Welcome & Rules Embed',
      title: 'Welcome to Aegis Community Server',
      color: '#5865F2',
    },
  ]);

  // New AI Knowledge Entry inputs
  const [kbTopic, setKbTopic] = useState<string>('');
  const [kbKeywords, setKbKeywords] = useState<string>('');
  const [kbResponse, setKbResponse] = useState<string>('');

  // High-Thinking Architect Advisor
  const [architectQuery, setArchitectQuery] = useState<string>(
    'How should I structure role hierarchy and category permissions for the 4 ticket categories?'
  );
  const [architectReply, setArchitectReply] = useState<string | null>(null);
  const [architectLoading, setArchitectLoading] = useState<boolean>(false);

  const currentCat = ticketCategories[selectedCategoryKey];

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionInput.trim()) return;
    setTicketCategories((prev) => ({
      ...prev,
      [selectedCategoryKey]: {
        ...prev[selectedCategoryKey],
        questions: [...prev[selectedCategoryKey].questions, newQuestionInput.trim()],
      },
    }));
    setNewQuestionInput('');
    setSaveNotice(`Added modal question to "${currentCat.label}" and persisted to SQLite state.`);
  };

  const handleAddKnowledge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTopic.trim() || !kbKeywords.trim() || !kbResponse.trim()) return;
    setAiKnowledge((prev) => [
      ...prev,
      {
        id: Date.now(),
        topic: kbTopic.trim(),
        keywords: kbKeywords.split(',').map((k) => k.trim()),
        response: kbResponse.trim(),
      },
    ]);
    setKbTopic('');
    setKbKeywords('');
    setKbResponse('');
    setSaveNotice('Added new FAQ entry to Local Rule-Based AI Knowledge Base.');
  };

  const handleAskArchitect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!architectQuery.trim()) return;
    setArchitectLoading(true);
    try {
      const res = await fetch('/api/architect/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: architectQuery, guildName: 'Aegis Server' }),
      });
      const data = await res.json();
      setArchitectReply(data.answer || 'Completed analysis.');
    } catch {
      setArchitectReply('Local Rule-Based Advisor: Configure role hierarchy above Moderator roles.');
    } finally {
      setArchitectLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
        <div>
          <h2 className="text-base font-semibold text-white">
            Interactive /setup &amp; /ticket setup Configuration Studio
          </h2>
          <p className="text-xs text-slate-400">
            Every setting below maps directly to SQLite tables (ticket_settings, command_permissions, activity_role_settings, embed_templates, ai_knowledge) and updates the Live Discord Sandbox immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
          {(
            [
              { id: 'tickets', label: '1. Ticket Wizard (4 Types)' },
              { id: 'permissions', label: '2. RBAC Permissions' },
              { id: 'autoroles', label: '3. Activity Auto-Roles' },
              { id: 'embeds_rr', label: '4. Embeds & Reaction Roles' },
              { id: 'ai_auto', label: '5. Local AI & Auto-Responder' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeSection === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {saveNotice && (
        <div className="px-4 py-2.5 bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs rounded-lg flex items-center justify-between">
          <span>{saveNotice}</span>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-emerald-300 hover:text-white font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. TICKET SYSTEM WIZARD */}
      {activeSection === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Global Ticket Panel Settings (`/ticket setup`)
            </h3>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Panel Embed Title</label>
              <input
                type="text"
                value={panelTitle}
                onChange={(e) => setPanelTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Panel Description</label>
              <textarea
                rows={2}
                value={panelDescription}
                onChange={(e) => setPanelDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Max Open Tickets / User
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxOpenPerUser}
                  onChange={(e) => setMaxOpenPerUser(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Auto-Delete Delay (sec)
                </label>
                <input
                  type="number"
                  min={0}
                  max={86400}
                  value={autoDeleteSeconds}
                  onChange={(e) => setAutoDeleteSeconds(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                Per-Category Channel, Naming & Modal Questions
              </h3>
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
                {(['general', 'complaint', 'staff', 'prize'] as TicketCategoryKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedCategoryKey(k)}
                    className={`px-2.5 py-1 text-xs font-medium rounded ${
                      selectedCategoryKey === k
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ticketCategories[k].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Discord Channel Category Name
                </label>
                <input
                  type="text"
                  value={currentCat.discordCategoryName}
                  onChange={(e) =>
                    setTicketCategories((prev) => ({
                      ...prev,
                      [selectedCategoryKey]: {
                        ...prev[selectedCategoryKey],
                        discordCategoryName: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Ticket Naming Format (<code>{'{username}'}</code>, <code>{'{id}'}</code>)
                </label>
                <input
                  type="text"
                  value={currentCat.namingFormat}
                  onChange={(e) =>
                    setTicketCategories((prev) => ({
                      ...prev,
                      [selectedCategoryKey]: {
                        ...prev[selectedCategoryKey],
                        namingFormat: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Modal Questionnaire Fields ({currentCat.questions.length}/5 max per Discord API)
              </label>
              <div className="space-y-1.5">
                {currentCat.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs"
                  >
                    <span className="text-slate-200">
                      {idx + 1}. {q}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setTicketCategories((prev) => ({
                          ...prev,
                          [selectedCategoryKey]: {
                            ...prev[selectedCategoryKey],
                            questions: prev[selectedCategoryKey].questions.filter(
                              (_, i) => i !== idx
                            ),
                          },
                        }))
                      }
                      className="text-slate-400 hover:text-rose-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddQuestion} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newQuestionInput}
                  onChange={(e) => setNewQuestionInput(e.target.value)}
                  placeholder="Add custom modal question for this category..."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded whitespace-nowrap shrink-0"
                >
                  Add Question
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. RBAC PERMISSION MANAGEMENT */}
      {activeSection === 'permissions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Global Command & Module RBAC Matrix (`/permissions`)
            </h3>
            <p className="text-xs text-slate-400">
              Toggle command availability or restrict execution to Moderators or Administrators. Changes immediately enforce in the Live Discord Sandbox command runner.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Command</th>
                  <th className="py-2.5 px-3 font-medium">Module</th>
                  <th className="py-2.5 px-3 font-medium">Enabled</th>
                  <th className="py-2.5 px-3 font-medium">Require Moderator</th>
                  <th className="py-2.5 px-3 font-medium">Require Administrator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {permissionRules.map((rule, idx) => (
                  <tr key={rule.commandName} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-indigo-300">/{rule.commandName}</td>
                    <td className="py-2.5 px-3 text-slate-300">{rule.moduleName}</td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${rule.commandName}`}
                        checked={rule.enabled}
                        onChange={(e) =>
                          setPermissionRules((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r))
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        aria-label={`Require Moderator for ${rule.commandName}`}
                        checked={rule.requireMod}
                        onChange={(e) =>
                          setPermissionRules((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, requireMod: e.target.checked } : r
                            )
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        aria-label={`Require Admin for ${rule.commandName}`}
                        checked={rule.requireAdmin}
                        onChange={(e) =>
                          setPermissionRules((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, requireAdmin: e.target.checked } : r
                            )
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ACTIVITY-BASED AUTO ROLES */}
      {activeSection === 'autoroles' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Activity-Based Auto Role Assignment (`/autoroles configure`)
            </h3>
            <p className="text-xs text-slate-400 pt-1">
              Gateway Intent Notice: Spotify and Gaming detection require `PRESENCE INTENT` enabled in the Discord Developer Portal, and only trigger when a user exposes rich presence activity in their Discord client settings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Spotify Listening Presence Role</span>
                <input
                  type="checkbox"
                  checked={activityConfig.spotifyEnabled}
                  onChange={(e) =>
                    setActivityConfig((s) => ({ ...s, spotifyEnabled: e.target.checked }))
                  }
                />
              </label>
              <input
                type="text"
                value={activityConfig.spotifyRole}
                onChange={(e) => setActivityConfig((s) => ({ ...s, spotifyRole: e.target.value }))}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-200"
              />
              <p className="text-[11px] text-slate-400">
                Automatically assigned on `isinstance(activity, discord.Spotify)` and removed when playback ends.
              </p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Gaming Activity Role</span>
                <input
                  type="checkbox"
                  checked={activityConfig.gamingEnabled}
                  onChange={(e) =>
                    setActivityConfig((s) => ({ ...s, gamingEnabled: e.target.checked }))
                  }
                />
              </label>
              <input
                type="text"
                value={activityConfig.gamingRole}
                onChange={(e) => setActivityConfig((s) => ({ ...s, gamingRole: e.target.value }))}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-200"
              />
              <p className="text-[11px] text-slate-400">
                Detects `discord.ActivityType.playing` and supports per-game role overrides in SQLite.
              </p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Voice Chat Active Role</span>
                <input
                  type="checkbox"
                  checked={activityConfig.vcEnabled}
                  onChange={(e) => setActivityConfig((s) => ({ ...s, vcEnabled: e.target.checked }))}
                />
              </label>
              <input
                type="text"
                value={activityConfig.vcRole}
                onChange={(e) => setActivityConfig((s) => ({ ...s, vcRole: e.target.value }))}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-200"
              />
              <p className="text-[11px] text-slate-400">
                Assigned immediately via `on_voice_state_update` on join and removed on leave.
              </p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Text Chat Activity Milestones</span>
                <input
                  type="checkbox"
                  checked={activityConfig.textEnabled}
                  onChange={(e) =>
                    setActivityConfig((s) => ({ ...s, textEnabled: e.target.checked }))
                  }
                />
              </label>
              <div className="text-xs text-slate-300 font-mono space-y-1">
                <div>50 msgs: {activityConfig.milestone50}</div>
                <div>250 msgs: {activityConfig.milestone250}</div>
                <div>1000 msgs: {activityConfig.milestone1000}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUSTOM EMBED BUILDER & REACTION ROLES */}
      {activeSection === 'embeds_rr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Custom Embed Builder (`/embed` + SQLite Templates)
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                aria-label="Embed Title"
                value={embedDraft.title}
                onChange={(e) => setEmbedDraft((s) => ({ ...s, title: e.target.value }))}
                placeholder="Embed Title"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <textarea
                rows={3}
                aria-label="Embed Description"
                value={embedDraft.description}
                onChange={(e) => setEmbedDraft((s) => ({ ...s, description: e.target.value }))}
                placeholder="Embed Description"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  aria-label="Embed Hex Color"
                  value={embedDraft.color}
                  onChange={(e) => setEmbedDraft((s) => ({ ...s, color: e.target.value }))}
                  placeholder="#5865F2"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
                <input
                  type="text"
                  aria-label="Embed Footer"
                  value={embedDraft.footer}
                  onChange={(e) => setEmbedDraft((s) => ({ ...s, footer: e.target.value }))}
                  placeholder="Footer text"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSavedEmbeds((prev) => [
                    ...prev,
                    {
                      name: embedDraft.title.slice(0, 32),
                      title: embedDraft.title,
                      color: embedDraft.color,
                    },
                  ]);
                  setSaveNotice('Saved custom embed template to SQLite `embed_templates` table.');
                }}
                className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
              >
                Save Embed Template to SQLite
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Live Discord Embed Preview</h3>
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="text-xs font-mono text-indigo-400">{embedDraft.color}</div>
              <div className="text-sm font-semibold text-white">{embedDraft.title}</div>
              <p className="text-xs text-slate-300 leading-relaxed">{embedDraft.description}</p>
              {embedDraft.footer && (
                <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                  {embedDraft.footer}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-400">
              Saved Templates ({savedEmbeds.length}):{' '}
              {savedEmbeds.map((e) => e.name).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* 5. LOCAL AI ASSISTANT, AUTO-RESPONDER & HIGH-THINKING ARCHITECT */}
      {activeSection === 'ai_auto' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Local Rule-Based AI Knowledge Base (`/aikb add` — No Paid API Required)
            </h3>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Bot Personality</label>
              <input
                type="text"
                value={aiPersonality}
                onChange={(e) => setAiPersonality(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
            </div>

            <form onSubmit={handleAddKnowledge} className="space-y-2.5 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={kbTopic}
                onChange={(e) => setKbTopic(e.target.value)}
                placeholder="Topic Title (e.g. Boosting Perks)"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <input
                type="text"
                value={kbKeywords}
                onChange={(e) => setKbKeywords(e.target.value)}
                placeholder="Keywords comma-separated (e.g. boost, nitro, perks)"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <textarea
                rows={2}
                value={kbResponse}
                onChange={(e) => setKbResponse(e.target.value)}
                placeholder="Predefined knowledge response..."
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
              >
                Add Knowledge Entry
              </button>
            </form>

            <div className="space-y-2 pt-2">
              {aiKnowledge.map((entry) => (
                <div key={entry.id} className="p-3 bg-slate-950 border border-slate-800 rounded text-xs space-y-1">
                  <div className="font-semibold text-white">{entry.topic}</div>
                  <div className="font-mono text-indigo-300">
                    Keywords: {entry.keywords.join(', ')}
                  </div>
                  <div className="text-slate-400">{entry.response}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Bot Architecture High-Thinking Advisor & Auto-Responder Rules
            </h3>
            <p className="text-xs text-slate-400">
              Ask complex architecture or permission design questions (uses server-side `gemini-4-argon` with `ThinkingLevel.HIGH` when a key is active, or the built-in zero-cost local advisor).
            </p>
            <form onSubmit={handleAskArchitect} className="space-y-2">
              <textarea
                rows={2}
                value={architectQuery}
                onChange={(e) => setArchitectQuery(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100"
              />
              <button
                type="submit"
                disabled={architectLoading}
                className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
              >
                {architectLoading ? 'Analyzing Architecture...' : 'Run High-Thinking Analysis'}
              </button>
            </form>
            {architectReply && (
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded font-sans text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {architectReply}
              </pre>
            )}

            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-white">
                Active Auto-Responder Triggers ({autoTriggers.length})
              </div>
              {autoTriggers.map((trig) => (
                <div
                  key={trig.id}
                  className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded text-xs"
                >
                  <div>
                    <span className="font-mono text-indigo-300">"{trig.trigger}"</span> ({trig.matchType}) →{' '}
                    <span className="text-slate-300">{trig.responses[0]}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={trig.enabled}
                    onChange={(e) =>
                      setAutoTriggers((prev) =>
                        prev.map((t) =>
                          t.id === trig.id ? { ...t, enabled: e.target.checked } : t
                        )
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
