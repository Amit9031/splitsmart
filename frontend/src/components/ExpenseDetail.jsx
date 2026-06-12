import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Trash2, Edit, Calendar, User, Send, MessageSquare } from 'lucide-react';

export default function ExpenseDetail({ expenseId, onClose, onShowMessage, onEdit, onDelete }) {
  const [expense, setExpense] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatBottomRef = useRef(null);

  // Load details
  const fetchDetails = async () => {
    try {
      const data = await api.expenses.get(expenseId);
      setExpense(data);
    } catch (err) {
      onShowMessage(err.message || 'Failed to load expense details.', 'error');
    }
  };

  // Fetch chat messages
  const fetchMessages = async () => {
    try {
      const msgs = await api.chat.list(expenseId);
      setMessages(msgs);
    } catch (err) {
      // Fail silently to avoid breaking the chat poll experience
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchDetails(), fetchMessages()]);
      setLoading(false);
    };
    init();
  }, [expenseId]);

  // Polling setup for real-time chat (3-second intervals)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [expenseId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const sentMsg = await api.chat.send(expenseId, newMessage.trim());
      setNewMessage('');
      setMessages((prev) => [...prev, sentMsg]);
    } catch (err) {
      onShowMessage(err.message || 'Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.expenses.delete(expenseId);
      onShowMessage('Expense deleted successfully.', 'success');
      onDelete();
    } catch (err) {
      onShowMessage(err.message || 'Failed to delete expense.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
        Loading details...
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
        <p className="balance-negative">Expense not found.</p>
      </div>
    );
  }

  const currentUsername = localStorage.getItem('username');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', height: '100%' }}>
      {/* Left Pane: Expense details and splits */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          {/* Header Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>{expense.description}</h3>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} /> {new Date(expense.created_at).toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={onEdit}>
                <Edit size={14} /> Edit
              </button>
              <button className="btn btn-danger" style={{ padding: '8px 12px' }} onClick={handleDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {/* Money Breakdown */}
          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Total Amount</span>
            <span style={{ fontSize: '32px', fontWeight: 'bold', display: 'block', marginBottom: '16px' }}>
              ${parseFloat(expense.amount).toFixed(2)}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Paid by: <strong style={{ color: 'var(--color-text-main)' }}>{expense.paid_by_username}</strong>
            </span>
          </div>

          {/* Split lists */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Split Breakdown</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '16px' }}>
              {expense.splits?.map((split) => (
                <div key={split.user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} style={{ color: 'var(--color-text-muted)' }} />
                    {split.username}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>
                    ${parseFloat(split.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button className="btn btn-secondary" style={{ marginTop: '24px', width: 'fit-content' }} onClick={onClose}>Close Detail Pane</button>
      </div>

      {/* Right Pane: Chat Board */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '520px', padding: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} /> Activity & Chat
        </h3>

        {/* Chat Feed Messages */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '12px' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-dark)', fontSize: '12px', marginTop: '48px' }}>
              No messages. Say hello!
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.username === currentUsername;
              const isSystemAction = msg.message.startsWith('created this expense') || msg.message.startsWith('edited this expense');
              
              if (isSystemAction) {
                return (
                  <div key={msg.id} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', margin: '4px 0', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '4px' }}>
                    <strong>{msg.username}</strong> {msg.message}
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: isMe ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  {!isMe && (
                    <span style={{ display: 'block', fontSize: '9px', fontWeight: 'bold', color: 'var(--color-success)', marginBottom: '2px' }}>
                      {msg.username}
                    </span>
                  )}
                  <p style={{ wordBreak: 'break-word', margin: 0 }}>{msg.message}</p>
                  <span style={{ display: 'block', fontSize: '8px', textAlign: 'right', opacity: 0.6, marginTop: '2px' }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Send Form */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="form-control"
            style={{ padding: '8px 12px', fontSize: '13px' }}
            placeholder="Type a message..."
            required
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '8px' }} disabled={sending}>
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
