
import { useCallback, useEffect, useState } from 'react';
import {
  MessageCircle,
  Heart,
  Users,
  Plus,
  Send,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
} from 'lucide-react';

import {
  getCommunityPosts,
  createCommunityPost,
  togglePostLike,
  getPostComments,
  addPostComment,
} from '../api';

export default function Community() {
  const [posts, setPosts] = useState([]);
  const [show, setShow] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('WELLBEING');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [liking, setLiking] = useState([]);
  const [error, setError] = useState('');

  const [expandedPost, setExpandedPost] = useState(null);
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loadingComments, setLoadingComments] = useState([]);
  const [submittingComment, setSubmittingComment] = useState([]);

  const token = Boolean(localStorage.getItem('nvc-access'));

  const loadPosts = useCallback(async () => {
    try {
      setError('');
      setLoading(true);

      const data = await getCommunityPosts();

      setPosts(
        Array.isArray(data) ? data : data.results || []
      );
    } catch (err) {
      setError(err.message || 'Unable to load community posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const submit = async (event) => {
    event.preventDefault();

    if (!token) {
      setError('Please log in to publish a community post.');
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle || !trimmedBody) {
      setError('Please complete both the title and discussion.');
      return;
    }

    if (saving) return;

    try {
      setSaving(true);
      setError('');

      await createCommunityPost({
        title: trimmedTitle,
        body: trimmedBody,
        tag,
      });

      setTitle('');
      setBody('');
      setTag('WELLBEING');
      setShow(false);

      await loadPosts();
    } catch (err) {
      setError(err.message || 'Unable to publish your post.');
    } finally {
      setSaving(false);
    }
  };

  const handleLike = async (postId) => {
    if (!token) {
      setError('Please log in to like community posts.');
      return;
    }

    if (liking.includes(postId)) return;

    try {
      setError('');
      setLiking((old) => [...old, postId]);

      const result = await togglePostLike(postId);

      setPosts((old) =>
        old.map((post) =>
          post.id === postId
            ? {
                ...post,
                likes: result.likes,
                liked_by_me: result.liked,
              }
            : post
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to update your like.');
    } finally {
      setLiking((old) => old.filter((id) => id !== postId));
    }
  };

  const toggleDiscussion = async (postId) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
      return;
    }

    setExpandedPost(postId);

    if (Object.prototype.hasOwnProperty.call(comments, postId)) {
      return;
    }

    if (loadingComments.includes(postId)) return;

    try {
      setLoadingComments((old) => [...old, postId]);

      const data = await getPostComments(postId);

      setComments((old) => ({
        ...old,
        [postId]: Array.isArray(data) ? data : data.results || [],
      }));
    } catch (err) {
      setError(err.message || 'Unable to load comments.');
    } finally {
      setLoadingComments((old) =>
        old.filter((id) => id !== postId)
      );
    }
  };

  const handleComment = async (event, postId) => {
    event.preventDefault();

    const commentBody = (commentDrafts[postId] || '').trim();

    if (!commentBody) return;

    if (!token) {
      setError('Please log in to comment on discussions.');
      return;
    }

    if (submittingComment.includes(postId)) return;

    try {
      setError('');
      setSubmittingComment((old) => [...old, postId]);

      const newComment = await addPostComment(postId, commentBody);

      setComments((old) => ({
        ...old,
        [postId]: [...(old[postId] || []), newComment],
      }));

      setCommentDrafts((old) => ({
        ...old,
        [postId]: '',
      }));

      setPosts((old) =>
        old.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments_count: (post.comments_count || 0) + 1,
              }
            : post
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to add your comment.');
    } finally {
      setSubmittingComment((old) =>
        old.filter((id) => id !== postId)
      );
    }
  };

  const formatDate = (date) => {
    if (!date) return '';

    const created = new Date(date);

    if (Number.isNaN(created.getTime())) return '';

    const now = new Date();
    const difference = Math.floor(
      (now - created) / (1000 * 60 * 60 * 24)
    );

    if (difference < 0) {
      return created.toLocaleDateString();
    }

    if (difference === 0) return 'Today';
    if (difference === 1) return 'Yesterday';
    if (difference < 7) return `${difference} days ago`;

    return created.toLocaleDateString();
  };

  const closePostForm = () => {
    if (saving) return;

    setShow(false);
    setTitle('');
    setBody('');
    setTag('WELLBEING');
  };

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">COMMUNITY</span>

        <h1>
          Better together, <em>every day.</em>
        </h1>

        <p>
          A welcoming space for shared experiences, helpful conversations
          and community connection.
        </p>
      </section>

      <section className="section community-layout">
        <div>
          <div className="directory-top">
            <div>
              <h2>Community conversations</h2>
              <p className="muted">
                Connect through experiences and supportive discussion.
              </p>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setError('');
                setShow((previous) => !previous);
              }}
              aria-expanded={show}
            >
              {show ? <X size={17} /> : <Plus size={17} />}
              {show ? 'Close form' : 'Start a discussion'}
            </button>
          </div>

          {error && (
            <div className="form-error" role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {show && (
            <form className="post-form" onSubmit={submit}>
              <h3>Start a conversation</h3>

              <label htmlFor="community-post-title">
                Discussion title
              </label>

              <input
                id="community-post-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What would you like to discuss?"
                maxLength={180}
                required
                disabled={saving}
              />

              <label htmlFor="community-post-category">
                Choose a category
              </label>

              <select
                id="community-post-category"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                required
                disabled={saving}
              >
                <option value="WELLBEING">Wellbeing</option>
                <option value="FAMILY HEALTH">Family health</option>
                <option value="HEALTH INFORMATION">
                  Health information
                </option>
                <option value="COMMUNITY">Community</option>
              </select>

              <label htmlFor="community-post-body">
                Your message
              </label>

              <textarea
                id="community-post-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Share your thoughts or experience..."
                rows="4"
                maxLength={5000}
                required
                disabled={saving}
              />

              <small className="form-note">
                Please respect others' privacy and avoid sharing
                unnecessary personal medical information.
              </small>

              <div className="post-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closePostForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || !title.trim() || !body.trim()}
                >
                  {saving ? 'Publishing...' : 'Publish post'}
                </button>
              </div>
            </form>
          )}

          <div className="post-list">
            {loading ? (
              <div className="empty-state" role="status">
                <RefreshCw size={25} />
                <p>Loading community conversations...</p>
              </div>
            ) : error && posts.length === 0 ? (
              <div className="empty-state">
                <MessageCircle size={28} />
                <h3>Unable to load conversations</h3>
                <p>Please try again.</p>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={loadPosts}
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            ) : posts.length === 0 ? (
              <div className="empty-state">
                <MessageCircle size={30} />
                <h3>No conversations yet</h3>
                <p>
                  Be the first to share something with the community.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShow(true)}
                >
                  <Plus size={16} />
                  Start a discussion
                </button>
              </div>
            ) : (
              posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <span className="post-tag">{post.tag}</span>

                  <h3>{post.title}</h3>

                  <p>{post.body}</p>

                  <div className="post-meta">
                    <span>
                      {post.author} · {formatDate(post.created_at)}
                    </span>

                    <button
                      type="button"
                      className={
                        post.liked_by_me
                          ? 'like-button liked'
                          : 'like-button'
                      }
                      onClick={() => handleLike(post.id)}
                      disabled={liking.includes(post.id)}
                      aria-label={
                        post.liked_by_me
                          ? `Unlike post, ${post.likes} likes`
                          : `Like post, ${post.likes} likes`
                      }
                      aria-pressed={Boolean(post.liked_by_me)}
                    >
                      <Heart
                        size={16}
                        fill={post.liked_by_me ? 'currentColor' : 'none'}
                      />
                      {' '}{post.likes || 0}
                    </button>
                  </div>

                  <div className="discussion-toggle">
                    <button
                      type="button"
                      onClick={() => toggleDiscussion(post.id)}
                      aria-expanded={expandedPost === post.id}
                      aria-controls={`discussion-${post.id}`}
                    >
                      <MessageCircle size={17} />

                      {post.comments_count || 0} Comments

                      {expandedPost === post.id ? (
                        <ChevronUp size={17} />
                      ) : (
                        <ChevronDown size={17} />
                      )}

                      <span>
                        {expandedPost === post.id
                          ? 'Hide discussion'
                          : 'View discussion'}
                      </span>
                    </button>
                  </div>

                  {expandedPost === post.id && (
                    <div
                      className="discussion-section"
                      id={`discussion-${post.id}`}
                    >
                      <h4>Discussion</h4>

                      {loadingComments.includes(post.id) ? (
                        <p className="muted">Loading comments...</p>
                      ) : (
                        <>
                          {(comments[post.id] || []).length === 0 ? (
                            <p className="muted">
                              No comments yet. Be the first to join
                              this conversation!
                            </p>
                          ) : (
                            <div className="comment-list">
                              {comments[post.id].map((comment) => (
                                <div
                                  className="comment-item"
                                  key={comment.id}
                                >
                                  <div className="comment-meta">
                                    <strong>{comment.author}</strong>
                                    <span>
                                      {formatDate(comment.created_at)}
                                    </span>
                                  </div>

                                  <p>{comment.body}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <form
                        className="comment-form"
                        onSubmit={(event) => handleComment(event, post.id)}
                      >
                        <label
                          className="sr-only"
                          htmlFor={`comment-${post.id}`}
                        >
                          Write a comment
                        </label>

                        <textarea
                          id={`comment-${post.id}`}
                          value={commentDrafts[post.id] || ''}
                          onChange={(event) =>
                            setCommentDrafts((old) => ({
                              ...old,
                              [post.id]: event.target.value,
                            }))
                          }
                          placeholder={
                            token
                              ? 'Write a comment...'
                              : 'Log in to join this discussion.'
                          }
                          rows="2"
                          maxLength={2000}
                          disabled={
                            !token || submittingComment.includes(post.id)
                          }
                        />

                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={
                            !token ||
                            !commentDrafts[post.id]?.trim() ||
                            submittingComment.includes(post.id)
                          }
                        >
                          <Send size={15} />
                          {submittingComment.includes(post.id)
                            ? 'Sending...'
                            : 'Comment'}
                        </button>
                      </form>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="community-aside">
          <div className="aside-card">
            <Users size={25} />

            <h3>A space for everyone</h3>

            <p>
              Share experiences respectfully and support one another.
            </p>
          </div>

          <div className="aside-card">
            <MessageCircle size={25} />

            <h3>Community guidelines</h3>

            <ul>
              <li>Be kind and respectful.</li>
              <li>Protect personal privacy.</li>
              <li>Do not share identifying medical details.</li>
              <li>
                Do not use posts as a substitute for professional advice.
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </>
  );
}
