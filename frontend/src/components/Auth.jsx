import React, { useState } from 'react';
import { api } from '../api';
import { User, Lock, Mail, Tag, ShieldCheck, Key } from 'lucide-react';

export default function Auth({ onSuccess }) {
  const [activeTab, setActiveTab] = useState('LOGIN'); // LOGIN, REGISTER, OTP
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // OTP State
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (activeTab === 'LOGIN') {
        await api.auth.login(username, password);
        onSuccess(username);
      } else if (activeTab === 'REGISTER') {
        if (!email) {
          setError('Email is required.');
          setLoading(false);
          return;
        }
        await api.auth.register(username, email, password, firstName, lastName);
        // Automatically login after registration
        await api.auth.login(username, password);
        onSuccess(username);
      } else if (activeTab === 'OTP') {
        if (!otpSent) {
          // Send OTP flow
          const res = await api.auth.sendOtp(otpEmail);
          setOtpSent(true);
          setSuccess(res?.warning || 'A 6-digit verification code has been sent to your email.');
        } else {
          // Verify OTP flow
          const data = await api.auth.verifyOtp(otpEmail, otpCode);
          onSuccess(data.username);
        }
      }
    } catch (err) {
      let msg = err.message || 'Authentication failed. Please verify input details.';
      if (msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg);
          msg = Object.entries(parsed)
            .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(' ') : val}`)
            .join(' | ');
        } catch (e) {
          // Keep raw
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetState = (tab) => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
    setOtpSent(false);
    setOtpCode('');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
            <span style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SplitSmart
            </span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
            {activeTab === 'LOGIN' && 'Sign in using your username and password.'}
            {activeTab === 'REGISTER' && 'Create a new account to start sharing costs.'}
            {activeTab === 'OTP' && 'Sign up or log in instantly via Email Verification.'}
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.2)', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              fontSize: '11px',
              background: activeTab === 'LOGIN' ? 'var(--color-primary)' : 'transparent',
              color: '#fff',
              borderRadius: '8px',
              padding: '6px',
            }}
            onClick={() => resetState('LOGIN')}
          >
            Password
          </button>
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              fontSize: '11px',
              background: activeTab === 'OTP' ? 'var(--color-primary)' : 'transparent',
              color: '#fff',
              borderRadius: '8px',
              padding: '6px',
            }}
            onClick={() => resetState('OTP')}
          >
            Email OTP
          </button>
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              fontSize: '11px',
              background: activeTab === 'REGISTER' ? 'var(--color-primary)' : 'transparent',
              color: '#fff',
              borderRadius: '8px',
              padding: '6px',
            }}
            onClick={() => resetState('REGISTER')}
          >
            Register
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--color-danger-glow)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: 'var(--color-danger)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              lineHeight: '1.4',
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: 'var(--color-success-glow)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              color: 'var(--color-success)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              lineHeight: '1.4',
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Traditional Username/Password forms */}
          {(activeTab === 'LOGIN' || activeTab === 'REGISTER') && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '40px' }}
                  placeholder="enter username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
          )}

          {activeTab === 'REGISTER' && (
            <>
              <div className="form-group">
                <label className="form-label">Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--color-text-muted)' }} />
                  <input
                    type="email"
                    className="form-control"
                    style={{ paddingLeft: '40px' }}
                    placeholder="email@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {(activeTab === 'LOGIN' || activeTab === 'REGISTER') && (
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--color-text-muted)' }} />
                <input
                  type="password"
                  className="form-control"
                  style={{ paddingLeft: '40px' }}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Email OTP auth forms */}
          {activeTab === 'OTP' && (
            <>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--color-text-muted)' }} />
                  <input
                    type="email"
                    className="form-control"
                    style={{ paddingLeft: '40px' }}
                    placeholder="email@example.com"
                    required
                    disabled={otpSent}
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                  />
                </div>
              </div>

              {otpSent && (
                <div className="form-group">
                  <label className="form-label">Verification Code (OTP)</label>
                  <div style={{ position: 'relative' }}>
                    <Key size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--color-text-muted)' }} />
                    <input
                      type="text"
                      className="form-control"
                      style={{ paddingLeft: '40px', letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }}
                      placeholder="••••••"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px', padding: '12px' }} disabled={loading}>
            {loading ? 'Processing...' : activeTab === 'OTP' ? (otpSent ? 'Verify & Login' : 'Send Verification OTP') : activeTab === 'LOGIN' ? 'Sign In' : 'Sign Up'}
          </button>

          {activeTab === 'OTP' && otpSent && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '12px', padding: '10px' }}
              onClick={() => {
                setOtpSent(false);
                setSuccess('');
                setOtpCode('');
              }}
            >
              Change Email Address
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
