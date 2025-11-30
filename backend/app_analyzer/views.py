import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import os
from .utils_processing import analyze_pdf_text

@csrf_exempt
def analyze(request):
    if request.method != 'POST':
        return JsonResponse({'error':'POST required'}, status=400)
    name = request.POST.get('name')
    chapter = request.POST.get('chapter')
    cargo = request.POST.get('cargo')
    file = request.FILES.get('cv')
    if not (name and chapter and cargo and file):
        return JsonResponse({'error':'faltan campos'}, status=400)
    # guarda pdf temporalmente
    save_path = os.path.join(settings.MEDIA_ROOT, file.name)
    with open(save_path, 'wb+') as dest:
        for chunk in file.chunks():
            dest.write(chunk)
    # extrae texto y procesa
    result = analyze_pdf_text(save_path, chapter, cargo)
    # opcional: borrar archivo después
    try:
        os.remove(save_path)
    except:
        pass
    return JsonResponse(result)
