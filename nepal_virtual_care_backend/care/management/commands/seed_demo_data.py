from django.core.management.base import BaseCommand
from care.models import Provider
from resources.models import HealthResource

class Command(BaseCommand):
    help = "Add the sample providers and health resources from the frontend prototype."

    def handle(self, *args, **options):
        providers = [
            {"name":"Dr. Asha Sharma","specialty":"General Physician","city":"Kathmandu","availability":"Available today","initials":"AS","color":"mint","rating":"4.9","experience":"8 years","languages":"Nepali, English"},
            {"name":"Dr. Ramesh Karki","specialty":"Cardiologist","city":"Lalitpur","availability":"Next slot 4:30 PM","initials":"RK","color":"blue","rating":"4.8","experience":"12 years","languages":"Nepali, English, Hindi"},
            {"name":"Dr. Nisha Gurung","specialty":"Psychologist","city":"Pokhara","availability":"Available tomorrow","initials":"NG","color":"peach","rating":"4.9","experience":"7 years","languages":"Nepali, English"},
            {"name":"Dr. Binod Thapa","specialty":"Dermatologist","city":"Bhaktapur","availability":"Next slot 11:00 AM","initials":"BT","color":"lavender","rating":"4.7","experience":"10 years","languages":"Nepali, English"},
        ]
        for item in providers:
            Provider.objects.update_or_create(name=item["name"], defaults=item)
        resources = [
            ("GENERAL WELLNESS","Heart health basics","Learn about everyday habits that support cardiovascular wellbeing."),
            ("MENTAL HEALTH","Mental wellbeing","Explore simple approaches to emotional wellbeing and seeking support."),
            ("NUTRITION","Everyday nutrition","Understand balanced meals, hydration and practical food choices."),
            ("PHYSICAL ACTIVITY","Staying active","Discover ways to build movement into your daily routine."),
        ]
        for tag, title, description in resources:
            HealthResource.objects.get_or_create(title=title, defaults={"tag":tag,"description":description})
        self.stdout.write(self.style.SUCCESS("Demo providers and health resources are ready. These are sample records, not verified clinical listings."))
