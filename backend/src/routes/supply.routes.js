const express = require('express');
const {
  getBackorderDashboard,
  listBackorderLines,
  getPartsDashboard,
  listPurchaseLines,
} = require('../services/supplyAnalytics');

const router = express.Router();

function filters(req) {
  return {
    months: req.query.months ?? 24,
    customer: req.query.customer || '',
    program: req.query.program || '',
    leadHand: req.query.leadHand || '',
    location: req.query.location || '',
    part: req.query.part || '',
    vendor: req.query.vendor || '',
    item: req.query.item || '',
    view: req.query.view || '',
    q: req.query.q || '',
    sort: req.query.sort || '',
    dir: req.query.dir || '',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 40,
    entryMonth: req.query.entryMonth || '',
    entryMonths: req.query.entryMonths || '',
    min: req.query.min,
    max: req.query.max,
  };
}

router.get('/backorders', async (req, res) => {
  try {
    const data = await getBackorderDashboard(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('Backorder dashboard failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/backorders/lines', async (req, res) => {
  try {
    const data = await listBackorderLines(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('Backorder list failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/parts', async (req, res) => {
  try {
    const data = await getPartsDashboard(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('Parts dashboard failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/purchasing/lines', async (req, res) => {
  try {
    const data = await listPurchaseLines(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('Purchase list failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

module.exports = router;
