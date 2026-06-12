import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { DollarSign, CheckSquare, Square, Info } from 'lucide-react';

export default function ExpenseModal({ groupId, members, expenseId, onClose, onShowMessage, onSave }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState('EQUALLY');
  
  // Splits state: dictionary of { userId: split_value }
  const [splits, setSplits] = useState({});
  // For EQUALLY, dictionary of { userId: boolean } indicating if they are included
  const [includedUsers, setIncludedUsers] = useState({});
  
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Initialize splits and values
  useEffect(() => {
    if (members && members.length > 0) {
      // Set default paid_by to current user or first member
      const currentUsername = localStorage.getItem('username');
      const me = members.find(m => m.username === currentUsername);
      setPaidBy(me ? me.user : members[0].user);

      // Default: all members included in equal split
      const inc = {};
      const spl = {};
      members.forEach((m) => {
        inc[m.user] = true;
        spl[m.user] = '';
      });
      setIncludedUsers(inc);
      setSplits(spl);
    }
  }, [members]);

  // Load expense details if editing
  useEffect(() => {
    const loadExpense = async () => {
      if (!expenseId || expenseId === 'NEW') return;
      setLoading(true);
      try {
        const data = await api.expenses.get(expenseId);
        setDescription(data.description);
        setAmount(data.amount);
        setPaidBy(data.paid_by);
        setSplitType(data.split_type);
        
        const spl = {};
        const inc = {};
        members.forEach((m) => {
          inc[m.user] = false;
          spl[m.user] = '';
        });

        data.splits.forEach((s) => {
          spl[s.user] = s.split_value.toString();
          inc[s.user] = true;
        });

        setSplits(spl);
        setIncludedUsers(inc);
      } catch (err) {
        onShowMessage(err.message || 'Failed to load expense details.', 'error');
        onClose();
      } finally {
        setLoading(false);
      }
    };
    loadExpense();
  }, [expenseId, members]);

  const handleSplitValueChange = (userId, value) => {
    setSplits((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const handleToggleInclude = (userId) => {
    setIncludedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  // Compute live feedback for splits
  let splitTotalSum = 0;
  let statusInfo = '';
  let isValid = false;

  const totalAmount = parseFloat(amount) || 0;

  if (totalAmount > 0) {
    if (splitType === 'EQUALLY') {
      const activeCount = Object.values(includedUsers).filter(Boolean).length;
      if (activeCount > 0) {
        const perPerson = totalAmount / activeCount;
        statusInfo = `Each person will owe $${perPerson.toFixed(2)}`;
        isValid = true;
      } else {
        statusInfo = 'Select at least one member to split.';
        isValid = false;
      }
    } else if (splitType === 'UNEQUALLY') {
      splitTotalSum = Object.entries(splits).reduce((sum, [uid, val]) => {
        return sum + (parseFloat(val) || 0);
      }, 0);
      const diff = totalAmount - splitTotalSum;
      if (Math.abs(diff) < 0.015) {
        statusInfo = '✓ Splitting sum matches total amount!';
        isValid = true;
      } else {
        statusInfo = `Remaining: ${diff >= 0 ? '+' : '-'}$${Math.abs(diff).toFixed(2)}`;
        isValid = false;
      }
    } else if (splitType === 'PERCENTAGE') {
      splitTotalSum = Object.entries(splits).reduce((sum, [uid, val]) => {
        return sum + (parseFloat(val) || 0);
      }, 0);
      const diff = 100 - splitTotalSum;
      if (Math.abs(diff) < 0.01) {
        statusInfo = '✓ Percentages sum to 100%';
        isValid = true;
      } else {
        statusInfo = `Remaining: ${diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)}%`;
        isValid = false;
      }
    } else if (splitType === 'SHARE') {
      const totalShares = Object.entries(splits).reduce((sum, [uid, val]) => {
        return sum + (parseFloat(val) || 0);
      }, 0);
      if (totalShares > 0) {
        statusInfo = `✓ Total shares: ${totalShares.toFixed(2)}`;
        isValid = true;
      } else {
        statusInfo = 'Enter share ratio values for members.';
        isValid = false;
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() || totalAmount <= 0 || !paidBy || !isValid) {
      onShowMessage('Please review splits and fill in all fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Construct payload splits list
      const payloadSplits = [];
      if (splitType === 'EQUALLY') {
        Object.entries(includedUsers).forEach(([userId, isInc]) => {
          if (isInc) {
            payloadSplits.push({ user: parseInt(userId), split_value: 1 });
          }
        });
      } else {
        members.forEach((m) => {
          const val = parseFloat(splits[m.user]) || 0;
          if (val > 0) {
            payloadSplits.push({ user: m.user, split_value: val });
          }
        });
      }

      const payload = {
        description: description.trim(),
        amount: totalAmount,
        paid_by: parseInt(paidBy),
        split_type: splitType,
        splits: payloadSplits,
      };

      if (expenseId && expenseId !== 'NEW') {
        await api.expenses.update(expenseId, payload);
        onShowMessage('Expense updated successfully!', 'success');
      } else {
        await api.expenses.create(groupId, payload);
        onShowMessage('Expense added successfully!', 'success');
      }

      onSave();
    } catch (err) {
      onShowMessage(err.message || 'Failed to save expense.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ padding: '48px', textAlign: 'center' }}>
          Loading expense...
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ fontWeight: 600 }}>{expenseId && expenseId !== 'NEW' ? 'Edit Expense' : 'Add New Expense'}</h3>
          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Description */}
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Dinner, Groceries, Rent"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Amount and Paid By */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Amount ($)</label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--color-text-muted)' }} />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-control"
                    style={{ paddingLeft: '32px' }}
                    placeholder="0.00"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Paid By</label>
                <select
                  className="form-control"
                  required
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                >
                  <option value="" disabled>Select member</option>
                  {members.map((m) => (
                    <option key={m.user} value={m.user}>{m.username}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split Type Selector */}
            <div className="form-group">
              <label className="form-label">Split Type</label>
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px' }}>
                {['EQUALLY', 'UNEQUALLY', 'PERCENTAGE', 'SHARE'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="btn"
                    style={{
                      flex: 1,
                      fontSize: '11px',
                      padding: '6px',
                      background: splitType === type ? 'var(--color-primary)' : 'transparent',
                      color: '#fff',
                      borderRadius: '8px',
                    }}
                    onClick={() => setSplitType(type)}
                  >
                    {type.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Inputs */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', maxHeight: '220px', overflowY: 'auto', background: 'rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 600 }}>
                SPLIT DETAILS:
              </div>

              {members.map((m) => {
                if (splitType === 'EQUALLY') {
                  const isInc = !!includedUsers[m.user];
                  return (
                    <div
                      key={m.user}
                      className="split-member-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleToggleInclude(m.user)}
                    >
                      <span className="split-member-name">{m.username}</span>
                      <div className="split-member-input-wrapper">
                        {isInc ? (
                          <CheckSquare size={18} style={{ color: 'var(--color-success)' }} />
                        ) : (
                          <Square size={18} style={{ color: 'var(--color-text-dark)' }} />
                        )}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div key={m.user} className="split-member-row">
                      <span className="split-member-name">{m.username}</span>
                      <div className="split-member-input-wrapper">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          placeholder={splitType === 'PERCENTAGE' ? '%' : splitType === 'SHARE' ? 'shares' : '$'}
                          value={splits[m.user] || ''}
                          onChange={(e) => handleSplitValueChange(m.user, e.target.value)}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', width: '12px' }}>
                          {splitType === 'PERCENTAGE' ? '%' : splitType === 'SHARE' ? 'sh' : '$'}
                        </span>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* Live splitting feedback */}
            {totalAmount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', background: isValid ? 'var(--color-success-glow)' : 'var(--color-danger-glow)', border: `1px solid ${isValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`, color: isValid ? 'var(--color-success)' : 'var(--color-danger)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
                <Info size={14} />
                <span>{statusInfo}</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !isValid}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
