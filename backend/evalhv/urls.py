from django.urls import path
from app_analyzer.views import analyze

urlpatterns = [
    path('api/analyze/', analyze),
]
