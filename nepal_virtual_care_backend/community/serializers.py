
from rest_framework import serializers
from .models import Post, PostLike, Comment


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    likes = serializers.IntegerField(source="likes.count", read_only=True)
    liked_by_me = serializers.SerializerMethodField()
    comments_count = serializers.IntegerField(
        source="comments.count",
        read_only=True
    )

    class Meta:
        model = Post
        fields = (
            "id",
            "tag",
            "title",
            "body",
            "author",
            "likes",
            "liked_by_me",
            "comments_count",
            "created_at",
        )
        read_only_fields = (
            "id",
            "author",
            "likes",
            "liked_by_me",
            "comments_count",
            "created_at",
        )

    def get_author(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def get_liked_by_me(self, obj):
        user = self.context["request"].user
        return user.is_authenticated and obj.likes.filter(user=user).exists()


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ("id", "body", "author", "created_at")
        read_only_fields = ("id", "author", "created_at")

    def get_author(self, obj):
        return obj.author.get_full_name() or obj.author.username
