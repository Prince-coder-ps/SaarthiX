const Post = require("../models/Post");

/* POST /api/posts — create a new post */
exports.createPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ success: false, message: "Content is required." });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 2000) {
      return res.status(400).json({ success: false, message: "Content cannot exceed 2000 characters." });
    }

    const post = await Post.create({
      userId:   req.user._id,
      userName: req.user.name,
      role:     req.user.role,
      content:  trimmedContent,
    });

    res.status(201).json({ success: true, post });
  } catch (err) {
    next(err);
  }
};

/* GET /api/posts — fetch all posts, newest first */
exports.getPosts = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const posts = await Post.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, posts });
  } catch (err) {
    next(err);
  }
};
