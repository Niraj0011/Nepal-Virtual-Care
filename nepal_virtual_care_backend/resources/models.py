from django.db import models

class HealthResource(models.Model):
    tag = models.CharField(max_length=80)
    title = models.CharField(max_length=180)
    description = models.TextField()
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["title"]
    def __str__(self):
        return self.title
