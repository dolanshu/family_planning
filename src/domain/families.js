'use strict';

const crypto = require('node:crypto');

const { badRequest, notFound, forbidden } = require('./errors');
const { findById, toPublicUser, newId } = require('./users');

const NAME_MIN = 1;
const NAME_MAX = 30;
const INVITE_CODE_LENGTH = 6;
// 去掉 I/O/0/1 等易混淆字符
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

function generateInviteCode(state) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomCode();
    const taken = state.families.some(
      (f) => String(f.inviteCode).toUpperCase() === code,
    );
    if (!taken) return code;
  }
  throw new Error('生成家庭邀请码失败，请重试');
}

function validateName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (value.length < NAME_MIN || value.length > NAME_MAX) {
    throw badRequest(`家庭名长度需为 ${NAME_MIN}-${NAME_MAX} 个字符`);
  }
  return value;
}

function findFamilyById(state, familyId) {
  return state.families.find((f) => f.id === familyId) || null;
}

function findFamilyByInviteCode(state, inviteCode) {
  if (typeof inviteCode !== 'string' || inviteCode.trim() === '') {
    throw notFound('邀请码无效');
  }
  const target = inviteCode.trim().toUpperCase();
  return state.families.find(
    (f) => String(f.inviteCode).toUpperCase() === target,
  ) || null;
}

function requireFamily(state, familyId) {
  const family = findFamilyById(state, familyId);
  if (!family) throw notFound('家庭不存在');
  return family;
}

function isMember(family, userId) {
  return Boolean(family) && family.memberIds.includes(userId);
}

function requireMember(family, userId) {
  if (!isMember(family, userId)) throw forbidden('不是该家庭成员');
  return true;
}

function requireOwner(family, actorId) {
  if (family.ownerId !== actorId) throw forbidden('只有家庭创建者可执行该操作');
  return true;
}

function listMembers(state, family) {
  return family.memberIds
    .map((id) => toPublicUser(findById(state, id)))
    .filter(Boolean);
}

function createFamily(state, { name, ownerId }) {
  const familyName = validateName(name);
  const owner = findById(state, ownerId);
  if (!owner) throw notFound('用户不存在');

  const family = {
    id: newId('f'),
    name: familyName,
    ownerId,
    memberIds: [ownerId],
    inviteCode: generateInviteCode(state),
    createdAt: new Date().toISOString(),
  };

  state.families.push(family);
  if (!owner.familyIds.includes(family.id)) owner.familyIds.push(family.id);

  return family;
}

function joinFamily(state, { inviteCode, userId }) {
  const family = findFamilyByInviteCode(state, inviteCode);
  if (!family) throw notFound('邀请码无效');

  const user = findById(state, userId);
  if (!user) throw notFound('用户不存在');

  // 已是成员则幂等返回
  if (isMember(family, userId)) return family;

  family.memberIds.push(userId);
  if (!user.familyIds.includes(family.id)) user.familyIds.push(family.id);

  return family;
}

/** 成员退出或被移除后的共同收尾逻辑。 */
function detachMember(state, family, userId) {
  releaseAssignments(state, family.id, userId);

  family.memberIds = family.memberIds.filter((id) => id !== userId);

  const user = findById(state, userId);
  if (user) user.familyIds = user.familyIds.filter((id) => id !== family.id);

  // 最后一人离开 → 解散家庭并清理其任务
  if (family.memberIds.length === 0) {
    dissolveFamily(state, family);
    return null;
  }

  // 创建者离开 → 转让给最早加入的成员
  if (family.ownerId === userId) {
    family.ownerId = family.memberIds[0];
  }

  return family;
}

function dissolveFamily(state, family) {
  state.families = state.families.filter((f) => f.id !== family.id);
  state.tasks = state.tasks.filter(
    (t) => !(t.scope === 'family' && t.familyId === family.id),
  );
}

/** 把该成员在该家庭下的指派回收为公共任务（assigneeId = null）。 */
function releaseAssignments(state, familyId, userId) {
  const now = new Date().toISOString();
  for (const task of state.tasks) {
    if (task.scope === 'family' && task.familyId === familyId && task.assigneeId === userId) {
      task.assigneeId = null;
      task.updatedAt = now;
    }
  }
}

function leaveFamily(state, { familyId, userId }) {
  const family = requireFamily(state, familyId);
  requireMember(family, userId);
  return detachMember(state, family, userId);
}

function removeMember(state, { familyId, userId, actorId }) {
  const family = requireFamily(state, familyId);
  requireOwner(family, actorId);

  if (userId === actorId) throw badRequest('请使用「退出家庭」来离开');
  requireMember(family, userId);

  return detachMember(state, family, userId);
}

function renameFamily(state, { family, name, actorId }) {
  requireOwner(family, actorId);
  family.name = validateName(name);
  family.updatedAt = new Date().toISOString();
  return family;
}

module.exports = {
  createFamily,
  joinFamily,
  leaveFamily,
  removeMember,
  renameFamily,
  listMembers,
  findFamilyById,
  findFamilyByInviteCode,
  requireFamily,
  isMember,
  requireMember,
  releaseAssignments,
  INVITE_CODE_LENGTH,
  NAME_MIN,
  NAME_MAX,
};
