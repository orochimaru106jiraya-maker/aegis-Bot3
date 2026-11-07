export type TicketCategoryKey = 'general' | 'complaint' | 'staff' | 'prize';

export interface TicketCategoryConfig {
  key: TicketCategoryKey;
  label: string;
  discordCategoryName: string;
  namingFormat: string;
  staffRoles: string[];
  questions: string[];
}

export interface TicketClaimEvent {
  staffId: string;
  staffName: string;
  action: 'CLAIMED' | 'UNCLAIMED' | 'TRANSFERRED';
  timestamp: string;
}

export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'Member' | 'Moderator' | 'Admin' | 'Bot';
  content: string;
  timestamp: string;
  attachments?: string[];
  editedFrom?: string;
}

export interface TicketRecord {
  ticketId: number;
  channelId: string;
  channelName: string;
  discordCategoryName: string;
  categoryKey: TicketCategoryKey;
  categoryLabel: string;
  creatorId: string;
  creatorName: string;
  creatorDmsEnabled: boolean;
  claimedById: string | null;
  claimedByName: string | null;
  claimedByDmsEnabled: boolean;
  status: 'open' | 'closed' | 'deleted';
  answers: Record<string, string>;
  messages: TicketMessage[];
  claimHistory: TicketClaimEvent[];
  closedById?: string;
  closedByName?: string;
  closeReason?: string;
  transcriptText?: string;
  createdAt: string;
  closedAt?: string;
}

export interface DirectMessageDelivery {
  id: string;
  recipientType: 'CREATOR' | 'MODERATOR';
  recipientId: string;
  recipientName: string;
  ticketId: number;
  categoryLabel: string;
  creatorName: string;
  closingModeratorName: string;
  claimedModeratorName: string;
  closeReason: string;
  transcriptText: string;
  delivered: boolean;
  failureWarning?: string;
  timestamp: string;
}

export interface ModCase {
  caseId: number;
  action: string;
  targetId: string;
  targetName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  active: boolean;
  timestamp: string;
}

export interface CommandPermissionRule {
  commandName: string;
  moduleName: string;
  enabled: boolean;
  requireAdmin: boolean;
  requireMod: boolean;
  allowedRoles: string[];
  allowedUsers: string[];
}

export interface AIKnowledgeEntry {
  id: number;
  topic: string;
  keywords: string[];
  response: string;
}

export interface AutoResponderRule {
  id: number;
  trigger: string;
  matchType: 'exact' | 'contains';
  caseSensitive: boolean;
  responses: string[];
  useEmbed: boolean;
  mentionUser: boolean;
  cooldownSeconds: number;
  enabled: boolean;
}

export const DEFAULT_TICKET_CATEGORIES: Record<TicketCategoryKey, TicketCategoryConfig> = {
  general: {
    key: 'general',
    label: 'General Help',
    discordCategoryName: 'SUPPORT TICKETS',
    namingFormat: 'general-{username}',
    staffRoles: ['Moderator', 'Support Staff'],
    questions: [
      'What do you need help with?',
      'Describe your issue.',
    ],
  },
  complaint: {
    key: 'complaint',
    label: 'File a Complaint',
    discordCategoryName: 'MEMBER COMPLAINTS',
    namingFormat: 'complaint-{username}',
    staffRoles: ['Senior Moderator', 'Admin'],
    questions: [
      'Who or what are you reporting?',
      'Describe the complaint.',
      'Provide supporting evidence if available.',
    ],
  },
  staff: {
    key: 'staff',
    label: 'Apply for a Staff Role',
    discordCategoryName: 'STAFF APPLICATIONS',
    namingFormat: 'staff-{username}',
    staffRoles: ['Recruitment Manager', 'Admin'],
    questions: [
      'Which position are you applying for?',
      'Why should we select you?',
      'Describe your experience.',
    ],
  },
  prize: {
    key: 'prize',
    label: 'Claim Winning Prize',
    discordCategoryName: 'PRIZE & GIVEAWAY CLAIMS',
    namingFormat: 'prize-{username}',
    staffRoles: ['Event Coordinator', 'Admin'],
    questions: [
      'What event or giveaway did you win?',
      'Provide proof of winning.',
      'What is your Discord username?',
    ],
  },
};

export function formatTicketChannelName(
  namingFormat: string,
  username: string,
  ticketId: number
): string {
  const cleanUser = username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24) || 'member';
  return namingFormat
    .replace('{username}', cleanUser)
    .replace('{id}', String(ticketId));
}

export function validateTicketCreation(
  existingTickets: TicketRecord[],
  creatorId: string,
  categoryKey: TicketCategoryKey,
  maxOpenPerUser: number
): { allowed: boolean; error?: string } {
  const userOpen = existingTickets.filter(
    (t) => t.creatorId === creatorId && t.status === 'open'
  );
  if (userOpen.length >= maxOpenPerUser) {
    return {
      allowed: false,
      error: `Maximum open ticket limit reached (${userOpen.length}/${maxOpenPerUser} open tickets). Please close an existing ticket first.`,
    };
  }
  const duplicate = userOpen.find((t) => t.categoryKey === categoryKey);
  if (duplicate) {
    return {
      allowed: false,
      error: `Duplicate ticket prevented: You already have an open "${duplicate.categoryLabel}" ticket in #${duplicate.channelName}.`,
    };
  }
  return { allowed: true };
}

export function generateTicketTranscript(ticket: TicketRecord): string {
  const lines: string[] = [
    '====================================================================',
    `AEGISBOT TICKET TRANSCRIPT — TICKET #${ticket.ticketId}`,
    `Channel: #${ticket.channelName} (${ticket.discordCategoryName})`,
    `Category: ${ticket.categoryLabel} (${ticket.categoryKey})`,
    `Creator: ${ticket.creatorName} (${ticket.creatorId})`,
    `Claimed By: ${ticket.claimedByName ?? 'Unclaimed'}`,
    `Created At: ${ticket.createdAt}`,
    '====================================================================',
    '',
    '--- QUESTIONNAIRE SUBMISSION ---',
  ];
  for (const [question, answer] of Object.entries(ticket.answers)) {
    lines.push(`Q: ${question}`);
    lines.push(`A: ${answer}`);
    lines.push('');
  }
  lines.push('--- CONVERSATION LOG ---');
  for (const msg of ticket.messages) {
    const attachNote =
      msg.attachments && msg.attachments.length > 0
        ? ` [Attachments: ${msg.attachments.join(', ')}]`
        : '';
    lines.push(`[${msg.timestamp}] ${msg.authorName} (${msg.authorRole}): ${msg.content}${attachNote}`);
  }
  return lines.join('\n');
}

export function processTicketClose(params: {
  ticket: TicketRecord;
  closingModeratorId: string;
  closingModeratorName: string;
  closingModeratorDmsEnabled?: boolean;
  reason: string;
  timestamp: string;
}): {
  updatedTicket: TicketRecord;
  creatorDm: DirectMessageDelivery;
  moderatorDm: DirectMessageDelivery;
  dmWarnings: string[];
} {
  const {
    ticket,
    closingModeratorId,
    closingModeratorName,
    closingModeratorDmsEnabled = true,
    reason,
    timestamp,
  } = params;

  const transcriptText = generateTicketTranscript(ticket);
  const updatedTicket: TicketRecord = {
    ...ticket,
    status: 'closed',
    closedById: closingModeratorId,
    closedByName: closingModeratorName,
    closeReason: reason,
    transcriptText,
    closedAt: timestamp,
  };

  const dmWarnings: string[] = [];

  // 1. Creator DM
  const creatorDelivered = ticket.creatorDmsEnabled;
  const creatorWarning = creatorDelivered
    ? undefined
    : `Failed to send DM to ticket creator ${ticket.creatorName}: User has Direct Messages disabled.`;
  if (creatorWarning) {
    dmWarnings.push(creatorWarning);
  }

  const creatorDm: DirectMessageDelivery = {
    id: `dm-creator-${ticket.ticketId}-${Date.now()}`,
    recipientType: 'CREATOR',
    recipientId: ticket.creatorId,
    recipientName: ticket.creatorName,
    ticketId: ticket.ticketId,
    categoryLabel: ticket.categoryLabel,
    creatorName: ticket.creatorName,
    closingModeratorName,
    claimedModeratorName: ticket.claimedByName ?? 'Unclaimed',
    closeReason: reason,
    transcriptText,
    delivered: creatorDelivered,
    failureWarning: creatorWarning,
    timestamp,
  };

  // 2. Claimed Moderator DM (or Closing Moderator if unclaimed)
  const targetModId = ticket.claimedById ?? closingModeratorId;
  const targetModName = ticket.claimedByName ?? closingModeratorName;
  const modDmsEnabled = ticket.claimedById
    ? ticket.claimedByDmsEnabled
    : closingModeratorDmsEnabled;

  const modWarning = modDmsEnabled
    ? undefined
    : `Failed to send DM to moderator ${targetModName}: Staff member has Direct Messages disabled.`;
  if (modWarning) {
    dmWarnings.push(modWarning);
  }

  const moderatorDm: DirectMessageDelivery = {
    id: `dm-mod-${ticket.ticketId}-${Date.now()}`,
    recipientType: 'MODERATOR',
    recipientId: targetModId,
    recipientName: targetModName,
    ticketId: ticket.ticketId,
    categoryLabel: ticket.categoryLabel,
    creatorName: ticket.creatorName,
    closingModeratorName,
    claimedModeratorName: ticket.claimedByName ?? `${closingModeratorName} (Closed unclaimed)`,
    closeReason: reason,
    transcriptText,
    delivered: modDmsEnabled,
    failureWarning: modWarning,
    timestamp,
  };

  return {
    updatedTicket,
    creatorDm,
    moderatorDm,
    dmWarnings,
  };
}

export function evaluateCommandRBAC(params: {
  rule: CommandPermissionRule;
  userId: string;
  userRoles: string[];
  isServerOwner?: boolean;
}): { allowed: boolean; reason: string } {
  const { rule, userId, userRoles, isServerOwner = false } = params;
  if (isServerOwner || userRoles.includes('Administrator')) {
    return { allowed: true, reason: 'Authorized via Administrator permission' };
  }
  if (!rule.enabled) {
    return {
      allowed: false,
      reason: `Command /${rule.commandName} is currently disabled by server administrators.`,
    };
  }
  if (rule.allowedUsers.includes(userId)) {
    return { allowed: true, reason: 'Authorized via explicit user allowlist' };
  }
  if (rule.allowedRoles.some((r) => userRoles.includes(r))) {
    return { allowed: true, reason: 'Authorized via explicit role allowlist' };
  }
  if (rule.requireAdmin) {
    return {
      allowed: false,
      reason: `/${rule.commandName} is restricted to Administrator roles.`,
    };
  }
  if (rule.requireMod) {
    const hasMod = userRoles.includes('Moderator') || userRoles.includes('Senior Moderator');
    return hasMod
      ? { allowed: true, reason: 'Authorized via Moderator role' }
      : { allowed: false, reason: `/${rule.commandName} requires a Moderator role.` };
  }
  return { allowed: true, reason: 'Authorized for general members' };
}

export function filterMessagesForPurge(
  messages: TicketMessage[],
  options: {
    limit: number;
    userFilter?: string;
    containsWord?: string;
    linksOnly?: boolean;
    attachmentsOnly?: boolean;
    botsOnly?: boolean;
  }
): { remaining: TicketMessage[]; deleted: TicketMessage[] } {
  const deleted: TicketMessage[] = [];
  const remaining: TicketMessage[] = [];
  const urlRegex = /https?:\/\/\S+/i;

  for (const msg of messages) {
    if (deleted.length >= options.limit) {
      remaining.push(msg);
      continue;
    }
    let match = true;
    if (options.userFilter && msg.authorName.toLowerCase() !== options.userFilter.toLowerCase()) {
      match = false;
    }
    if (
      options.containsWord &&
      !msg.content.toLowerCase().includes(options.containsWord.toLowerCase())
    ) {
      match = false;
    }
    if (options.linksOnly && !urlRegex.test(msg.content)) {
      match = false;
    }
    if (options.attachmentsOnly && (!msg.attachments || msg.attachments.length === 0)) {
      match = false;
    }
    if (options.botsOnly && msg.authorRole !== 'Bot') {
      match = false;
    }

    if (match) {
      deleted.push(msg);
    } else {
      remaining.push(msg);
    }
  }
  return { remaining, deleted };
}

export function queryLocalAIEngine(
  query: string,
  knowledgeBase: AIKnowledgeEntry[],
  recentContext: string[],
  personality: string
): { matchedTopic: string; reply: string; score: number } {
  const queryLower = query.toLowerCase();
  const contextLower = recentContext.join(' ').toLowerCase();

  let bestEntry: AIKnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of knowledgeBase) {
    let score = 0;
    for (const kw of entry.keywords) {
      const cleanKw = kw.trim().toLowerCase();
      if (!cleanKw) continue;
      if (queryLower.includes(cleanKw)) {
        score += 3;
      } else if (contextLower.includes(cleanKw)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore > 0) {
    return {
      matchedTopic: bestEntry.topic,
      reply: `[${personality}] ${bestEntry.response}`,
      score: bestScore,
    };
  }

  const availableTopics = knowledgeBase.map((k) => k.topic).join(', ');
  return {
    matchedTopic: 'Fallback Knowledge Index',
    reply: `[${personality}] I checked the local SQLite knowledge base. Try asking about: ${availableTopics}, or open a support ticket in the Ticket Panel.`,
    score: 0,
  };
}
