
from django.urls import path

from .views import (
    PostListCreateView,
    PostLikeView,
    CommentListCreateView,
)

urlpatterns = [
    path("posts/", PostListCreateView.as_view(), name="posts"),
    path("posts/<int:pk>/like/", PostLikeView.as_view(), name="post-like"),
    path(
        "posts/<int:post_id>/comments/",
        CommentListCreateView.as_view(),
        name="post-comments",
    ),
]
