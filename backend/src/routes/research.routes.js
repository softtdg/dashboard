const express = require('express');
const { getDesignDashboard, listDesignLines } = require('../services/designAnalytics');
const { getPurchasingDashboard, listPurchasingLines } = require('../services/purchasingAnalytics');
const { getSalesDashboard, listSalesOrders } = require('../services/salesAnalytics');
const { getInventoryDashboard, listInventoryParts } = require('../services/inventoryAnalytics');
const { getMpfDashboard, listMpfRequests } = require('../services/mpfAnalytics');

const router = express.Router();

function filters(req) {
  return {
    months: req.query.months ?? 24,
    customer: req.query.customer || '',
    project: req.query.project || '',
    requester: req.query.requester || '',
    field: req.query.field || '',
    vendor: req.query.vendor || '',
    buyer: req.query.buyer || '',
    sheet: req.query.sheet || '',
    item: req.query.item || '',
    currency: req.query.currency || '',
    location: req.query.location || '',
    category: req.query.category || '',
    region: req.query.region || '',
    part: req.query.part || '',
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

function send(handler) {
  return async (req, res) => {
    try {
      const data = await handler(filters(req));
      res.json({ status: 'SUCCESS', data });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 'FAILURE', message: error.message });
    }
  };
}

router.get('/design', send(getDesignDashboard));
router.get('/design/lines', send(listDesignLines));
router.get('/purchasing', send(getPurchasingDashboard));
router.get('/purchasing/lines', send(listPurchasingLines));
router.get('/sales', send(getSalesDashboard));
router.get('/sales/lines', send(listSalesOrders));
router.get('/inventory', send(getInventoryDashboard));
router.get('/inventory/lines', send(listInventoryParts));
router.get('/mpf', send(getMpfDashboard));
router.get('/mpf/lines', send(listMpfRequests));

module.exports = router;
