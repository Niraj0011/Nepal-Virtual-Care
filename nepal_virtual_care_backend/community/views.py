
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Post, PostLike, Comment
from .serializers import PostSerializer, CommentSerializer


class PostListCreateView(generics.ListCreateAPIView):
    serializer_class = PostSerializer
    queryset = (
        Post.objects
        .select_related("author")
        .prefetch_related("likes", "comments")
    )

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "request": self.request,
        }

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class PostLikeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)

        like, created = PostLike.objects.get_or_create(
            post=post,
            user=request.user
        )

        if not created:
            like.delete()
            liked = False
        else:
            liked = True

        return Response({
            "liked": liked,
            "likes": post.likes.count()
        }, status=status.HTTP_200_OK)


class CommentListCreateView(generics.ListCreateAPIView):
    serializer_class = CommentSerializer

    def get_queryset(self):
        post = get_object_or_404(Post, pk=self.kwargs["post_id"])
        return (
            Comment.objects
            .filter(post=post)
            .select_related("author")
        )

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        post = get_object_or_404(Post, pk=self.kwargs["post_id"])
        serializer.save(
            post=post,
            author=self.request.user
        )
