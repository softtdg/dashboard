const express = require('express');
const { getRmaDashboard, listRmaLines } = require('../services/rmaAnalytics');

const router = express.Router();

function filters(req) {
  return {
    months: req.query.months ?? 0,
    customer: req.query.customer || '',
    defect: req.query.defect || '',
    part: req.query.part || '',
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

router.get('/dashboard', async (req, res) => {
  try {
    const data = await getRmaDashboard(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('RMA dashboard failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

router.get('/lines', async (req, res) => {
  try {
    const data = await listRmaLines(filters(req));
    res.json({ status: 'SUCCESS', data });
  } catch (error) {
    console.error('RMA list failed:', error);
    res.status(500).json({ status: 'FAILURE', message: error.message });
  }
});

module.exports = router;
