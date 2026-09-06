'use strict';

const express = require('express');

const {
  createFamily, joinFamily, leaveFamily, removeMember, renameFamily,
  listMembers, requireFamily, findFamilyById, requireMember,
} = require('../domain/families');
const { requireAuth } = require('../middleware/auth');
const { wrapAsync } = require('../middleware/error');

const router = express.Router();

router.use(requireAuth);

function toPublicFamily(family) {
  if (!family) return null;
  return { ...family, memberCount: family.memberIds.length };
}

function myFamilies(state, user) {
  return user.familyIds
    .map((id) => findFamilyById(state, id))
    .filter(Boolean)
    .map(toPublicFamily);
}

router.get('/', (req, res) => {
  const state = req.app.get('store').getState();
  res.json({ families: myFamilies(state, req.user) });
});

router.post('/', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const family = store.mutate(
    (state) => createFamily(state, { name: req.body && req.body.name, ownerId: req.user.id }),
  );
  await store.commit();
  res.status(201).json({ family: toPublicFamily(family) });
}));

router.post('/join', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const family = store.mutate(
    (state) => joinFamily(state, {
      inviteCode: req.body && req.body.inviteCode,
      userId: req.user.id,
    }),
  );
  await store.commit();
  res.json({ family: toPublicFamily(family) });
}));

router.post('/:id/leave', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const family = store.mutate(
    (state) => leaveFamily(state, { familyId: req.params.id, userId: req.user.id }),
  );
  await store.commit();
  res.json({ family: toPublicFamily(family) });
}));

router.get('/:id/members', (req, res) => {
  const state = req.app.get('store').getState();
  const family = requireFamily(state, req.params.id);
  requireMember(family, req.user.id);

  res.json({ members: listMembers(state, family) });
});

router.delete('/:id/members/:userId', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const family = store.mutate(
    (state) => removeMember(state, {
      familyId: req.params.id,
      userId: req.params.userId,
      actorId: req.user.id,
    }),
  );
  await store.commit();
  res.json({ family: toPublicFamily(family) });
}));

router.patch('/:id', wrapAsync(async (req, res) => {
  const store = req.app.get('store');
  const family = store.mutate((state) => {
    const target = requireFamily(state, req.params.id);
    return renameFamily(state, {
      family: target,
      name: req.body && req.body.name,
      actorId: req.user.id,
    });
  });
  await store.commit();
  res.json({ family: toPublicFamily(family) });
}));

module.exports = router;
