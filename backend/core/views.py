from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth.models import User
from django.db import models, transaction
from django.db.models import Q
from decimal import Decimal
from django.core.mail import send_mail
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
import json
import random

from .models import Group, GroupMember, Expense, ExpenseSplit, Settlement, ChatMessage, EmailOTP
from .serializers import (
    UserSerializer, GroupSerializer, ExpenseSerializer, 
    SettlementSerializer, ChatMessageSerializer
)

class RegisterView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CurrentUserView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class SendOTPView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate 6-digit OTP
        otp = str(random.randint(100000, 999999))
        
        # Save or update OTP
        EmailOTP.objects.update_or_create(
            email=email,
            defaults={'otp': otp}
        )
        
        # Send Email
        subject = 'Your SplitSmart Verification Code'
        message = f'Your 6-digit verification code is: {otp}\nIt will expire in 10 minutes.'
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@splitsmart.local')
        
        try:
            send_mail(subject, message, from_email, [email], fail_silently=False)
            return Response({'success': 'OTP code sent to email.'})
        except Exception as e:
            # Fallback output printing in case SMTP is blocked/misconfigured
            print(f"FAILED TO SEND EMAIL. OTP: {otp}. Error: {str(e)}")
            # If console backend is active, this was printed automatically, but we raise it so user can debug.
            return Response({'error': f'Failed to send email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class VerifyOTPView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        
        if not email or not otp:
            return Response({'error': 'Email and OTP are required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            otp_record = EmailOTP.objects.get(email=email)
        except EmailOTP.DoesNotExist:
            return Response({'error': 'No OTP sent for this email.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Validate OTP and expiration
        if otp_record.otp != otp:
            return Response({'error': 'Invalid OTP code.'}, status=status.HTTP_400_BAD_REQUEST)
            
        if otp_record.is_expired():
            return Response({'error': 'OTP code has expired.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Clear verification OTP
        otp_record.delete()
        
        # Check user or create one
        with transaction.atomic():
            user = User.objects.filter(email=email).first()
            if not user:
                # User doesn't exist, create it automatically
                # Prefix of email as username
                base_username = email.split('@')[0].lower()
                username = base_username
                counter = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}{counter}"
                    counter += 1
                
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=User.objects.make_random_password()
                )
                
        # Generate JWT token
        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'username': user.username,
            'email': user.email
        })


class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        # Return groups that the current user belongs to
        return Group.objects.filter(memberships__user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        with transaction.atomic():
            group = serializer.save(created_by=self.request.user)
            # Automatically add creator as a member
            GroupMember.objects.create(group=group, user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data

        # Calculate Group-wise Balances
        members = instance.memberships.select_related('user')
        balances = {}
        for m in members:
            user = m.user
            # Paid expenses
            paid = Expense.objects.filter(group=instance, paid_by=user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
            # Owed expense splits
            owed = ExpenseSplit.objects.filter(expense__group=instance, user=user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
            # Payments made
            settled_paid = Settlement.objects.filter(group=instance, payer=user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
            # Payments received
            settled_received = Settlement.objects.filter(group=instance, payee=user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
            
            net = paid - owed + settled_paid - settled_received
            balances[user.id] = {
                'id': user.id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email': user.email,
                'net_balance': float(net),
                'total_paid': float(paid),
                'total_owed': float(owed),
                'settled_paid': float(settled_paid),
                'settled_received': float(settled_received)
            }

        # Debt Simplification Algorithm
        debtors = []  # owes money (negative net_balance)
        creditors = []  # owed money (positive net_balance)
        for uid, info in balances.items():
            bal = info['net_balance']
            if bal < -0.005:  # Handle rounding epsilon
                debtors.append({'id': uid, 'username': info['username'], 'balance': -bal})
            elif bal > 0.005:
                creditors.append({'id': uid, 'username': info['username'], 'balance': bal})

        simplified_debts = []
        # Greedily match the largest debtor with the largest creditor
        while debtors and creditors:
            # Sort dynamically to always match the largest remaining
            debtors.sort(key=lambda x: x['balance'], reverse=True)
            creditors.sort(key=lambda x: x['balance'], reverse=True)
            
            d = debtors[0]
            c = creditors[0]
            
            amount = min(d['balance'], c['balance'])
            if amount > 0.005:
                simplified_debts.append({
                    'from_user_id': d['id'],
                    'from_username': d['username'],
                    'to_user_id': c['id'],
                    'to_username': c['username'],
                    'amount': round(amount, 2)
                })
            
            d['balance'] -= amount
            c['balance'] -= amount
            
            if d['balance'] <= 0.005:
                debtors.pop(0)
            if c['balance'] <= 0.005:
                creditors.pop(0)

        data['balances'] = list(balances.values())
        data['simplified_debts'] = simplified_debts
        return Response(data)

    @action(detail=True, methods=['POST'], url_path='add-member')
    def add_member(self, request, pk=None):
        group = self.get_object()
        query = request.data.get('query')  # Can be username or email

        if not query:
            return Response({'error': 'Please provide a username or email.'}, status=status.HTTP_400_BAD_REQUEST)

        # Look up user
        try:
            user = User.objects.get(Q(username__iexact=query) | Q(email__iexact=query))
        except User.DoesNotExist:
            return Response({'error': f"User '{query}' not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check if already a member
        if GroupMember.objects.filter(group=group, user=user).exists():
            return Response({'error': 'User is already a member of this group.'}, status=status.HTTP_400_BAD_REQUEST)

        # Add user to group
        GroupMember.objects.create(group=group, user=user)
        return Response({'success': f"Successfully added {user.username} to the group."}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['POST'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        group = self.get_object()
        user_id = request.data.get('user_id')

        if not user_id:
            return Response({'error': 'Please provide user_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            member_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Check if they are in the group
        member = GroupMember.objects.filter(group=group, user=member_user).first()
        if not member:
            return Response({'error': 'User is not a member of this group.'}, status=status.HTTP_400_BAD_REQUEST)

        # Don't allow creator to be removed (optional but standard to keep groups stable)
        if group.created_by == member_user:
            return Response({'error': 'Cannot remove the group creator.'}, status=status.HTTP_400_BAD_REQUEST)

        # Balance check: net balance in this group must be exactly $0.00
        # Calculate balance
        paid = Expense.objects.filter(group=group, paid_by=member_user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
        owed = ExpenseSplit.objects.filter(expense__group=group, user=member_user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
        settled_paid = Settlement.objects.filter(group=group, payer=member_user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
        settled_received = Settlement.objects.filter(group=group, payee=member_user).aggregate(sum=models.Sum('amount'))['sum'] or Decimal('0.00')
        
        net_balance = paid - owed + settled_paid - settled_received

        if abs(net_balance) > Decimal('0.005'):
            return Response({
                'error': f"Cannot remove member because their net balance is ${net_balance:.2f}. All debts must be settled before leaving."
            }, status=status.HTTP_400_BAD_REQUEST)

        member.delete()
        return Response({'success': f"Successfully removed {member_user.username} from the group."})


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        # We look up expenses through the group the user has access to
        return Expense.objects.filter(group__memberships__user=self.request.user).distinct().order_by('-created_at')

    def create(self, request, group_id=None):
        # We override create to handle the nested splits logic
        try:
            group = Group.objects.get(id=group_id, memberships__user=request.user)
        except Group.DoesNotExist:
            return Response({'error': 'Group not found or you do not have permission.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        description = data.get('description')
        amount_val = data.get('amount')
        paid_by_id = data.get('paid_by')
        split_type = data.get('split_type')
        splits_input = data.get('splits')  # Array of {user: id, split_value: dec}

        if not all([description, amount_val, paid_by_id, split_type, splits_input]):
            return Response({'error': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(amount_val))
            paid_by = User.objects.get(id=paid_by_id)
        except Exception:
            return Response({'error': 'Invalid amount or paid_by user.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate splits sum
        # Compute amounts for splits
        calculated_splits = []
        
        if split_type == 'EQUALLY':
            # split equally among the users list in splits_input
            users_count = len(splits_input)
            if users_count == 0:
                return Response({'error': 'Splits list cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
            
            equal_amount = (amount / Decimal(users_count)).quantize(Decimal('0.01'))
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                # Handlers for rounding remaining cent
                if index == users_count - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = equal_amount
                    running_sum += u_amt
                
                calculated_splits.append({
                    'user_id': u_id,
                    'amount': u_amt,
                    'split_value': Decimal('1.00') # default dummy ratio/share
                })

        elif split_type == 'UNEQUALLY':
            running_sum = Decimal('0.00')
            for item in splits_input:
                u_id = item['user']
                u_val = Decimal(str(item['split_value']))
                running_sum += u_val
                calculated_splits.append({
                    'user_id': u_id,
                    'amount': u_val,
                    'split_value': u_val
                })
            if abs(running_sum - amount) > Decimal('0.015'):
                return Response({'error': f"The sum of split amounts (${running_sum}) must equal the total expense amount (${amount})."}, status=status.HTTP_400_BAD_REQUEST)

        elif split_type == 'PERCENTAGE':
            running_pct = Decimal('0.00')
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                u_pct = Decimal(str(item['split_value']))
                running_pct += u_pct
                
                if index == len(splits_input) - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = (amount * (u_pct / Decimal('100.00'))).quantize(Decimal('0.01'))
                    running_sum += u_amt
                
                calculated_splits.append({
                    'user_id': u_id,
                    'amount': u_amt,
                    'split_value': u_pct
                })
            if abs(running_pct - Decimal('100.00')) > Decimal('0.01'):
                return Response({'error': f"The sum of percentages ({running_pct}%) must equal 100%."}, status=status.HTTP_400_BAD_REQUEST)

        elif split_type == 'SHARE':
            total_shares = sum(Decimal(str(item['split_value'])) for item in splits_input)
            if total_shares <= 0:
                return Response({'error': 'Total shares must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
            
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                u_share = Decimal(str(item['split_value']))
                
                if index == len(splits_input) - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = (amount * (u_share / total_shares)).quantize(Decimal('0.01'))
                    running_sum += u_amt
                
                calculated_splits.append({
                    'user_id': u_id,
                    'amount': u_amt,
                    'split_value': u_share
                })
        else:
            return Response({'error': 'Invalid split type.'}, status=status.HTTP_400_BAD_REQUEST)

        # Write to Database inside an atomic transaction
        with transaction.atomic():
            expense = Expense.objects.create(
                group=group,
                description=description,
                amount=amount,
                paid_by=paid_by,
                split_type=split_type,
                created_by=request.user
            )

            for split in calculated_splits:
                u_obj = User.objects.get(id=split['user_id'])
                ExpenseSplit.objects.create(
                    expense=expense,
                    user=u_obj,
                    amount=split['amount'],
                    split_value=split['split_value']
                )

            # Auto-create first chat activity log message
            ChatMessage.objects.create(
                expense=expense,
                user=request.user,
                message=f"created this expense of ${amount:.2f}."
            )

        serializer = self.get_serializer(expense)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        # Edit expense and rewrite splits
        try:
            expense = Expense.objects.get(id=pk, group__memberships__user=request.user)
        except Expense.DoesNotExist:
            return Response({'error': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        description = data.get('description', expense.description)
        amount_val = data.get('amount')
        paid_by_id = data.get('paid_by')
        split_type = data.get('split_type')
        splits_input = data.get('splits')

        if not all([amount_val, paid_by_id, split_type, splits_input]):
            return Response({'error': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(amount_val))
            paid_by = User.objects.get(id=paid_by_id)
        except Exception:
            return Response({'error': 'Invalid amount or paid_by user.'}, status=status.HTTP_400_BAD_REQUEST)

        calculated_splits = []
        if split_type == 'EQUALLY':
            users_count = len(splits_input)
            equal_amount = (amount / Decimal(users_count)).quantize(Decimal('0.01'))
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                if index == users_count - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = equal_amount
                    running_sum += u_amt
                calculated_splits.append({'user_id': u_id, 'amount': u_amt, 'split_value': Decimal('1.00')})

        elif split_type == 'UNEQUALLY':
            running_sum = Decimal('0.00')
            for item in splits_input:
                u_id = item['user']
                u_val = Decimal(str(item['split_value']))
                running_sum += u_val
                calculated_splits.append({'user_id': u_id, 'amount': u_val, 'split_value': u_val})
            if abs(running_sum - amount) > Decimal('0.015'):
                return Response({'error': f"Splits sum (${running_sum}) must equal total (${amount})."}, status=status.HTTP_400_BAD_REQUEST)

        elif split_type == 'PERCENTAGE':
            running_pct = Decimal('0.00')
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                u_pct = Decimal(str(item['split_value']))
                running_pct += u_pct
                if index == len(splits_input) - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = (amount * (u_pct / Decimal('100.00'))).quantize(Decimal('0.01'))
                    running_sum += u_amt
                calculated_splits.append({'user_id': u_id, 'amount': u_amt, 'split_value': u_pct})
            if abs(running_pct - Decimal('100.00')) > Decimal('0.01'):
                return Response({'error': 'Percentage sum must be 100%.'}, status=status.HTTP_400_BAD_REQUEST)

        elif split_type == 'SHARE':
            total_shares = sum(Decimal(str(item['split_value'])) for item in splits_input)
            running_sum = Decimal('0.00')
            for index, item in enumerate(splits_input):
                u_id = item['user']
                u_share = Decimal(str(item['split_value']))
                if index == len(splits_input) - 1:
                    u_amt = amount - running_sum
                else:
                    u_amt = (amount * (u_share / total_shares)).quantize(Decimal('0.01'))
                    running_sum += u_amt
                calculated_splits.append({'user_id': u_id, 'amount': u_amt, 'split_value': u_share})

        # Save updates
        with transaction.atomic():
            # Update expense
            expense.description = description
            expense.amount = amount
            expense.paid_by = paid_by
            expense.split_type = split_type
            expense.save()

            # Clear old splits and rewrite
            expense.splits.all().delete()
            for split in calculated_splits:
                u_obj = User.objects.get(id=split['user_id'])
                ExpenseSplit.objects.create(
                    expense=expense,
                    user=u_obj,
                    amount=split['amount'],
                    split_value=split['split_value']
                )

            ChatMessage.objects.create(
                expense=expense,
                user=request.user,
                message="edited this expense details."
            )

        serializer = self.get_serializer(expense)
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        try:
            expense = Expense.objects.get(id=pk, group__memberships__user=request.user)
        except Expense.DoesNotExist:
            return Response({'error': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)

        expense.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupExpenseListView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, group_id=None):
        # List all expenses in a group
        try:
            group = Group.objects.get(id=group_id, memberships__user=request.user)
        except Group.DoesNotExist:
            return Response({'error': 'Group not found.'}, status=status.HTTP_404_NOT_FOUND)

        expenses = Expense.objects.filter(group=group).order_by('-created_at')
        serializer = ExpenseSerializer(expenses, many=True)
        return Response(serializer.data)


class SettlementView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, group_id=None):
        try:
            group = Group.objects.get(id=group_id, memberships__user=request.user)
        except Group.DoesNotExist:
            return Response({'error': 'Group not found.'}, status=status.HTTP_440_NOT_FOUND)

        payer_id = request.data.get('payer_id')
        payee_id = request.data.get('payee_id')
        amount_val = request.data.get('amount')

        if not all([payer_id, payee_id, amount_val]):
            return Response({'error': 'Missing settlement details.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payer = User.objects.get(id=payer_id)
            payee = User.objects.get(id=payee_id)
            amount = Decimal(str(amount_val))
        except Exception:
            return Response({'error': 'Invalid payer, payee, or amount.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if users are in the group
        if not GroupMember.objects.filter(group=group, user=payer).exists() or \
           not GroupMember.objects.filter(group=group, user=payee).exists():
            return Response({'error': 'Both settlement users must be members of the group.'}, status=status.HTTP_400_BAD_REQUEST)

        # Record payment
        settlement = Settlement.objects.create(
            group=group,
            payer=payer,
            payee=payee,
            amount=amount,
            created_by=request.user
        )

        serializer = SettlementSerializer(settlement)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ChatMessageViewSet(viewsets.ViewSet):
    permission_classes = (permissions.IsAuthenticated,)

    def list(self, request, expense_id=None):
        # Verify expense belongs to a group the user is in
        try:
            expense = Expense.objects.get(id=expense_id, group__memberships__user=request.user)
        except Expense.DoesNotExist:
            return Response({'error': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)

        messages = ChatMessage.objects.filter(expense=expense).order_by('created_at')
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)

    def create(self, request, expense_id=None):
        try:
            expense = Expense.objects.get(id=expense_id, group__memberships__user=request.user)
        except Expense.DoesNotExist:
            return Response({'error': 'Expense not found.'}, status=status.HTTP_440_NOT_FOUND)

        message_text = request.data.get('message')
        if not message_text:
            return Response({'error': 'Message text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        chat_message = ChatMessage.objects.create(
            expense=expense,
            user=request.user,
            message=message_text
        )

        serializer = ChatMessageSerializer(chat_message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
