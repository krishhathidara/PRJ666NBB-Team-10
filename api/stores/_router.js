const express = require("express");
const router = express.Router();

// Handle route: /api/stores/:storeId/products
router.use("/:storeId/products", require("./[storeId]/products"));

module.exports = router;
