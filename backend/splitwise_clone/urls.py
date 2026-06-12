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
        email_password = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
        return JsonResponse({
            'status': 'ok',
            'user_count': count,
            'email_host_user': getattr(settings, 'EMAIL_HOST_USER', 'None'),
            'email_backend': getattr(settings, 'EMAIL_BACKEND', 'None'),
            'email_password_len': len(email_password),
            'email_password_has_spaces': ' ' in email_password,
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

def debug_email_view(request):
    try:
        from django.core.mail import send_mail
        from django.conf import settings
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@splitsmart.local')
        email = request.GET.get('email', 'amitranjan6458@gmail.com')
        send_mail(
            'Test Email from SplitSmart Deployed',
            'If you see this, email sending works!',
            from_email,
            [email],
            fail_silently=False
        )
        return JsonResponse({'status': 'ok', 'message': f'Email sent to {email}'})
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
    path('debug-email/', debug_email_view, name='debug-email'),
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
]

