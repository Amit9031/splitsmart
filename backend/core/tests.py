from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from decimal import Decimal
from .models import Group, GroupMember, Expense, ExpenseSplit, Settlement, ChatMessage, EmailOTP

class SplitwiseCloneTests(APITestCase):

    def setUp(self):
        # Create users
        self.user1 = User.objects.create_user(username='alice', email='alice@example.com', password='password123')
        self.user2 = User.objects.create_user(username='bob', email='bob@example.com', password='password123')
        self.user3 = User.objects.create_user(username='charlie', email='charlie@example.com', password='password123')

        # Get JWT tokens
        response = self.client.post(reverse('token-obtain-pair'), {'username': 'alice', 'password': 'password123'})
        self.alice_token = response.data['access']
        
        response = self.client.post(reverse('token-obtain-pair'), {'username': 'bob', 'password': 'password123'})
        self.bob_token = response.data['access']

    def set_auth_alice(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.alice_token}')

    def set_auth_bob(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.bob_token}')

    def test_user_registration(self):
        url = reverse('auth-register')
        data = {
            'username': 'dave',
            'email': 'dave@example.com',
            'password': 'password123',
            'first_name': 'Dave',
            'last_name': 'Smith'
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.filter(username='dave').count(), 1)

    def test_group_creation_and_member_management(self):
        self.set_auth_alice()
        url = reverse('groups-list')
        
        # 1. Create group
        data = {'name': 'Ski Trip', 'description': 'Weekend ski trip'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        group_id = response.data['id']
        
        # Verify Alice is automatically a member
        group = Group.objects.get(id=group_id)
        self.assertTrue(GroupMember.objects.filter(group=group, user=self.user1).exists())
        
        # 2. Add Bob to group
        add_url = reverse('groups-add-member', kwargs={'pk': group_id})
        response = self.client.post(add_url, {'query': 'bob'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(GroupMember.objects.filter(group=group, user=self.user2).exists())

        # 3. Add Bob again (should fail)
        response = self.client.post(add_url, {'query': 'bob'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Remove Bob (should succeed since balance is 0)
        remove_url = reverse('groups-remove-member', kwargs={'pk': group_id})
        response = self.client.post(remove_url, {'user_id': self.user2.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(GroupMember.objects.filter(group=group, user=self.user2).exists())

    def test_expense_splits_equally(self):
        self.set_auth_alice()
        # Create group and add Bob
        group = Group.objects.create(name='Ski Trip', created_by=self.user1)
        GroupMember.objects.create(group=group, user=self.user1)
        GroupMember.objects.create(group=group, user=self.user2)

        url = reverse('group-expenses-create', kwargs={'group_id': group.id})
        data = {
            'description': 'Dinner',
            'amount': 100.00,
            'paid_by': self.user1.id,
            'split_type': 'EQUALLY',
            'splits': [
                {'user': self.user1.id},
                {'user': self.user2.id}
            ]
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify expense and splits created correctly
        expense = Expense.objects.get(id=response.data['id'])
        self.assertEqual(expense.amount, Decimal('100.00'))
        self.assertEqual(expense.splits.count(), 2)
        
        split1 = expense.splits.get(user=self.user1)
        split2 = expense.splits.get(user=self.user2)
        self.assertEqual(split1.amount, Decimal('50.00'))
        self.assertEqual(split2.amount, Decimal('50.00'))

    def test_expense_splits_unequally(self):
        self.set_auth_alice()
        group = Group.objects.create(name='Ski Trip', created_by=self.user1)
        GroupMember.objects.create(group=group, user=self.user1)
        GroupMember.objects.create(group=group, user=self.user2)

        url = reverse('group-expenses-create', kwargs={'group_id': group.id})
        data = {
            'description': 'Groceries',
            'amount': 80.00,
            'paid_by': self.user1.id,
            'split_type': 'UNEQUALLY',
            'splits': [
                {'user': self.user1.id, 'split_value': 30.00},
                {'user': self.user2.id, 'split_value': 50.00}
            ]
        }
        # Correct split sum matches 80.00
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Incorrect split sum (should fail)
        data['splits'][1]['split_value'] = 45.00
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expense_splits_percentage(self):
        self.set_auth_alice()
        group = Group.objects.create(name='Ski Trip', created_by=self.user1)
        GroupMember.objects.create(group=group, user=self.user1)
        GroupMember.objects.create(group=group, user=self.user2)

        url = reverse('group-expenses-create', kwargs={'group_id': group.id})
        data = {
            'description': 'Lodging',
            'amount': 150.00,
            'paid_by': self.user1.id,
            'split_type': 'PERCENTAGE',
            'splits': [
                {'user': self.user1.id, 'split_value': 40.00},  # 40% -> 60.00
                {'user': self.user2.id, 'split_value': 60.00}   # 60% -> 90.00
            ]
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        expense = Expense.objects.get(id=response.data['id'])
        split1 = expense.splits.get(user=self.user1)
        split2 = expense.splits.get(user=self.user2)
        self.assertEqual(split1.amount, Decimal('60.00'))
        self.assertEqual(split2.amount, Decimal('90.00'))

    def test_group_balances_and_debt_simplification(self):
        self.set_auth_alice()
        # Scenario:
        # Alice, Bob, and Charlie are in a group.
        # Alice pays $90 for Dinner, split equally ($30 each). Alice: +60, Bob: -30, Charlie: -30.
        # Bob pays $60 for Taxi, split equally ($20 each). Alice: -20, Bob: +40, Charlie: -20.
        # Net balances:
        # Alice: +60 (paid) - 30 (Dinner owe) - 20 (Taxi owe) = +40
        # Bob: +60 (paid) - 30 (Dinner owe) - 20 (Taxi owe) = +10
        # Charlie: 0 (paid) - 30 (Dinner owe) - 20 (Taxi owe) = -50
        # Simplified Debts:
        # Charlie owes Alice $40
        # Charlie owes Bob $10
        
        group = Group.objects.create(name='Trip', created_by=self.user1)
        GroupMember.objects.create(group=group, user=self.user1)
        GroupMember.objects.create(group=group, user=self.user2)
        GroupMember.objects.create(group=group, user=self.user3)

        # Alice pays Dinner $90
        self.client.post(reverse('group-expenses-create', kwargs={'group_id': group.id}), {
            'description': 'Dinner', 'amount': 90.00, 'paid_by': self.user1.id, 'split_type': 'EQUALLY',
            'splits': [{'user': self.user1.id}, {'user': self.user2.id}, {'user': self.user3.id}]
        }, format='json')

        # Bob pays Taxi $60
        self.client.post(reverse('group-expenses-create', kwargs={'group_id': group.id}), {
            'description': 'Taxi', 'amount': 60.00, 'paid_by': self.user2.id, 'split_type': 'EQUALLY',
            'splits': [{'user': self.user1.id}, {'user': self.user2.id}, {'user': self.user3.id}]
        }, format='json')

        # Get group details to verify balances and simplified debts
        response = self.client.get(reverse('groups-detail', kwargs={'pk': group.id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check balances
        balances = response.data['balances']
        alice_bal = next(b for b in balances if b['username'] == 'alice')
        bob_bal = next(b for b in balances if b['username'] == 'bob')
        charlie_bal = next(b for b in balances if b['username'] == 'charlie')

        self.assertEqual(alice_bal['net_balance'], 40.00)
        self.assertEqual(bob_bal['net_balance'], 10.00)
        self.assertEqual(charlie_bal['net_balance'], -50.00)

        # Check debt simplification
        debts = response.data['simplified_debts']
        self.assertEqual(len(debts), 2)
        
        d1 = next(d for d in debts if d['to_username'] == 'alice')
        d2 = next(d for d in debts if d['to_username'] == 'bob')
        
        self.assertEqual(d1['from_username'], 'charlie')
        self.assertEqual(d1['amount'], 40.00)
        
        self.assertEqual(d2['from_username'], 'charlie')
        self.assertEqual(d2['amount'], 10.00)

    def test_settlements_and_member_removal_validation(self):
        self.set_auth_alice()
        group = Group.objects.create(name='Trip', created_by=self.user1)
        GroupMember.objects.create(group=group, user=self.user1)
        GroupMember.objects.create(group=group, user=self.user2)

        # Alice pays Dinner $100 split equally
        self.client.post(reverse('group-expenses-create', kwargs={'group_id': group.id}), {
            'description': 'Dinner', 'amount': 100.00, 'paid_by': self.user1.id, 'split_type': 'EQUALLY',
            'splits': [{'user': self.user1.id}, {'user': self.user2.id}]
        }, format='json')

        # Try to remove Bob (should fail since Bob owes $50)
        remove_url = reverse('groups-remove-member', kwargs={'pk': group.id})
        response = self.client.post(remove_url, {'user_id': self.user2.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Bob pays Alice $50 to settle
        settle_url = reverse('group-settle', kwargs={'group_id': group.id})
        response = self.client.post(settle_url, {'payer_id': self.user2.id, 'payee_id': self.user1.id, 'amount': 50.00})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Now try to remove Bob (should succeed since balance is 0)
        response = self.client.post(remove_url, {'user_id': self.user2.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_otp_authentication_flow(self):
        # 1. Send OTP
        send_url = reverse('send-otp')
        response = self.client.post(send_url, {'email': 'testuser@example.com'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify EmailOTP record exists in database
        otp_record = EmailOTP.objects.get(email='testuser@example.com')
        self.assertIsNotNone(otp_record.otp)
        self.assertEqual(len(otp_record.otp), 6)

        # 2. Verify with incorrect OTP (should fail)
        verify_url = reverse('verify-otp')
        response = self.client.post(verify_url, {'email': 'testuser@example.com', 'otp': '000000'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Verify with correct OTP (should succeed and register the user automatically)
        response = self.client.post(verify_url, {'email': 'testuser@example.com', 'otp': otp_record.otp})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check tokens returned
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['username'], 'testuser')
        
        # Verify user created in DB
        self.assertTrue(User.objects.filter(email='testuser@example.com').exists())

        # 4. Verify OTP record is deleted after success
        self.assertFalse(EmailOTP.objects.filter(email='testuser@example.com').exists())

