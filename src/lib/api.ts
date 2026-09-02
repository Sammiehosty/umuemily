const API_BASE_URL = 'https://emily.sammiehosty.com';

export const api = {
  dbStatus: () => fetch(`${API_BASE_URL}/api/db-status.php`),
  auth: (password: string) => fetch(`${API_BASE_URL}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }),
  getDashboard: () => fetch(`${API_BASE_URL}/api/dashboard.php`),
  getWaStatus: () => fetch(`${API_BASE_URL}/api/wa-status.php`),
  getMembers: () => fetch(`${API_BASE_URL}/api/members.php`),
  addMember: (name: string, birthMonth: number, birthDay: number) => fetch(`${API_BASE_URL}/api/members.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, birthMonth, birthDay }) }),
  updateMember: (id: number, name: string, birthMonth: number, birthDay: number) => fetch(`${API_BASE_URL}/api/members.php`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, birthMonth, birthDay }) }),
  deleteMember: (id: number) => fetch(`${API_BASE_URL}/api/members.php`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
  getSettings: () => fetch(`${API_BASE_URL}/api/settings.php`),
  updateSettings: (updates: Record<string, string>) => fetch(`${API_BASE_URL}/api/settings.php`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }),
  getLogs: () => fetch(`${API_BASE_URL}/api/logs.php`),
  sendMessage: (memberName: string, messageType: string, message: string) => fetch(`${API_BASE_URL}/api/send-message.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberName, messageType, message }) }),
  testSend: (memberId: number, messageType: string) => fetch(`${API_BASE_URL}/api/test-send.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, messageType }) }),
  getScheduledMessages: (filter: 'all' | 'pending' | 'sent' = 'all') => fetch(`${API_BASE_URL}/api/scheduled-messages.php?filter=${filter}`),
  addScheduledMessage: (message: string, scheduledAt: string) => fetch(`${API_BASE_URL}/api/scheduled-messages.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, scheduledAt }) }),
  updateScheduledMessage: (id: number, message: string, scheduledAt: string) => fetch(`${API_BASE_URL}/api/scheduled-messages.php`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, message, scheduledAt }) }),
  deleteScheduledMessage: (id: number) => fetch(`${API_BASE_URL}/api/scheduled-messages.php`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
  getContributions: (month: string) => fetch(`${API_BASE_URL}/api/contributions.php?month=${month}`),
  updateContributions: (yearMonth: string, updates: Array<{ memberId: number; week1: boolean; week2: boolean; week3: boolean; week4: boolean; week5: boolean }>) => fetch(`${API_BASE_URL}/api/contributions.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yearMonth, updates }) }),
  sendContributionReport: (yearMonth: string) => fetch(`${API_BASE_URL}/api/send-contribution-report.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yearMonth }) }),
  // Birthday contributions
  getBirthdayContributions: (year: number) => fetch(`${API_BASE_URL}/api/birthday-contributions.php?year=${year}`),
  getBirthdayContributionDetail: (birthdayMemberId: number, year: number) => fetch(`${API_BASE_URL}/api/birthday-contributions.php?birthdayMemberId=${birthdayMemberId}&year=${year}`),
  updateBirthdayContributions: (birthdayMemberId: number, year: number, updates: Array<{ memberId: number; paid: boolean; amount: number }>) => fetch(`${API_BASE_URL}/api/birthday-contributions.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', birthdayMemberId, year, updates }) }),
  birthdayPayout: (birthdayMemberId: number, year: number) => fetch(`${API_BASE_URL}/api/birthday-contributions.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'payout', birthdayMemberId, year }) }),
  // Finance
  getFinance: () => fetch(`${API_BASE_URL}/api/finance.php`),
  sendCredit: (memberName: string, amount: number, description: string) => fetch(`${API_BASE_URL}/api/finance.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'credit', memberName, amount, description }) }),
  payLateFees: (memberId: number, feeIds: number[]) => fetch(`${API_BASE_URL}/api/finance.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pay_late_fees', memberId, feeIds }) }),
  retryMessage: (logId: number) => fetch(`${API_BASE_URL}/api/retry-message.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logId }) }),
  deleteTransaction: (id: number) => fetch(`${API_BASE_URL}/api/finance.php`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),
  // Support
  sendSupport: (memberName: string, amount: number, description: string) => fetch(`${API_BASE_URL}/api/support.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberName, amount, description }) }),
};

export const getApiBaseUrl = () => API_BASE_URL;
