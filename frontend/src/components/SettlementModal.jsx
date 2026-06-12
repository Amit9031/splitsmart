import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { DollarSign, ArrowRight } from 'lucide-react';

export default function SettlementModal({ groupId, members, prefilled, onClose, onShowMessage, onSave }) {
  const [payerId, setPayerId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (prefilled) {
      setPayerId(prefilled.from_user_id.toString());
      setPayeeId(prefilled.to_user_id.toString());
      setAmount(prefilled.amount.toFixed(2));
    } else if (members && members.length > 1) {
      // Prefill payer as current user, payee as another member
      const currentUsername = localStorage.getItem('username');
      const me = members.find(m => m.username === currentUsername);
      const other = members.find(m => m.username !== currentUsername);
      
      setPayerId(me ? me.user.toString() : members[0].user.toString());
      setPayeeId(other ? other.user.toString() : members[1].user.toString());
    }
  }, [prefilled, members]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    
    if (!payerId || !payeeId || amt <= 0) {
      onShowMessage('Please select both members and enter a positive payment amount.', 'error');
      return;
    }

    if (payerId === payeeId) {
      onShowMessage('Payer and Payee cannot be the same person.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.settlements.create(groupId, parseInt(payerId), parseInt(payeeId), amt);
      onShowMessage('Payment settlement recorded successfully!', 'success');
      onSave();
    } catch (err) {
      onShowMessage(err.message || 'Failed to record settlement.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const payerName = members.find(m => m.user.toString() === payerId)?.username || 'payer';
  const payeeName = members.find(m => m.user.toString() === payeeId)?.username || 'payee';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3 style={{ fontWeight: 600 }}>Settle Up / Record Payment</h3>
          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Payer and Payee selectors */}
            <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Who Paid?</label>
                <select
                  className="form-control"
                  required
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                >
                  <option value="" disabled>Select member</option>
                  {members.map((m) => (
                    <option key={m.user} value={m.user}>{m.username}</option>
                  ))}
                </select>
              </div>

              <div style={{ padding: '24px 0 0 0', color: 'var(--color-text-muted)' }}>
                <ArrowRight size={18} />
              </div>

              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Who Received?</label>
                <select
                  className="form-control"
                  required
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value)}
                >
                  <option value="" disabled>Select member</option>
                  {members.map((m) => (
                    <option key={m.user} value={m.user}>{m.username}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div className="form-group">
              <label className="form-label">Payment Amount ($)</label>
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

            {/* Summary description preview */}
            {payerId && payeeId && amt > 0 && (
              <div style={{ marginTop: '16px', background: 'var(--color-success-glow)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--color-success)', padding: '12px', borderRadius: '8px', fontSize: '13px', textAlign: 'center', fontWeight: 500 }}>
                <strong>{payerName}</strong> paid <strong>{payeeName}</strong> <strong>${amt.toFixed(2)}</strong> in cash.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
