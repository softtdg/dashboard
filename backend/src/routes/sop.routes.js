const express = require('express');
const { getDashboard, lookup, getDetail, listRecords } = require('../services/sopAnalytics');

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  try {
    const data = await getDashboard({
      months: req.query.months ?? 24,
      customer: req.query.customer || '',
      program: req.query.program || '',
      leadHand: req.query.leadHand || '',
      location: req.query.location || '',
    });
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('SOP dashboard failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/records', async (req, res) => {
  try {
    const data = await listRecords({
      months: req.query.months ?? 24,
      customer: req.query.customer || '',
      program: req.query.program || '',
      leadHand: req.query.leadHand || '',
      location: req.query.location || '',
      view: req.query.view || 'tracked',
      q: req.query.q || '',
      sort: req.query.sort || '',
      dir: req.query.dir || '',
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 40,
      stage: req.query.stage || '',
      entryMonth: req.query.entryMonth || '',
      entryMonths: req.query.entryMonths || '',
      minCycle: req.query.minCycle,
      maxCycle: req.query.maxCycle,
    });
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('SOP list failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/lookup', async (req, res) => {
  try {
    const data = await lookup(req.query.q);
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/detail/:sopId', async (req, res) => {
  try {
    const data = await getDetail(req.params.sopId);
    if (!data) return res.status(404).json({ status: 'FAILURE', message: 'SOP not found' });
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

module.exports = router;
