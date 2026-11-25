const express = require('express');

const router = express.Router();

router.use('/health', require('./health.routes'));
router.use('/sop', require('./sop.routes'));
router.use('/supply', require('./supply.routes'));
router.use('/rma', require('./rma.routes'));
router.use('/research', require('./research.routes'));

module.exports = router;
