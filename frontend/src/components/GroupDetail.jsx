import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Users, Plus, ArrowLeft, Trash2, UserPlus, DollarSign, MessageSquare, ShieldAlert } from 'lucide-react';

export default function GroupDetail({ groupId, onBack, onShowMessage, onSelectExpense, triggerRefresh }) {
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removingMember, setRemovingMember] = useState(null);

  // Modal Control States
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [prefilledSettlement, setPrefilledSettlement] = useState(null);

  const currentUsername = localStorage.getItem('username');

  const fetchGroupDetails = async () => {
    try {
      const data = await api.groups.get(groupId);
      setGroup(data);
      const exps = await api.expenses.list(groupId);
      setExpenses(exps);
    } catch (err) {
      onShowMessage(err.message || 'Failed to fetch group details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId, triggerRefresh]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!inviteQuery.trim()) return;
    setInviting(true);
    try {
      await api.groups.addMember(groupId, inviteQuery.trim());
      setInviteQuery('');
      onShowMessage('Member added successfully!', 'success');
      fetchGroupDetails();
    } catch (err) {
      onShowMessage(err.message || 'Failed to add member.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId, username) => {
    if (!confirm(`Are you sure you want to remove ${username} from the group?`)) return;
    setRemovingMember(userId);
    try {
      await api.groups.removeMember(groupId, userId);
      onShowMessage(`Removed ${username} from the group.`, 'success');
      fetchGroupDetails();
    } catch (err) {
      onShowMessage(err.message || 'Failed to remove member.', 'error');
    } finally {
      setRemovingMember(null);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>Loading group details...</div>;
  }

  if (!group) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '48px' }}>
        <h3 className="balance-negative">Group not found</h3>
        <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={onBack}>Back to Dashboard</button>
      </div>
    );
  }

  // Find user's balance
  const myBalanceInfo = group.balances?.find(b => b.username === currentUsername);
  const myNetBalance = myBalanceInfo ? myBalanceInfo.net_balance : 0;

  return (
    <div>
      {/* Back Button and Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 700 }}>{group.name}</h2>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{group.description || 'No description'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Actions and Transactions log */}
        <div>
          {/* Main action buttons */}
          <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', padding: '16px' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block' }}>YOUR BALANCE IN GROUP</span>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold' }} className={myNetBalance > 0.005 ? 'balance-positive' : myNetBalance < -0.005 ? 'balance-negative' : 'balance-neutral'}>
                {myNetBalance > 0.005 ? `You are owed $${myNetBalance.toFixed(2)}` : myNetBalance < -0.005 ? `You owe $${Math.abs(myNetBalance).toFixed(2)}` : 'You are settled up'}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button className="btn btn-success" onClick={() => onSelectExpense('NEW')}>
                <Plus size={16} /> Add Expense
              </button>
              <button className="btn btn-primary" onClick={() => {
                setPrefilledSettlement(null);
                onSelectExpense('SETTLE');
              }}>
                <DollarSign size={16} /> Settle Up
              </button>
            </div>
          </div>

          {/* Activity Log / Transactions */}
          <div className="glass-panel" style={{ minHeight: '300px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Group Expenses & Activity</h3>
            {expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--color-text-muted)' }}>
                <DollarSign size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ fontSize: '14px' }}>No activity in this group yet.</p>
              </div>
            ) : (
              <div className="activity-list">
                {expenses.map((exp) => {
                  const mySplit = exp.splits?.find(s => s.username === currentUsername);
                  const didIPay = exp.paid_by_username === currentUsername;
                  
                  // How much U owed vs paid
                  let balanceText = '';
                  let balanceClass = 'balance-neutral';
                  
                  if (didIPay) {
                    const totalOwedToMe = exp.amount - (mySplit ? mySplit.amount : 0);
                    balanceText = totalOwedToMe > 0.005 ? `you lent $${totalOwedToMe.toFixed(2)}` : 'you split equally';
                    balanceClass = 'balance-positive';
                  } else if (mySplit) {
                    balanceText = `you owe $${mySplit.amount.toFixed(2)}`;
                    balanceClass = 'balance-negative';
                  } else {
                    balanceText = 'not involved';
                  }

                  return (
                    <div
                      key={exp.id}
                      className="activity-item"
                      onClick={() => onSelectExpense(exp.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Avatar representation */}
                        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px', border: '1px solid var(--border-color)' }}>
                          {exp.description[0].toUpperCase()}
                        </div>
                        <div>
                          <span style={{ fontSize: '15px', fontWeight: 600, display: 'block' }}>{exp.description}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            Paid by <strong style={{ color: 'var(--color-text-main)' }}>{exp.paid_by_username}</strong> • {new Date(exp.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', display: 'block' }}>${parseFloat(exp.amount).toFixed(2)}</span>
                          <span style={{ fontSize: '11px' }} className={balanceClass}>{balanceText}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(59,130,246,0.1)', color: 'var(--color-primary)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                          <MessageSquare size={10} /> Chat
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Balances, Settlements, Members */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Members Panel */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} /> Members ({group.members?.length || 0})
            </h3>
            
            {/* Invite Form */}
            <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                className="form-control"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                placeholder="Username or email..."
                required
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px' }} disabled={inviting}>
                <UserPlus size={14} />
              </button>
            </form>

            {/* Members List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.members?.map((m) => (
                <div key={m.user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 500, display: 'block' }}>
                      {m.username} {m.username === currentUsername && <span style={{ color: 'var(--color-primary)', fontSize: '10px' }}>(you)</span>}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{m.email}</span>
                  </div>
                  {m.username !== group.created_by_username && m.username !== currentUsername && (
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', borderRadius: '6px' }}
                      disabled={removingMember === m.user}
                      onClick={() => handleRemoveMember(m.user, m.username)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Group-wise Balance Sheet */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Group Balance Sheet</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {group.balances?.map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                  <span style={{ fontWeight: 500 }}>{b.username}</span>
                  <span className={b.net_balance > 0.005 ? 'balance-positive' : b.net_balance < -0.005 ? 'balance-negative' : 'balance-neutral'} style={{ fontWeight: 'bold' }}>
                    {b.net_balance > 0.005 ? `+ $${b.net_balance.toFixed(2)}` : b.net_balance < -0.005 ? `- $${Math.abs(b.net_balance).toFixed(2)}` : '$0.00'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Debt Simplification Panel */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Suggested Settlements</h3>
            {group.simplified_debts?.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 500, display: 'flex', gap: '4px', alignItems: 'center' }}>
                ✓ Everyone is settled up!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {group.simplified_debts?.map((debt, index) => (
                  <div key={index} className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                      <strong>{debt.from_username}</strong> owes <strong>{debt.to_username}</strong> <span className="balance-negative" style={{ fontWeight: 'bold' }}>${debt.amount.toFixed(2)}</span>
                    </div>
                    {/* Settle shortcut button */}
                    {(debt.from_username === currentUsername || debt.to_username === currentUsername) && (
                      <button
                        className="btn btn-success"
                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', alignSelf: 'flex-start' }}
                        onClick={() => {
                          setPrefilledSettlement(debt);
                          onSelectExpense('SETTLE');
                        }}
                      >
                        Record Payment
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
