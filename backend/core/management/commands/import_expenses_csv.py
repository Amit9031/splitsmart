import csv
import decimal
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from core.models import Group, GroupMember, Expense, ExpenseSplit

class Command(BaseCommand):
    help = 'Ingests a CSV of expenses, detects anomalies, applies corrections, and writes an Import Report.'

    def add_arguments(self, parser):
        parser.add_argument('csv_path', type=str, help='Path to the CSV file to ingest')
        parser.add_argument('--report_path', type=str, default='../IMPORT_REPORT.md', help='Output path for the import report')

    def handle(self, *args, **options):
        csv_path = options['csv_path']
        report_path = options['report_path']

        self.stdout.write(f"Starting ingestion of CSV: {csv_path}...")

        total_rows = 0
        successful_imports = 0
        anomalies_detected = []

        try:
            with open(csv_path, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Check headers
                required_headers = ['group_name', 'description', 'amount', 'paid_by_email', 'split_type', 'split_members_emails', 'split_values']
                for header in required_headers:
                    if header not in reader.fieldnames:
                        self.stderr.write(f"Missing required header: {header}")
                        return

                for row_idx, row in enumerate(reader, start=1):
                    total_rows += 1
                    row_desc = f"Row {row_idx} ({row.get('description', 'No Description')})"
                    
                    try:
                        with transaction.atomic():
                            # 1. Parse and validate base fields
                            group_name = row['group_name'].strip()
                            description = row['description'].strip()
                            amount_str = row['amount'].strip()
                            paid_by_email = row['paid_by_email'].strip()
                            split_type = row['split_type'].strip().upper()
                            split_emails = [e.strip() for e in row['split_members_emails'].split(',') if e.strip()]
                            split_vals_str = [v.strip() for v in row['split_values'].split(',') if v.strip()]

                            if not group_name or not description or not amount_str or not paid_by_email or not split_type:
                                raise ValueError("Empty required fields.")

                            try:
                                amount = decimal.Decimal(amount_str)
                            except decimal.InvalidOperation:
                                raise ValueError(f"Invalid decimal amount: '{amount_str}'")

                            if amount <= 0:
                                raise ValueError(f"Expense amount must be positive: {amount}")

                            # 2. Get paid_by user first (required to specify creator of a new group)
                            payer = User.objects.filter(email=paid_by_email).first()
                            if not payer:
                                raise ValueError(f"Payer email '{paid_by_email}' does not exist in database.")

                            # 3. Get or create group
                            group, created_group = Group.objects.get_or_create(
                                name=group_name,
                                defaults={'created_by': payer}
                            )
                            if created_group:
                                anomalies_detected.append({
                                    'row': row_idx,
                                    'description': row_desc,
                                    'type': 'Missing Group',
                                    'severity': 'LOW',
                                    'message': f"Group '{group_name}' did not exist. Auto-created group with creator '{payer.email}'.",
                                    'action': 'Auto-created group'
                                })

                            # Ensure payer is a member of the group
                            GroupMember.objects.get_or_create(group=group, user=payer)

                            # 4. Get/Validate split members
                            split_users = []
                            for email in split_emails:
                                user = User.objects.filter(email=email).first()
                                if not user:
                                    raise ValueError(f"Split member email '{email}' does not exist in database.")
                                split_users.append(user)
                                # Auto-add member to group if not already there
                                member_rec, created_member = GroupMember.objects.get_or_create(group=group, user=user)
                                if created_member:
                                    anomalies_detected.append({
                                        'row': row_idx,
                                        'description': row_desc,
                                        'type': 'Orphan Split Member',
                                        'severity': 'MEDIUM',
                                        'message': f"User '{email}' was split in but was not in group '{group_name}'. Auto-added member to group.",
                                        'action': 'Added user to group'
                                    })

                            if not split_users:
                                raise ValueError("No valid split members specified.")

                            # 5. Calculate splits and check math anomalies
                            calculated_splits = [] # list of (user, amount, split_value)

                            if split_type == 'EQUALLY':
                                # Equal split validation
                                num_members = len(split_users)
                                base_split = (amount / num_members).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_DOWN)
                                sum_splits = base_split * num_members
                                diff = amount - sum_splits

                                for idx, user in enumerate(split_users):
                                    user_split = base_split
                                    if idx == num_members - 1: # Last user gets the remainder
                                        user_split += diff
                                        if diff != 0:
                                            anomalies_detected.append({
                                                'row': row_idx,
                                                'description': row_desc,
                                                'type': 'Rounding Cent Discrepancy',
                                                'severity': 'LOW',
                                                'message': f"Equal split division left a remainder of ${diff}. Added remainder to last member '{user.email}'.",
                                                'action': 'Allocated cent remainder'
                                            })
                                    calculated_splits.append((user, user_split, decimal.Decimal('0.00')))

                            elif split_type == 'PERCENTAGE':
                                if len(split_users) != len(split_vals_str):
                                    raise ValueError("Count of split percentages does not match split members count.")
                                
                                percents = [decimal.Decimal(p) for p in split_vals_str]
                                sum_percents = sum(percents)
                                if sum_percents != decimal.Decimal('100.00'):
                                    raise ValueError(f"Percentages sum to {sum_percents}%, expected exactly 100.00%.")

                                for user, percent in zip(split_users, percents):
                                    user_split = (amount * (percent / decimal.Decimal('100.00'))).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
                                    calculated_splits.append((user, user_split, percent))

                                # Verify final sum and adjust rounding if necessary
                                sum_calc = sum(item[1] for item in calculated_splits)
                                if sum_calc != amount:
                                    diff = amount - sum_calc
                                    last_user, last_amount, last_pct = calculated_splits[-1]
                                    calculated_splits[-1] = (last_user, last_amount + diff, last_pct)
                                    anomalies_detected.append({
                                        'row': row_idx,
                                        'description': row_desc,
                                        'type': 'Percentage Rounding Cent',
                                        'severity': 'LOW',
                                        'message': f"Percentage rounding left a remainder of ${diff}. Adjusted last member '{last_user.email}'.",
                                        'action': 'Adjusted rounding remainder'
                                    })

                            elif split_type == 'UNEQUALLY':
                                if len(split_users) != len(split_vals_str):
                                    raise ValueError("Count of unequal split values does not match split members count.")
                                
                                vals = [decimal.Decimal(v) for v in split_vals_str]
                                sum_vals = sum(vals)
                                if sum_vals != amount:
                                    raise ValueError(f"Unequal splits sum to ${sum_vals}, expected exactly total amount ${amount}.")

                                for user, val in zip(split_users, vals):
                                    calculated_splits.append((user, val, val))

                            elif split_type == 'SHARE':
                                if len(split_users) != len(split_vals_str):
                                    raise ValueError("Count of shares does not match split members count.")
                                
                                shares = [decimal.Decimal(s) for s in split_vals_str]
                                total_shares = sum(shares)
                                if total_shares <= 0:
                                    raise ValueError("Total shares must be positive.")

                                for user, share in zip(split_users, shares):
                                    user_split = (amount * (share / total_shares)).quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
                                    calculated_splits.append((user, user_split, share))

                                # Verify final sum and adjust rounding if necessary
                                sum_calc = sum(item[1] for item in calculated_splits)
                                if sum_calc != amount:
                                    diff = amount - sum_calc
                                    last_user, last_amount, last_share = calculated_splits[-1]
                                    calculated_splits[-1] = (last_user, last_amount + diff, last_share)
                                    anomalies_detected.append({
                                        'row': row_idx,
                                        'description': row_desc,
                                        'type': 'Share Rounding Cent',
                                        'severity': 'LOW',
                                        'message': f"Proportional shares rounding left a remainder of ${diff}. Adjusted last member '{last_user.email}'.",
                                        'action': 'Adjusted rounding remainder'
                                    })
                            else:
                                raise ValueError(f"Unknown split type: '{split_type}'")

                            # 6. Create Expense and Splits in DB
                            expense = Expense.objects.create(
                                group=group,
                                description=description,
                                amount=amount,
                                paid_by=payer,
                                split_type=split_type,
                                created_by=payer
                            )

                            for user, split_amount, split_val in calculated_splits:
                                ExpenseSplit.objects.create(
                                    expense=expense,
                                    user=user,
                                    amount=split_amount,
                                    split_value=split_val
                                )
                            successful_imports += 1

                    except ValueError as err:
                        anomalies_detected.append({
                            'row': row_idx,
                            'description': row_desc,
                            'type': 'Validation Error',
                            'severity': 'HIGH',
                            'message': str(err),
                            'action': 'Row Skipped / Rolled Back'
                        })

        except FileNotFoundError:
            self.stderr.write(f"CSV file not found at {csv_path}")
            return

        # Write the report
        self.write_report(report_path, csv_path, total_rows, successful_imports, anomalies_detected)
        self.stdout.write(f"CSV Ingestion complete. Successfully imported {successful_imports}/{total_rows} expenses. Report saved to {report_path}")

    def write_report(self, report_path, csv_path, total, success, anomalies):
        with open(report_path, mode='w', encoding='utf-8') as r:
            r.write("# Import Report - Expense CSV Ingestion\n\n")
            r.write("This report summarizes the results of the CSV expense ingestion, including validation checks, anomalies detected, and automatic corrections applied.\n\n")
            
            r.write("## 📈 Ingestion Statistics\n")
            r.write(f"- **Source File**: `{csv_path}`\n")
            r.write(f"- **Total Rows Evaluated**: {total}\n")
            r.write(f"- **Successfully Imported**: {success}\n")
            r.write(f"- **Skipped / Failed**: {total - success}\n")
            r.write(f"- **Anomalies Detected**: {len(anomalies)}\n\n")

            r.write("## ⚠️ Anomalies and Resolutions Log\n\n")
            if not anomalies:
                r.write("No anomalies were detected. All transactions were clean and imported successfully.\n")
            else:
                r.write("| Row | Transaction Description | Anomaly Type | Severity | Description / Error Message | Action Taken |\n")
                r.write("|---|---|---|---|---|---|\n")
                for item in anomalies:
                    r.write(f"| {item['row']} | {item['description']} | {item['type']} | `{item['severity']}` | {item['message']} | {item['action']} |\n")
            
            r.write("\n---\n")
            r.write("*Produced automatically by SplitSmart CSV Ingestion Engine.*\n")
