from pathlib import Path

from PIL import Image, UnidentifiedImageError
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DoctorProfile


class DoctorProfilePhotoView(APIView):
    """Allow an active doctor to view, upload, or remove their own photo."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    max_file_size = 5 * 1024 * 1024
    allowed_formats = {"JPEG", "PNG", "WEBP"}

    def get_doctor(self, request):
        try:
            doctor = request.user.doctor_profile
        except DoctorProfile.DoesNotExist:
            raise PermissionDenied("Only doctor accounts can manage a doctor profile photo.")

        if not (
            doctor.is_active
            and doctor.user.is_active
            and doctor.provider.is_active
        ):
            raise PermissionDenied("Your doctor account is not active.")

        return doctor

    def serialize_photo(self, request, doctor):
        photo_url = None
        if doctor.profile_photo:
            photo_url = request.build_absolute_uri(doctor.profile_photo.url)
        return {"profile_photo": photo_url}

    def get(self, request):
        doctor = self.get_doctor(request)
        return Response(self.serialize_photo(request, doctor))

    def post(self, request):
        doctor = self.get_doctor(request)
        uploaded_file = request.FILES.get("profile_photo") or request.FILES.get("photo")

        if uploaded_file is None:
            raise ValidationError({"profile_photo": "Please choose an image to upload."})

        if uploaded_file.size > self.max_file_size:
            raise ValidationError({"profile_photo": "The image must be 5 MB or smaller."})

        try:
            uploaded_file.seek(0)
            image = Image.open(uploaded_file)
            image.verify()
            image_format = image.format
        except (UnidentifiedImageError, OSError, ValueError):
            raise ValidationError({"profile_photo": "Upload a valid JPG, PNG, or WEBP image."})
        finally:
            uploaded_file.seek(0)

        if image_format not in self.allowed_formats:
            raise ValidationError({"profile_photo": "Only JPG, PNG, and WEBP images are allowed."})

        old_photo = doctor.profile_photo
        doctor.profile_photo = uploaded_file
        doctor.save(update_fields=["profile_photo"])

        if old_photo and old_photo.name != doctor.profile_photo.name:
            old_photo.delete(save=False)

        return Response(self.serialize_photo(request, doctor), status=status.HTTP_200_OK)

    def delete(self, request):
        doctor = self.get_doctor(request)
        if doctor.profile_photo:
            doctor.profile_photo.delete(save=True)
        return Response(self.serialize_photo(request, doctor), status=status.HTTP_200_OK)
