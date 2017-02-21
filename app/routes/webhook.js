var express = require('express');
var router = express.Router();

var apiController = require('../controller/api');

router.get('/', apiController.tokenVerification);
router.post('/', apiController.messageHandler);

module.exports = router;