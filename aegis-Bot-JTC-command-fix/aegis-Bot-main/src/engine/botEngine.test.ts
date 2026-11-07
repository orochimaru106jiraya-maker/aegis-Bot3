import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TICKET_CATEGORIES,
  formatTicketChannelName,
  validateTicketCreation,
  processTicketClose,
  evaluateCommandRBAC,
  filterMessagesForPurge,
  queryLocalAIEngine,
  type TicketRecord,
} from './botEngine';

test('formatTicketChannelName formats all 4 ticket categories properly', () => {
  assert.equal(
    formatTicketChannelName(DEFAULT_TICKET_CATEGORIES.general.namingFormat, 'Alex_Dev!', 101),
    'general-alexdev'
  );
  assert.equal(
    formatTicketChannelName(DEFAULT_TICKET_CATEGORIES.complaint.namingFormat, 'Sarah', 102),
    'complaint-sarah'
  );
  assert.equal(
    formatTicketChannelName(DEFAULT_TICKET_CATEGORIES.staff.namingFormat, 'Rohan', 103),
    'staff-rohan'
  );
  assert.equal(
    formatTicketChannelName(DEFAULT_TICKET_CATEGORIES.prize.namingFormat, 'Winner99', 104),
    'prize-winner99'
  );
});

test('validateTicketCreation blocks duplicate ticket categories and enforces max open limit', () => {
  const sampleTicket: TicketRecord = {
    ticketId: 1,
    channelId: 'ch-1',
    channelName: 'general-alex',
    discordCategoryName: 'SUPPORT TICKETS',
    categoryKey: 'general',
    categoryLabel: 'General Help',
    creatorId: 'u-1',
    creatorName: 'alex',
    creatorDmsEnabled: true,
    claimedById: null,
    claimedByName: null,
    claimedByDmsEnabled: true,
    status: 'open',
    answers: { 'What do you need help with?': 'Role permissions' },
    messages: [],
    claimHistory: [],
    createdAt: '2026-11-07 01:00 UTC',
  };

  // Duplicate category check
  const dupResult = validateTicketCreation([sampleTicket], 'u-1', 'general', 3);
  assert.equal(dupResult.allowed, false);
  assert.ok(dupResult.error?.includes('Duplicate ticket prevented'));

  // Different category allowed when below max limit
  const diffResult = validateTicketCreation([sampleTicket], 'u-1', 'prize', 2);
  assert.equal(diffResult.allowed, true);

  // Max limit check
  const maxResult = validateTicketCreation([sampleTicket], 'u-1', 'prize', 1);
  assert.equal(maxResult.allowed, false);
  assert.ok(maxResult.error?.includes('Maximum open ticket limit reached'));
});

test('processTicketClose generates transcript and sends separate DMs to creator and claimed/closing moderator', () => {
  const openTicket: TicketRecord = {
    ticketId: 42,
    channelId: 'ch-42',
    channelName: 'prize-alex',
    discordCategoryName: 'PRIZE & GIVEAWAY CLAIMS',
    categoryKey: 'prize',
    categoryLabel: 'Claim Winning Prize',
    creatorId: 'u-alex',
    creatorName: 'alex',
    creatorDmsEnabled: true,
    claimedById: 'mod-1',
    claimedByName: 'ModKira',
    claimedByDmsEnabled: false, // Simulate disabled DMs on claimed moderator
    status: 'open',
    answers: {
      'What event or giveaway did you win?': 'Weekly Nitro Drop',
      'Provide proof of winning.': 'https://imgur.com/proof123',
      'What is your Discord username?': 'alex',
    },
    messages: [
      {
        id: 'm1',
        authorId: 'u-alex',
        authorName: 'alex',
        authorRole: 'Member',
        content: 'Hello, here is my screenshot!',
        timestamp: '01:10 UTC',
      },
    ],
    claimHistory: [],
    createdAt: '01:09 UTC',
  };

  const result = processTicketClose({
    ticket: openTicket,
    closingModeratorId: 'admin-1',
    closingModeratorName: 'AdminVance',
    reason: 'Prize verified and delivered.',
    timestamp: '01:15 UTC',
  });

  assert.equal(result.updatedTicket.status, 'closed');
  assert.equal(result.creatorDm.recipientId, 'u-alex');
  assert.equal(result.creatorDm.delivered, true);
  assert.equal(result.moderatorDm.recipientId, 'mod-1');
  assert.equal(result.moderatorDm.delivered, false);
  assert.equal(result.dmWarnings.length, 1);
  assert.ok(result.creatorDm.transcriptText.includes('Weekly Nitro Drop'));
});

test('evaluateCommandRBAC and filterMessagesForPurge enforce rules accurately', () => {
  const banRule = {
    commandName: 'ban',
    moduleName: 'Moderation',
    enabled: true,
    requireAdmin: false,
    requireMod: true,
    allowedRoles: [],
    allowedUsers: [],
  };

  assert.equal(
    evaluateCommandRBAC({ rule: banRule, userId: 'u-2', userRoles: ['Member'] }).allowed,
    false
  );
  assert.equal(
    evaluateCommandRBAC({ rule: banRule, userId: 'u-2', userRoles: ['Moderator'] }).allowed,
    true
  );

  const purgeOutcome = filterMessagesForPurge(
    [
      { id: '1', authorId: 'u1', authorName: 'alice', authorRole: 'Member', content: 'Check https://example.com', timestamp: '10:00' },
      { id: '2', authorId: 'u2', authorName: 'bob', authorRole: 'Member', content: 'Normal chat message', timestamp: '10:01' },
    ],
    { limit: 10, linksOnly: true }
  );
  assert.equal(purgeOutcome.deleted.length, 1);
  assert.equal(purgeOutcome.remaining.length, 1);
});

test('queryLocalAIEngine matches keywords and conversation context without external APIs', () => {
  const kb = [
    {
      id: 1,
      topic: 'Ticket System',
      keywords: ['ticket', 'complaint', 'prize', 'staff'],
      response: 'Use the 4-category ticket panel to open a private channel.',
    },
  ];
  const res = queryLocalAIEngine(
    'How do I claim my giveaway prize?',
    kb,
    [],
    'Helpful Assistant'
  );
  assert.equal(res.matchedTopic, 'Ticket System');
  assert.ok(res.score >= 3);
});
