from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, CurrentUserView, GroupViewSet, ExpenseViewSet,
    GroupExpenseListView, SettlementView, ChatMessageViewSet,
    SendOTPView, VerifyOTPView
)

router = DefaultRouter()
router.register(r'groups', GroupViewSet, basename='groups')
router.register(r'expenses', ExpenseViewSet, basename='expenses')

urlpatterns = [
    # Auth Endpoints
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('auth/user/', CurrentUserView.as_view(), name='current-user'),
    path('auth/send-otp/', SendOTPView.as_view(), name='send-otp'),
    path('auth/verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),


    # ViewSets
    path('', include(router.urls)),

    # Custom Expense Paths
    path('groups/<int:group_id>/expenses/', GroupExpenseListView.as_view(), name='group-expenses-list'),
    path('groups/<int:group_id>/expenses/create/', ExpenseViewSet.as_view({'post': 'create'}), name='group-expenses-create'),

    # Settlement Paths
    path('groups/<int:group_id>/settle/', SettlementView.as_view(), name='group-settle'),

    # Chat Messages Paths
    path('expenses/<int:expense_id>/messages/', ChatMessageViewSet.as_view({'get': 'list', 'post': 'create'}), name='expense-messages'),
]
