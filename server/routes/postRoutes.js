const router = require("express").Router();
const { createPost, getPosts } = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, createPost);
router.get("/",  protect, getPosts);

module.exports = router;
