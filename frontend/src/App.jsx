import React, { useState, useEffect } from 'react';
import { api } from './api';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import GroupDetail from './components/GroupDetail';
import ExpenseModal from './components/ExpenseModal';
import SettlementModal from './components/SettlementModal';
import ExpenseDetail from './components/ExpenseDetail';
import { LogOut, User, Activity } from 'lucide-react';

export default function App() {
  const [username, setUsername] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [view, setView] = useState('DASHBOARD'); // DASHBOARD, GROUP_DETAIL, EXPENSE_DETAIL
  
  // Modal states
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [prefilledSettlement, setPrefilledSettlement] = useState(null);

  // Group detailed members (cached for modals)
  const [groupMembers, setGroupMembers] = useState([]);

  // Notification states
  const [notification, setNotification] = useState(null);
  
  // Refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Check if user is already logged in
    const storedUsername = localStorage.getItem('username');
    const token = localStorage.getItem('accessToken');
    if (storedUsername && token) {
      setUsername(storedUsername);
    }
  }, []);

  const handleShowMessage = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleLoginSuccess = (uname) => {
    setUsername(uname);
    setView('DASHBOARD');
    handleShowMessage(`Welcome, ${uname}!`, 'success');
  };

  const handleLogout = () => {
    api.auth.logout();
    setUsername(null);
    setActiveGroupId(null);
    setView('DASHBOARD');
    handleShowMessage('Logged out successfully.', 'success');
  };

  const handleSelectGroup = async (gid) => {
    setActiveGroupId(gid);
    setView('GROUP_DETAIL');
    
    // Fetch members to cache them for modals
    try {
      const g = await api.groups.get(gid);
      setGroupMembers(g.members || []);
    } catch (err) {
      // Handled inside GroupDetail
    }
  };

  const handleSelectExpenseAction = (action) => {
    if (action === 'NEW') {
      setEditingExpenseId('NEW');
      setShowExpenseModal(true);
    } else if (action === 'SETTLE') {
      setPrefilledSettlement(null);
      setShowSettlementModal(true);
    } else {
      // numeric ID
      setEditingExpenseId(action);
      setView('EXPENSE_DETAIL');
    }
  };

  const handleBackToGroup = () => {
    setView('GROUP_DETAIL');
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header>
        <div className="logo" style={{ cursor: 'pointer' }} onClick={() => { if (username) { setView('DASHBOARD'); setActiveGroupId(null); } }}>
          <Activity size={24} style={{ color: 'var(--color-primary)' }} /> SplitSmart
        </div>

        {username && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
              <User size={14} style={{ color: 'var(--color-success)' }} />
              <strong>{username}</strong>
            </div>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleLogout}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        )}
      </header>

      {/* Main Content Areas */}
      <main style={{ flex: 1, paddingBottom: '48px' }}>
        {!username ? (
          <Auth onSuccess={handleLoginSuccess} />
        ) : (
          <>
            {view === 'DASHBOARD' && (
              <Dashboard
                onSelectGroup={handleSelectGroup}
                onShowMessage={handleShowMessage}
              />
            )}

            {view === 'GROUP_DETAIL' && (
              <GroupDetail
                groupId={activeGroupId}
                onBack={() => { setView('DASHBOARD'); setActiveGroupId(null); }}
                onShowMessage={handleShowMessage}
                onSelectExpense={handleSelectExpenseAction}
                triggerRefresh={refreshTrigger}
              />
            )}

            {view === 'EXPENSE_DETAIL' && (
              <ExpenseDetail
                expenseId={editingExpenseId}
                onClose={handleBackToGroup}
                onShowMessage={handleShowMessage}
                onEdit={() => setShowExpenseModal(true)}
                onDelete={handleBackToGroup}
              />
            )}
          </>
        )}
      </main>

      {/* Expense Modal (Create/Edit) */}
      {showExpenseModal && (
        <ExpenseModal
          groupId={activeGroupId}
          members={groupMembers}
          expenseId={editingExpenseId}
          onClose={() => { setShowExpenseModal(false); setEditingExpenseId(null); }}
          onShowMessage={handleShowMessage}
          onSave={() => {
            setShowExpenseModal(false);
            setEditingExpenseId(null);
            setRefreshTrigger(prev => prev + 1);
            if (view === 'EXPENSE_DETAIL') {
              // Reload details
              setView('GROUP_DETAIL');
            }
          }}
        />
      )}

      {/* Settlement Modal */}
      {showSettlementModal && (
        <SettlementModal
          groupId={activeGroupId}
          members={groupMembers}
          prefilled={prefilledSettlement}
          onClose={() => { setShowSettlementModal(false); setPrefilledSettlement(null); }}
          onShowMessage={handleShowMessage}
          onSave={() => {
            setShowSettlementModal(false);
            setPrefilledSettlement(null);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}

      {/* Global Toast Notification */}
      {notification && (
        <div className={`notification-banner notification-${notification.type}`}>
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
}
