import { COMMUNITY_CHANNELS, CommunityPost, CommunityReply } from "../models/LmsLearning.model.js";
import { AUTHOR_FIELDS, authorView, bad, invalid, isId, isTeacher, paginate } from "../utils/lmsLearning.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHANNEL_IDS = COMMUNITY_CHANNELS.map((channel) => channel.id);
const DEFAULT_TAGS = { general: "Discussion", qa: "Question", showcase: "Showcase", study: "Study Group" };

const postView = (post, userId) => ({
  _id: post._id,
  author: authorView(post.author),
  channel: post.channel,
  tag: post.tag,
  title: post.title,
  body: post.body,
  likes: post.likes.length,
  liked: post.likes.some((id) => String(id) === String(userId)),
  replies: post.replyCount,
  pinned: post.pinned,
  createdAt: post.createdAt,
});

const replyView = (reply) => ({ _id: reply._id, author: authorView(reply.author), body: reply.body, createdAt: reply.createdAt });

const findPost = async (req, res) => {
  if (!isId(req.params.id)) {
    bad(res, "id", "Invalid post ID format");
    return null;
  }
  const post = await CommunityPost.findOne({ _id: req.params.id, cohort: req.cohort._id }).populate("author", AUTHOR_FIELDS);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return null;
  }
  return post;
};

/** GET /api/lms/community/channels */
export const listChannelsController = async (req, res, next) => {
  try {
    const posts = await CommunityPost.find({ cohort: req.cohort._id }).select("channel createdAt").lean();
    const weekAgo = Date.now() - 7 * DAY_MS;
    return res.status(200).json({
      channels: COMMUNITY_CHANNELS.map((channel) => {
        const inChannel = posts.filter((post) => post.channel === channel.id);
        return {
          id: channel.id,
          label: channel.label,
          count: inChannel.length,
          isNew: channel.id === "showcase" && inChannel.some((post) => new Date(post.createdAt).getTime() >= weekAgo),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/community/posts?channel=&page=&limit= (pinned first, then newest) */
export const listPostsController = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(req.query, 20, 50);
    const filter = { cohort: req.cohort._id };
    if (req.query.channel !== undefined && req.query.channel !== "") {
      if (!CHANNEL_IDS.includes(req.query.channel)) return bad(res, "channel", `Channel must be one of: ${CHANNEL_IDS.join(", ")}`);
      filter.channel = req.query.channel;
    }
    const [posts, total] = await Promise.all([
      CommunityPost.find(filter).sort({ pinned: -1, createdAt: -1 }).skip(skip).limit(limit).populate("author", AUTHOR_FIELDS),
      CommunityPost.countDocuments(filter),
    ]);
    return res.status(200).json({ posts: posts.map((post) => postView(post, req.user._id)), page, limit, total });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/community/posts  { channel, title, body, tag? } */
export const createPostController = async (req, res, next) => {
  try {
    const { channel, title, body, tag } = req.body || {};
    const fields = {};
    if (!CHANNEL_IDS.includes(channel)) fields.channel = `Channel must be one of: ${CHANNEL_IDS.join(", ")}`;
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const cleanBody = typeof body === "string" ? body.trim() : "";
    if (!cleanTitle) fields.title = "A title is required";
    else if (cleanTitle.length > 140) fields.title = "Titles can be up to 140 characters";
    if (!cleanBody) fields.body = "Write something before posting";
    else if (cleanBody.length > 5000) fields.body = "Posts can be up to 5000 characters";
    if (tag !== undefined && (typeof tag !== "string" || tag.trim().length > 30)) fields.tag = "Tags can be up to 30 characters";
    if (Object.keys(fields).length) return invalid(res, fields);

    const post = await CommunityPost.create({
      cohort: req.cohort._id,
      author: req.user._id,
      channel,
      tag: (typeof tag === "string" && tag.trim()) || DEFAULT_TAGS[channel],
      title: cleanTitle,
      body: cleanBody,
    });
    await post.populate("author", AUTHOR_FIELDS);
    return res.status(201).json({ post: postView(post, req.user._id) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/community/posts/:id  (with replies, oldest first) */
export const getPostController = async (req, res, next) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    const replies = await CommunityReply.find({ post: post._id }).sort({ createdAt: 1 }).populate("author", AUTHOR_FIELDS);
    return res.status(200).json({ post: postView(post, req.user._id), replies: replies.map(replyView) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/community/posts/:id/replies  { body } */
export const createReplyController = async (req, res, next) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return bad(res, "body", "Write something before replying");
    if (body.length > 2000) return bad(res, "body", "Replies can be up to 2000 characters");

    const reply = await CommunityReply.create({ post: post._id, author: req.user._id, body });
    const updated = await CommunityPost.findByIdAndUpdate(post._id, { $inc: { replyCount: 1 } }, { returnDocument: "after" });
    await reply.populate("author", AUTHOR_FIELDS);
    return res.status(201).json({ reply: replyView(reply), replies: updated.replyCount });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/community/posts/:id/like  (toggles) */
export const togglePostLikeController = async (req, res, next) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    const liked = !post.likes.some((id) => String(id) === String(req.user._id));
    const updated = await CommunityPost.findByIdAndUpdate(
      post._id,
      liked ? { $addToSet: { likes: req.user._id } } : { $pull: { likes: req.user._id } },
      { returnDocument: "after" }
    );
    return res.status(200).json({ liked, likes: updated.likes.length });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/community/posts/:id/pin  { pinned? } (teachers) */
export const pinPostController = async (req, res, next) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    post.pinned = req.body?.pinned === undefined ? !post.pinned : Boolean(req.body.pinned);
    await post.save();
    return res.status(200).json({ pinned: post.pinned });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/lms/community/posts/:id  (the author, or a teacher of the cohort) */
export const deletePostController = async (req, res, next) => {
  try {
    const post = await findPost(req, res);
    if (!post) return;
    const isAuthor = String(post.author._id) === String(req.user._id);
    if (!isAuthor && !isTeacher(req)) return res.status(403).json({ error: "You can only delete your own posts" });
    await CommunityReply.deleteMany({ post: post._id });
    await post.deleteOne();
    return res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    next(error);
  }
};
