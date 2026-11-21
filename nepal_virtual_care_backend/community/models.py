from django.conf import settings
from django.db import models

class Post(models.Model):
    TAG_CHOICES = [("WELLBEING", "Wellbeing"), ("FAMILY HEALTH", "Family health"), ("HEALTH INFORMATION", "Health information"), ("COMMUNITY", "Community")]
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_posts")
    tag = models.CharField(max_length=40, choices=TAG_CHOICES, default="COMMUNITY")
    title = models.CharField(max_length=180)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-created_at"]
    def __str__(self):
        return self.title

class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="post_likes")
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "user"], name="unique_post_like")]


class Comment(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_comments"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author} on {self.post.title}"
