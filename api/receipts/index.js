const express = require("express");
const router = express.Router();

router.post("/create", require("./create"));
router.get("/list", require("./list"));
router.get("/details", require("./details"));
router.post("/delete", require("./delete"));
router.get("/items", require("./items"));
router.get("/summary", require("./summary"));
router.get("/mostBought", require("./mostBought"));
router.post("/delete", require("./delete"));
router.delete("/delete", require("./delete"));


module.exports = router;
