
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction
from django.utils import timezone

from care.models import Appointment, Notification


class Command(BaseCommand):
    help = "Send one-time reminders 24 hours before confirmed appointments."

    def handle(self, *args, **options):
        now = timezone.localtime()
        today = now.date()

        appointments = (
            Appointment.objects
            .filter(
                status="Confirmed",
                preferred_date__gte=today,
                preferred_date__lte=today + timedelta(days=1),
                start_time__isnull=False,
            )
            .select_related("patient", "provider")
            .order_by("preferred_date", "start_time")
        )

        created_count = 0
        updated_count = 0
        existing_count = 0
        past_count = 0
        not_due_count = 0
        inactive_count = 0
        duplicate_count = 0

        for appointment in appointments:
            appointment_datetime = datetime.combine(
                appointment.preferred_date,
                appointment.start_time,
            )

            if timezone.is_aware(now):
                appointment_datetime = timezone.make_aware(
                    appointment_datetime,
                    timezone.get_current_timezone(),
                )

            # Do not remind patients about appointments that have passed.
            if appointment_datetime <= now:
                past_count += 1
                continue

            reminder_due_at = appointment_datetime - timedelta(hours=24)

            # Wait until the appointment is within its 24-hour reminder window.
            if now < reminder_due_at:
                not_due_count += 1
                continue

            # Do not create notifications for inactive patient accounts.
            if not appointment.patient.is_active:
                inactive_count += 1
                continue

            appointment_date = appointment.preferred_date.strftime("%d %b %Y")
            appointment_time = appointment.start_time.strftime("%I:%M %p")

            title = "Appointment reminder"

            message = (
                f"This is a reminder that you have a confirmed appointment "
                f"with {appointment.provider.name} on {appointment_date} "
                f"at {appointment_time}. Please be ready for your consultation."
            )

            try:
                with transaction.atomic():
                    notification, created = (
                        Notification.objects.get_or_create(
                            recipient=appointment.patient,
                            appointment=appointment,
                            notification_type="appointment_reminder",
                            defaults={
                                "title": title,
                                "message": message,
                            },
                        )
                    )

                    if created:
                        created_count += 1

                    else:
                        # Refresh the existing reminder's details if the
                        # appointment date, time, or provider has changed.
                        if (
                            notification.title != title
                            or notification.message != message
                        ):
                            notification.title = title
                            notification.message = message

                            notification.save(
                                update_fields=["title", "message"]
                            )

                            updated_count += 1

                        else:
                            existing_count += 1

            except IntegrityError:
                # Another process may have created the same reminder.
                duplicate_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Reminder check complete.\n"
                f"Created: {created_count}\n"
                f"Updated: {updated_count}\n"
                f"Already existing: {existing_count}\n"
                f"Appointments already past: {past_count}\n"
                f"Reminders not yet due: {not_due_count}\n"
                f"Inactive patients: {inactive_count}\n"
                f"Duplicate attempts prevented: {duplicate_count}"
            )
        )
