
from django.db import migrations


def publish_existing_reviews(apps, schema_editor):
    DoctorReview = apps.get_model("care", "DoctorReview")

    DoctorReview.objects.filter(
        moderation_status="Pending"
    ).update(
        moderation_status="Approved"
    )


def reverse_publish_existing_reviews(apps, schema_editor):
    DoctorReview = apps.get_model("care", "DoctorReview")

    DoctorReview.objects.filter(
        moderation_status="Approved"
    ).update(
        moderation_status="Pending"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("care", "0016_alter_doctorreview_moderation_status_and_more"),
    ]

    operations = [
        migrations.RunPython(
            publish_existing_reviews,
            reverse_publish_existing_reviews,
        ),
    ]
