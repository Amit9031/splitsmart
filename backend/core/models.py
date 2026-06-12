from django.db import models
from django.contrib.auth.models import User

class Group(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_groups')

    def __str__(self):
        return self.name

class GroupMember(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='group_memberships')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('group', 'user')

    def __str__(self):
        return f"{self.user.username} in {self.group.name}"

class Expense(models.Model):
    SPLIT_TYPES = (
        ('EQUALLY', 'Equally'),
        ('UNEQUALLY', 'Unequally'),
        ('PERCENTAGE', 'Percentage'),
        ('SHARE', 'Share'),
    )
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='expenses')
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='paid_expenses')
    split_type = models.CharField(max_length=15, choices=SPLIT_TYPES)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_expenses')

    def __str__(self):
        return f"{self.description} - ${self.amount}"

class ExpenseSplit(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='splits')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='splits')
    amount = models.DecimalField(max_digits=10, decimal_places=2)  # The calculated share of debt
    split_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True) # Percent, share ratio, or raw amount

    class Meta:
        unique_together = ('expense', 'user')

    def __str__(self):
        return f"{self.user.username} owes ${self.amount} for {self.expense.description}"

class Settlement(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='settlements')
    payer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='paid_settlements')
    payee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_settlements')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recorded_settlements')

    def __str__(self):
        return f"{self.payer.username} paid ${self.amount} to {self.payee.username}"

class ChatMessage(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='messages')
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}: {self.message[:20]}"

class EmailOTP(models.Model):
    email = models.EmailField(unique=True)
    otp = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"OTP for {self.email}: {self.otp}"

    def is_expired(self):
        from django.utils import timezone
        import datetime
        return timezone.now() > self.created_at + datetime.timedelta(minutes=10)

