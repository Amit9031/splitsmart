from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Group, GroupMember, Expense, ExpenseSplit, Settlement, ChatMessage

class UserSerializer(serializers.ModelSerializer):
    password = serializers.write_only_field = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            password=validated_data['password']
        )
        return user

class GroupMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)

    class Meta:
        model = GroupMember
        fields = ('user', 'username', 'email', 'first_name', 'last_name', 'joined_at')

class GroupSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    members = GroupMemberSerializer(source='memberships', many=True, read_only=True)

    class Meta:
        model = Group
        fields = ('id', 'name', 'description', 'created_at', 'created_by', 'created_by_username', 'members')
        read_only_fields = ('created_by', 'created_at')

class ExpenseSplitSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ExpenseSplit
        fields = ('user', 'username', 'amount', 'split_value')

class ExpenseSerializer(serializers.ModelSerializer):
    paid_by_username = serializers.CharField(source='paid_by.username', read_only=True)
    splits = ExpenseSplitSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = ('id', 'group', 'description', 'amount', 'paid_by', 'paid_by_username', 'split_type', 'created_at', 'splits')
        read_only_fields = ('created_by', 'created_at')

class SettlementSerializer(serializers.ModelSerializer):
    payer_username = serializers.CharField(source='payer.username', read_only=True)
    payee_username = serializers.CharField(source='payee.username', read_only=True)

    class Meta:
        model = Settlement
        fields = ('id', 'group', 'payer', 'payer_username', 'payee', 'payee_username', 'amount', 'created_at', 'created_by')
        read_only_fields = ('created_by', 'created_at')

class ChatMessageSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'expense', 'user', 'username', 'message', 'created_at')
        read_only_fields = ('user', 'created_at')
