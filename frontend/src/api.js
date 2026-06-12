const API_BASE_URL = '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    // Token expired or invalid, clear auth
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');
    // We don't force redirect immediately to allow the calling flow to handle it or trigger a login state change in App.jsx
  }

  if (!response.ok) {
    let errorData = 'Something went wrong';
    try {
      errorData = await response.json();
    } catch (e) {
      // Not JSON
    }
    throw new Error(typeof errorData === 'object' ? JSON.stringify(errorData) : errorData);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  auth: {
    register: (username, email, password, firstName, lastName) =>
      request('/auth/register/', {
        method: 'POST',
        body: { username, email, password, first_name: firstName, last_name: lastName },
      }),
    login: async (username, password) => {
      const data = await request('/auth/login/', {
        method: 'POST',
        body: { username, password },
      });
      if (data.access) {
        localStorage.setItem('accessToken', data.access);
        localStorage.setItem('refreshToken', data.refresh);
        localStorage.setItem('username', username);
      }
      return data;
    },
    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
    },
    getCurrentUser: () => request('/auth/user/'),
    sendOtp: (email) =>
      request('/auth/send-otp/', {
        method: 'POST',
        body: { email },
      }),
    verifyOtp: async (email, otp) => {
      const data = await request('/auth/verify-otp/', {
        method: 'POST',
        body: { email, otp },
      });
      if (data.access) {
        localStorage.setItem('accessToken', data.access);
        localStorage.setItem('refreshToken', data.refresh);
        localStorage.setItem('username', data.username);
      }
      return data;
    },
  },
  groups: {
    list: () => request('/groups/'),
    create: (name, description) =>
      request('/groups/', {
        method: 'POST',
        body: { name, description },
      }),
    get: (id) => request(`/groups/${id}/`),
    addMember: (groupId, query) =>
      request(`/groups/${groupId}/add-member/`, {
        method: 'POST',
        body: { query }, // query can be username or email
      }),
    removeMember: (groupId, userId) =>
      request(`/groups/${groupId}/remove-member/`, {
        method: 'POST',
        body: { user_id: userId },
      }),
  },
  expenses: {
    list: (groupId) => request(`/groups/${groupId}/expenses/`),
    create: (groupId, data) =>
      request(`/groups/${groupId}/expenses/`, {
        method: 'POST',
        body: data,
      }),
    get: (id) => request(`/expenses/${id}/`),
    delete: (id) => request(`/expenses/${id}/`, { method: 'DELETE' }),
    update: (id, data) => request(`/expenses/${id}/`, { method: 'PUT', body: data }),
  },
  settlements: {
    create: (groupId, payerId, payeeId, amount) =>
      request(`/groups/${groupId}/settle/`, {
        method: 'POST',
        body: { payer_id: payerId, payee_id: payeeId, amount },
      }),
  },
  chat: {
    list: (expenseId) => request(`/expenses/${expenseId}/messages/`),
    send: (expenseId, message) =>
      request(`/expenses/${expenseId}/messages/`, {
        method: 'POST',
        body: { message },
      }),
  },
};
