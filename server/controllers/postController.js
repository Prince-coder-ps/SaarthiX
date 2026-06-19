const Post = require("../models/Post");

/* POST /api/posts — create a new post */
exports.createPost = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Content is required." });
    }

    const post = await Post.create({
      userId:   req.user._id,
      userName: req.user.name,
      role:     req.user.role,
      content:  content.trim(),
    });

    res.status(201).json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/posts — fetch all posts, newest first */
exports.getPosts = async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
