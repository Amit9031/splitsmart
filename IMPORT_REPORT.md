# Import Report - Expense CSV Ingestion

This report summarizes the results of the CSV expense ingestion, including validation checks, anomalies detected, and automatic corrections applied.

## 📈 Ingestion Statistics
- **Source File**: `../sample_expenses.csv`
- **Total Rows Evaluated**: 9
- **Successfully Imported**: 6
- **Skipped / Failed**: 3
- **Anomalies Detected**: 9

## ⚠️ Anomalies and Resolutions Log

| Row | Transaction Description | Anomaly Type | Severity | Description / Error Message | Action Taken |
|---|---|---|---|---|---|
| 1 | Row 1 (Dinner equally split) | Missing Group | `LOW` | Group 'Trip' did not exist. Auto-created group with creator 'amitranjan6458@gmail.com'. | Auto-created group |
| 2 | Row 2 (Taxi rounding cents) | Orphan Split Member | `MEDIUM` | User 'testuser@example.com' was split in but was not in group 'Trip'. Auto-added member to group. | Added user to group |
| 2 | Row 2 (Taxi rounding cents) | Orphan Split Member | `MEDIUM` | User 'otheruser@example.com' was split in but was not in group 'Trip'. Auto-added member to group. | Added user to group |
| 2 | Row 2 (Taxi rounding cents) | Rounding Cent Discrepancy | `LOW` | Equal split division left a remainder of $0.01. Added remainder to last member 'otheruser@example.com'. | Allocated cent remainder |
| 3 | Row 3 (Lunch percentage anomaly) | Validation Error | `HIGH` | Percentages sum to 99.00%, expected exactly 100.00%. | Row Skipped / Rolled Back |
| 5 | Row 5 (Groceries unequal anomaly) | Validation Error | `HIGH` | Unequal splits sum to $190.00, expected exactly total amount $200.00. | Row Skipped / Rolled Back |
| 8 | Row 8 (Orphan payer) | Validation Error | `HIGH` | Payer email 'nonexistent@example.com' does not exist in database. | Row Skipped / Rolled Back |
| 9 | Row 9 (Orphan member auto-add) | Missing Group | `LOW` | Group 'SkiTrip' did not exist. Auto-created group with creator 'amitranjan6458@gmail.com'. | Auto-created group |
| 9 | Row 9 (Orphan member auto-add) | Orphan Split Member | `MEDIUM` | User 'newmember@example.com' was split in but was not in group 'SkiTrip'. Auto-added member to group. | Added user to group |

---
*Produced automatically by SplitSmart CSV Ingestion Engine.*
