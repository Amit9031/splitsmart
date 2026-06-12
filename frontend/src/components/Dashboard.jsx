import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Users, Plus, DollarSign, Calendar, ArrowRight, BookOpen } from 'lucide-react';

export default function Dashboard({ onSelectGroup, onShowMessage }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Overall Summary Metrics across all groups
  const [overallOwed, setOverallOwed] = useState(0);
  const [overallOwe, setOverallOwe] = useState(0);

  const fetchGroups = async () => {
    try {
      const data = await api.groups.list();
      setGroups(data);
      
      // Compute overall dashboard balances across all groups
      let totalOwed = 0;
      let totalOwe = 0;
      
      for (const gp of data) {
        // Query detailed info for each group to fetch user's personal balance in that group
        try {
          const detail = await api.groups.get(gp.id);
          const currentUsername = localStorage.getItem('username');
          const myBalInfo = detail.balances.find(b => b.username === currentUsername);
          if (myBalInfo) {
            const net = myBalInfo.net_balance;
            if (net > 0) {
              totalOwed += net;
            } else if (net < 0) {
              totalOwe += Math.abs(net);
            }
          }
        } catch (e) {
          // Ignore failed individual balance fetches
        }
      }
      setOverallOwed(totalOwed);
      setOverallOwe(totalOwe);
    } catch (err) {
      onShowMessage(err.message || 'Failed to load groups.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setSubmitting(true);
    try {
      await api.groups.create(newGroupName.trim(), newGroupDesc.trim());
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateForm(false);
      onShowMessage('Group created successfully!', 'success');
      fetchGroups();
    } catch (err) {
      onShowMessage(err.message || 'Failed to create group.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const netBalance = overallOwed - overallOwe;

  return (
    <div>
      {/* Balances Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '12px', color: 'var(--color-primary)' }}>
            <DollarSign size={28} />
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'block', fontWeight: 500 }}>Total Net Balance</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }} className={netBalance > 0.005 ? 'balance-positive' : netBalance < -0.005 ? 'balance-negative' : 'balance-neutral'}>
              {netBalance >= 0 ? `+$${netBalance.toFixed(2)}` : `-$${Math.abs(netBalance).toFixed(2)}`}
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '12px', color: 'var(--color-success)' }}>
            <DollarSign size={28} />
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'block', fontWeight: 500 }}>You are owed</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }} className="balance-positive">
              ${overallOwed.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '16px', borderRadius: '12px', color: 'var(--color-danger)' }}>
            <DollarSign size={28} />
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'block', fontWeight: 500 }}>You owe</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }} className="balance-negative">
              ${overallOwe.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Header section with Create Group Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 600 }}>Your Groups</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
          <Plus size={16} /> Create Group
        </button>
      </div>

      {/* Create Group Modal/Overlay */}
      {showCreateForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: 600 }}>Create New Group</h3>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setShowCreateForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Group Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Apartment, Road Trip"
                    required
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="form-control"
                    placeholder="Brief details..."
                    style={{ minHeight: '80px', resize: 'vertical' }}
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List of Groups */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '48px', borderStyle: 'dashed' }}>
          <Users size={40} style={{ color: 'var(--color-text-dark)', marginBottom: '12px' }} />
          <h3 style={{ marginBottom: '8px' }}>No groups yet</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '20px' }}>
            Get started by creating a group to split bills with friends.
          </p>
          <button className="btn btn-secondary" onClick={() => setShowCreateForm(true)}>
            Create your first group
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {groups.map((group) => (
            <div
              key={group.id}
              className="glass-panel"
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px', cursor: 'pointer' }}
              onClick={() => onSelectGroup(group.id)}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{group.name}</h3>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={10} /> {new Date(group.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {group.description || 'No description provided.'}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} /> {group.members ? group.members.length : 0} members
                </span>
                <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                  View group <ArrowRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
