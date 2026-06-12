from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
import traceback

def home_view(request):
    return JsonResponse({'status': 'ok', 'message': 'SplitSmart API is running'})

def debug_db_view(request):
    try:
        from django.contrib.auth.models import User
        from django.conf import settings
        count = User.objects.count()
        return JsonResponse({
            'status': 'ok',
            'user_count': count,
            'email_host_user': getattr(settings, 'EMAIL_HOST_USER', 'None'),
            'email_backend': getattr(settings, 'EMAIL_BACKEND', 'None'),
            'database_engine': getattr(settings, 'DATABASES', {}).get('default', {}).get('ENGINE', 'None'),
            'database_host': getattr(settings, 'DATABASES', {}).get('default', {}).get('HOST', 'None')
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'error_class': e.__class__.__name__,
            'message': str(e),
            'traceback': traceback.format_exc()
        }, status=500)

urlpatterns = [
    path('', home_view, name='home'),
    path('debug-db/', debug_db_view, name='debug-db'),
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
]

