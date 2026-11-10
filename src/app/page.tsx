"use client";
import { useState, useEffect } from "react";
import { api, getApiBaseUrl } from "@/lib/api";

type Member = { id: number; name: string; birthMonth: number; birthDay: number };
type LogEntry = { id: number; memberName: string; messageType: string; message: string; status: string; response?: string | null; sentAt: string };
type ScheduledMessage = { id: number; message: string; scheduledAt: string; status: string; sentAt?: string | null };
type UpcomingCronEvent = { title: string; scheduledAt: string };
type ContributionRecord = { memberId: number; memberName: string; yearMonth: string; week1: number; week2: number; week3: number; week4: number; week5: number; memberTotal?: number };
type DashboardData = { upcomingBirthdays: Array<{ id: number; name: string; birthMonth: number; birthDay: number; daysUntil: number }>; upcomingScheduled: ScheduledMessage[]; recentLogs: LogEntry[]; stats: { totalMembers: number; totalMessagesSent: number; pendingScheduled: number; upcomingBirthdays: number }; waClient: { configured: boolean; groupId: string; groupName: string; instanceId: string }; serverTime: string; timezone: string };
type Settings = Record<string, string>;
type LateFee = { id: number; birthdayMemberId: number; birthdayMemberName: string; year: number; amount: number; chargedAt: string };
type MemberStats = { memberId: number; memberName: string; totalContributed: number; birthdayContributed: number; weeklyDebt: number; birthdayDebt: number; lateFeeOwed: number; lateFeePaid: number; lateFees: LateFee[]; totalDebt: number; birthdayPayoutReceived: number; birthdayPayoutToday: number; totalSupported: number; totalCredited: number; creditToday: number };
type FinanceData = { weeklyTotal: number; totalSupport: number; totalDebtRecovery: number; totalLateFeesOwed: number; totalLateFeesPaid: number; totalBirthdayContributed: number; totalContributionsBalance: number; totalBankCharges: number; totalDeductions: number; balance: number; outstandingDebt: number; trackedMonths?: number; transactions: Array<{ id: number; type: string; amount: number; description: string; memberName: string; createdAt: string }>; memberTotals: MemberStats[] };
type BdayContributor = { memberId: number; memberName: string; paid: number; amount: number };
type Role = 'admin' | 'contrib';

const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function ord(d: number) { if (d>=11&&d<=13) return "th"; switch(d%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th";} }
function fmtBday(m: number, d: number) { return `${MN[m-1]} ${d}${ord(d)}`; }

// ---- Africa/Lagos timezone helpers ----
// The backend stores and returns all timestamps as Lagos wall-clock time,
// so the UI must never re-apply a timezone conversion to those values.
const APP_TZ = 'Africa/Lagos';
/** Current moment expressed as Lagos wall-clock time. */
function lagosNow(): Date { return new Date(new Date().toLocaleString('en-US', { timeZone: APP_TZ })); }
/** Split "YYYY-MM-DD HH:MM:SS" (or ISO) into its literal date/time parts. */
function splitDbDateTime(s: string): { date: string; time: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` } : null;
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
/** Today in Lagos as YYYY-MM-DD, for date inputs. */
function lagosToday(): string { const n = lagosNow(); return `${n.getFullYear()}-${pad2(n.getMonth()+1)}-${pad2(n.getDate())}`; }
function fmtDT(s: string) {
  if (!s) return '';
  const parts = splitDbDateTime(s);
  if (parts) {
    const [y, mo, d] = parts.date.split('-').map(Number);
    const [h, mi] = parts.time.split(':').map(Number);
    // Render the stored Lagos wall-clock exactly as-is.
    return new Date(y, mo-1, d, h, mi).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: APP_TZ });
}
function daysUntil(m: number, d: number) {
  const n = lagosNow();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let b = new Date(today.getFullYear(), m-1, d);
  if (b < today) b = new Date(today.getFullYear()+1, m-1, d);
  return Math.round((b.getTime()-today.getTime())/864e5);
}
function curYM() { const n = lagosNow(); return `${n.getFullYear()}-${pad2(n.getMonth()+1)}`; }
/** Saturday dates (YYYY-MM-DD) in a YYYY-MM month. One Saturday = one contribution week. */
function monthSaturdays(ym: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return [];
  const year = Number(m[1]); const month = Number(m[2]);
  const out: string[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month-1, d).getDay() === 6) out.push(`${year}-${pad2(month)}-${pad2(d)}`);
  }
  return out;
}
function fmtYM(ym: string) { const [y,m]=ym.split('-'); return `${MN[parseInt(m)-1]} ${y}`; }
function fmtMoney(amount: number) { return amount.toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function txnColor(t: string) { if (t==='support'||t==='debt_recovery'||t==='late_fee_payment') return 'text-green-600'; if (t==='birthday_payout'||t==='weekly_deduction'||t==='credit'||t==='bank_charge') return 'text-red-600'; return 'text-gray-600'; }
function txnSign(t: string) { if (t==='support'||t==='debt_recovery'||t==='late_fee_payment') return '+'; return '-'; }

// ==================== LOGIN ====================
function LoginPage({ onLogin }: { onLogin: (role: Role) => void }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const [dbSt, setDbSt] = useState<"checking"|"connected"|"disconnected">("checking");
  useEffect(() => { api.dbStatus().then(r=>r.json()).then(d=>setDbSt(d.connected?"connected":"disconnected")).catch(()=>setDbSt("disconnected")); }, []);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); setErr("");
    try { const r=await api.auth(pw); const d=await r.json(); if(d.success){localStorage.setItem("auth_token",d.token);localStorage.setItem("auth_role",d.role||'admin');onLogin(d.role||'admin');}else setErr("Invalid password"); } catch{setErr("Connection error");} setLoading(false); };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8"><div className="text-6xl mb-4">🎂</div><h1 className="text-2xl font-bold text-primary">Umu Emily Family Manager</h1><p className="text-gray-500 text-sm mt-1">Birthdays • Contributions • Messages</p></div>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent outline-none" placeholder="Enter password" required /></div>
          {err && <p className="text-red-500 text-sm">{err}</p>}
          <button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent-dark text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50">{loading?"Logging in...":"Login"}</button>
        </form>
        <div className="mt-6 pt-4 border-t border-gray-200"><div className="flex items-center justify-center gap-2 text-sm"><span className="text-gray-500">Database:</span>
          {dbSt==="checking"&&<span className="flex items-center gap-1 text-yellow-600"><span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>Checking...</span>}
          {dbSt==="connected"&&<span className="flex items-center gap-1 text-green-600 font-medium"><span className="w-2 h-2 bg-green-500 rounded-full"></span>Connected</span>}
          {dbSt==="disconnected"&&<span className="flex items-center gap-1 text-red-600 font-medium"><span className="w-2 h-2 bg-red-500 rounded-full"></span>Disconnected</span>}
        </div></div>
      </div>
    </div>
  );
}

// ==================== DASHBOARD SHELL ====================
function Dashboard({ onLogout, role }: { onLogout: () => void; role: Role }) {
  const [tab, setTab] = useState<string>("dashboard");
  const [members, setMembers] = useState<Member[]>([]); const [logs, setLogs] = useState<LogEntry[]>([]); const [settings, setSettings] = useState<Settings>({});
  const [dash, setDash] = useState<DashboardData|null>(null); const [sched, setSched] = useState<ScheduledMessage[]>([]); const [cronEvents, setCronEvents] = useState<UpcomingCronEvent[]>([]); const [finance, setFinance] = useState<FinanceData|null>(null);
  const [loading, setLoading] = useState(true); const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const isAdmin = role === 'admin';

  async function readApi(request: Promise<Response>, label: string): Promise<unknown> {
    const response = await request;
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${label}: backend returned invalid data`); }
    if (!response.ok) {
      const obj = data as { error?: string; message?: string };
      throw new Error(`${label}: ${obj.error||obj.message||`HTTP ${response.status}`}`);
    }
    return data;
  }

  const fetchAll = async () => {
    setLoading(true); setLoadErrors([]);
    const settled = await Promise.allSettled([
      readApi(api.getMembers(),'Members'),
      readApi(api.getSettings(),'Settings'),
      readApi(api.getLogs(),'Logs'),
      readApi(api.getDashboard(),'Dashboard'),
      readApi(api.getScheduledMessages('all'),'Scheduled messages'),
      readApi(api.getFinance(),'Finance'),
      readApi(api.getUpcomingCronEvents(),'Upcoming cron events'),
    ]);
    const errors: string[] = [];
    const take = <T,>(index: number): T|undefined => {
      const result = settled[index];
      if (result.status==='rejected') { errors.push(result.reason instanceof Error?result.reason.message:String(result.reason)); return undefined; }
      return result.value as T;
    };

    const membersData=take<unknown>(0); if(Array.isArray(membersData)) setMembers(membersData as Member[]); else if(membersData!==undefined) errors.push('Members: unexpected response');
    const settingsData=take<unknown>(1); if(settingsData&&typeof settingsData==='object'&&!Array.isArray(settingsData)) setSettings(settingsData as Settings); else if(settingsData!==undefined) errors.push('Settings: unexpected response');
    const logsData=take<unknown>(2); if(Array.isArray(logsData)) setLogs(logsData as LogEntry[]); else if(logsData!==undefined) errors.push('Logs: unexpected response');
    const dashData=take<unknown>(3); if(dashData&&typeof dashData==='object'&&'stats' in dashData) setDash(dashData as DashboardData); else if(dashData!==undefined) errors.push('Dashboard: unexpected response');
    const schedData=take<unknown>(4); if(Array.isArray(schedData)) setSched(schedData as ScheduledMessage[]); else if(schedData!==undefined) errors.push('Scheduled messages: unexpected response');
    const financeData=take<unknown>(5); if(financeData&&typeof financeData==='object'&&'weeklyTotal' in financeData&&Array.isArray((financeData as FinanceData).memberTotals)) setFinance(financeData as FinanceData); else if(financeData!==undefined) errors.push('Finance: unexpected response');
    const cronData=take<unknown>(6); if(Array.isArray(cronData)) setCronEvents(cronData as UpcomingCronEvent[]); else if(cronData!==undefined) errors.push('Upcoming cron events: unexpected response');

    setLoadErrors(errors); setLoading(false);
  };

  const refreshLogs=async()=>{try{const d=await readApi(api.getLogs(),'Logs');if(Array.isArray(d))setLogs(d as LogEntry[]);}catch(e){setLoadErrors([e instanceof Error?e.message:'Logs failed']);}};
  const refreshSettings=async()=>{try{const d=await readApi(api.getSettings(),'Settings');if(d&&typeof d==='object'&&!Array.isArray(d))setSettings(d as Settings);}catch(e){setLoadErrors([e instanceof Error?e.message:'Settings failed']);}};
  const refreshScheduled=async()=>{try{const [messagesData,cronData]=await Promise.all([readApi(api.getScheduledMessages('all'),'Scheduled messages'),readApi(api.getUpcomingCronEvents(),'Upcoming cron events')]);if(Array.isArray(messagesData))setSched(messagesData as ScheduledMessage[]);if(Array.isArray(cronData))setCronEvents(cronData as UpcomingCronEvent[]);}catch(e){setLoadErrors([e instanceof Error?e.message:'Scheduler refresh failed']);}};

  useEffect(() => { fetchAll(); }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="text-4xl animate-bounce mb-4">🎂</div><p className="text-gray-500">Loading...</p></div></div>;

  const tabs = [
    {key:"dashboard",label:"📊 Dashboard",ml:"📊"},
    {key:"members",label:"👥 Members",ml:"👥"},
    {key:"contributions",label:"💰 Dues",ml:"💰"},
    {key:"bdayContrib",label:"🎂 Bday Fund",ml:"🎂"},
    {key:"scheduler",label:"📅 Schedule",ml:"📅"},
    {key:"send",label:"📨 Send",ml:"📨"},
    {key:"settings",label:"⚙️ Settings",ml:"⚙️"},
    {key:"logs",label:"📋 Logs",ml:"📋"},
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow-lg"><div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-3xl">🎂</span><div><h1 className="text-lg font-bold">Umu Emily Family Manager</h1><p className="text-xs text-green-200">{isAdmin?'Admin':'Contributor Admin'} • Birthdays • Contributions</p></div></div><button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm">Logout</button></div></header>
      {loadErrors.length>0&&<div className="max-w-6xl mx-auto px-4 mt-4"><div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">⚠️ Some dashboard data could not load</p>{loadErrors.map((e,i)=><p key={i} className="text-xs mt-1">• {e}</p>)}</div><button onClick={fetchAll} className="bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0">Retry</button></div></div></div>}
      <div className="max-w-6xl mx-auto px-4 mt-4"><div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm overflow-x-auto">
        {tabs.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={`flex-1 py-2 px-1 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${tab===t.key?"bg-primary text-white":"text-gray-600 hover:bg-gray-100"}`}><span className="hidden md:inline">{t.label}</span><span className="md:hidden">{t.ml}</span></button>)}
      </div></div>
      <div className="max-w-6xl mx-auto px-4 py-4 pb-8">
        {tab==="dashboard"&&<DashboardTab data={dash} finance={finance} onRefresh={fetchAll} isAdmin={isAdmin}/>}
        {tab==="members"&&<MembersTab members={members} finance={finance} onRefresh={fetchAll} isAdmin={isAdmin}/>}
        {tab==="contributions"&&<ContributionsTab/>}
        {tab==="bdayContrib"&&<BdayContribTab members={members} onRefresh={fetchAll}/>}
        {tab==="scheduler"&&<SchedulerTab messages={sched} cronEvents={cronEvents} onRefresh={refreshScheduled} isAdmin={isAdmin}/>} 
        {tab==="send"&&<SendTab members={members} settings={settings} onRefresh={refreshLogs} isAdmin={isAdmin}/>}
        {tab==="settings"&&<SettingsTab settings={settings} onRefresh={refreshSettings} isAdmin={isAdmin}/>}
        {tab==="logs"&&<LogsTab logs={logs} onRefresh={refreshLogs}/>}
      </div>
    </div>
  );
}


// ==================== DASHBOARD TAB ====================
function DashboardTab({ data, finance, onRefresh, isAdmin }: { data: DashboardData|null; finance: FinanceData|null; onRefresh: () => void; isAdmin: boolean }) {
  const [showTxns, setShowTxns] = useState(false);
  const [showBankCharge,setShowBankCharge]=useState(false); const [bankChargeAmount,setBankChargeAmount]=useState(""); const [bankChargeDescription,setBankChargeDescription]=useState(""); const [savingBankCharge,setSavingBankCharge]=useState(false);
  const recordBankCharge=async()=>{const amount=parseFloat(bankChargeAmount);if(!Number.isFinite(amount)||amount<=0)return;setSavingBankCharge(true);try{const response=await api.addBankCharge(amount,bankChargeDescription);const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Could not record bank charge');setShowBankCharge(false);setBankChargeAmount("");setBankChargeDescription("");await onRefresh();}catch(error){alert(error instanceof Error?error.message:'Could not record bank charge');}finally{setSavingBankCharge(false);}};
  if (!data) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const txnPanel = finance && showTxns ? (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-3">💳 All Transactions</h3>
      {finance.transactions.length===0?<p className="text-gray-400 text-sm">No transactions yet</p>:
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {finance.transactions.map(t=>(
          <div key={t.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.type==='support'||t.type==='debt_recovery'?'bg-green-100 text-green-700':t.type==='birthday_payout'?'bg-pink-100 text-pink-700':t.type==='credit'?'bg-blue-100 text-blue-700':'bg-orange-100 text-orange-700'}`}>{t.type.replace(/_/g,' ')}</span>{t.memberName&&<span className="text-sm text-gray-600">{t.memberName}</span>}</div>
              <p className="text-xs text-gray-500 mt-1 truncate">{t.description}</p>
            </div>
            <div className="text-right ml-3 shrink-0">
              <p className={`font-semibold ${txnColor(t.type)}`}>{txnSign(t.type)}₦{fmtMoney(t.amount)}</p>
              <p className="text-xs text-gray-400">{fmtDT(t.createdAt)}</p>
              {isAdmin && <button onClick={async()=>{if(confirm(`Delete this transaction?\n\n${t.description}\n₦${t.amount.toLocaleString()}\n\nThe funds will be reversed.`)){await api.deleteTransaction(t.id);onRefresh();}}} className="text-xs text-red-400 hover:text-red-600 mt-1">🗑️ Delete</button>}
            </div>
          </div>))}
      </div>}
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {showBankCharge&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"><div><h3 className="text-lg font-bold text-gray-800">Record Bank Charge</h3><p className="text-sm text-gray-500 mt-1">This expense will be deducted from the group balance. No WhatsApp message will be sent.</p></div><div><label className="text-sm font-medium text-gray-700">Amount charged</label><input type="number" min="0.01" step="0.01" value={bankChargeAmount} onChange={e=>setBankChargeAmount(e.target.value)} placeholder="₦0.00" className="w-full mt-1 px-3 py-2 border rounded-lg" autoFocus/></div><div><label className="text-sm font-medium text-gray-700">Description (optional)</label><textarea value={bankChargeDescription} onChange={e=>setBankChargeDescription(e.target.value)} placeholder="e.g. Transfer charge for birthday payout" rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg"/></div><div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">Bank charges will appear in Transactions and in the monthly financial report.</div><div className="flex gap-3"><button onClick={()=>setShowBankCharge(false)} disabled={savingBankCharge} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold disabled:opacity-50">Cancel</button><button onClick={recordBankCharge} disabled={savingBankCharge||!bankChargeAmount||!Number.isFinite(parseFloat(bankChargeAmount))||parseFloat(bankChargeAmount)<=0} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">{savingBankCharge?'Recording...':'Record Charge'}</button></div></div></div>}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-800">📊 Dashboard</h2>
        <div className="flex gap-2">
          <button onClick={()=>setShowTxns(!showTxns)} className={`px-4 py-2 rounded-lg text-sm font-medium ${showTxns?'bg-primary text-white':'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>{showTxns?'Hide':'💳 Transactions'}</button>
          {showTxns&&<button onClick={()=>setShowBankCharge(true)} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium">🏦 Bank Charges</button>}
          <button onClick={onRefresh} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">🔄</button>
        </div>
      </div>
      {finance && finance.balance < 0 && (
        <div className="bg-red-600 text-white rounded-xl p-4 flex items-center gap-3"><span className="text-3xl">⚠️</span><div><p className="font-bold text-lg">Group Fund in Deficit!</p><p className="text-sm opacity-90">The group is currently owing ₦{Math.abs(finance.balance).toLocaleString()}. This will be recovered as debtors pay their birthday contributions.</p></div></div>
      )}
      {finance && finance.outstandingDebt > 0 && finance.balance >= 0 && (
        <div className="bg-yellow-500 text-white rounded-xl p-4 flex items-center gap-3"><span className="text-3xl">💸</span><div><p className="font-bold">Outstanding Birthday Debts</p><p className="text-sm opacity-90">₦{finance.outstandingDebt.toLocaleString()} is owed by members. Balance will increase when they pay.</p></div></div>
      )}
      {finance && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">Weekly Dues</p><p className="text-xl font-bold">₦{finance.weeklyTotal.toLocaleString()}</p></div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">Support + Recovered</p><p className="text-xl font-bold">₦{((finance.totalSupport||0)+(finance.totalDebtRecovery||0)).toLocaleString()}</p></div>
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">Deducted + Bank Charges</p><p className="text-xl font-bold">₦{fmtMoney(finance.totalDeductions)}</p></div>
          <div className={`bg-gradient-to-r ${finance.balance<0?'from-red-500 to-red-600':'from-primary to-primary-dark'} text-white rounded-xl p-4`}><p className="text-xs opacity-80">Balance</p><p className="text-xl font-bold">{finance.balance<0?'-':''}₦{fmtMoney(Math.abs(finance.balance))}</p></div>
        </div>
      )}
      {txnPanel}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center"><div className="text-3xl font-bold text-primary">{data.stats.totalMembers}</div><div className="text-sm text-gray-500">Members</div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center"><div className="text-3xl font-bold text-accent">{data.stats.upcomingBirthdays}</div><div className="text-sm text-gray-500">Upcoming (30d)</div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center"><div className="text-3xl font-bold text-blue-600">{data.stats.pendingScheduled}</div><div className="text-sm text-gray-500">Scheduled</div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center"><div className="text-3xl font-bold text-purple-600">{data.stats.totalMessagesSent}</div><div className="text-sm text-gray-500">Msgs Sent</div></div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-4 shadow-sm"><h3 className="font-semibold text-gray-800 mb-3">🎂 Upcoming Birthdays</h3>
          {data.upcomingBirthdays.length===0?<p className="text-gray-400 text-sm">None in next 30 days</p>:
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">{data.upcomingBirthdays.map(b=><div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"><div><p className="font-medium text-gray-800">{b.name}</p><p className="text-xs text-gray-500">{fmtBday(b.birthMonth,b.birthDay)}</p></div><span className={`text-xs px-2 py-1 rounded-full font-medium ${b.daysUntil===0?'bg-red-100 text-red-700':b.daysUntil<=7?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>{b.daysUntil===0?'Today! 🎉':b.daysUntil===1?'Tomorrow!':`${b.daysUntil}d`}</span></div>)}</div>}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm"><h3 className="font-semibold text-gray-800 mb-3">📋 Recent Activity</h3>
          {data.recentLogs.length===0?<p className="text-gray-400 text-sm">No recent activity</p>:
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">{data.recentLogs.map(l=><div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${l.status==='sent'?'bg-green-500':'bg-red-500'}`}></span><span className="text-sm font-medium text-gray-800">{l.memberName}</span><span className={`text-xs px-1.5 py-0.5 rounded-full ${l.messageType==='birthday'?'bg-pink-100 text-pink-700':l.messageType==='contribution'?'bg-green-100 text-green-700':'bg-purple-100 text-purple-700'}`}>{l.messageType}</span></div><span className="text-xs text-gray-400">{fmtDT(l.sentAt)}</span></div>)}</div>}
        </div>
      </div>
      <div className="text-center text-xs text-gray-400">🕐 All times shown in West Africa Time (WAT) · Server: {data.serverTime} ({data.timezone||APP_TZ})</div>
    </div>
  );
}

// ==================== MEMBERS TAB ====================
function MembersTab({ members, finance, onRefresh, isAdmin }: { members: Member[]; finance: FinanceData|null; onRefresh: () => void; isAdmin: boolean }) {
  const [showForm, setShowForm] = useState(false); const [editId, setEditId] = useState<number|null>(null);
  const [name, setName] = useState(""); const [bm, setBm] = useState(1); const [bd, setBd] = useState(1);
  const [activePanel, setActivePanel] = useState<'none'|'credit'|'support'>('none');
  const [creditName, setCreditName] = useState(""); const [creditAmt, setCreditAmt] = useState(""); const [creditDesc, setCreditDesc] = useState(""); const [crediting, setCrediting] = useState(false);
  const [supName, setSupName] = useState(""); const [supAmt, setSupAmt] = useState(""); const [supDesc, setSupDesc] = useState(""); const [supporting, setSupporting] = useState(false);
  const [payingLateFeeId, setPayingLateFeeId] = useState<number|null>(null);
  const [lateFeeMember, setLateFeeMember] = useState<MemberStats|null>(null);
  const [selectedFeeIds, setSelectedFeeIds] = useState<Record<number,boolean>>({});
  const [waFailure, setWaFailure] = useState<{logId:number;label:string}|null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showDebtorsConfirm, setShowDebtorsConfirm] = useState(false);
  const [sendingDebtorsReport, setSendingDebtorsReport] = useState(false);
  const [loadingDebtorsPreview, setLoadingDebtorsPreview] = useState(false);
  const [debtorsPreview, setDebtorsPreview] = useState('');
  const [memberReport, setMemberReport] = useState<Member|null>(null);
  const [reportYears, setReportYears] = useState<number[]>([new Date().getFullYear()]);
  const [reportPreview, setReportPreview] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [clearDebtMember, setClearDebtMember] = useState<Member|null>(null);
  const [clearDebtTypes, setClearDebtTypes] = useState<string[]>([]);
  const [clearingDebt, setClearingDebt] = useState(false);


  const openClearDebt = (m: Member) => { setClearDebtMember(m); setClearDebtTypes([]); };
  const confirmClearDebt = async () => {
    if (!clearDebtMember || !clearDebtTypes.length) return;
    setClearingDebt(true);
    try {
      const response = await api.clearMemberDebt(clearDebtMember.id, clearDebtTypes);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not clear selected debt');
      setClearDebtMember(null); setClearDebtTypes([]); await onRefresh();
      alert(data.waSent ? `Debt cleared successfully. ₦${Number(data.totalCleared).toLocaleString()} recorded and report sent to the WhatsApp group.` : `Debt cleared and recorded (₦${Number(data.totalCleared).toLocaleString()}), but WhatsApp sending failed. Check message logs before retrying.`);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not clear selected debt'); }
    finally { setClearingDebt(false); }
  };
  const reset = () => { setName(""); setBm(1); setBd(1); setEditId(null); setShowForm(false); };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const response=editId?await api.updateMember(editId,name,bm,bd):await api.addMember(name,bm,bd); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Unable to save member'); reset(); onRefresh(); } catch(error) { alert(error instanceof Error?error.message:'Unable to save member'); } };
  const edit = (m: Member) => { setEditId(m.id); setName(m.name); setBm(m.birthMonth); setBd(m.birthDay); setShowForm(true); setActivePanel('none'); };
  const handleCredit = async () => { if (!creditName||!creditAmt||!creditDesc) return; setCrediting(true); await api.sendCredit(creditName, parseInt(creditAmt), creditDesc); setCreditName(""); setCreditAmt(""); setCreditDesc(""); setCrediting(false); setActivePanel('none'); onRefresh(); };
  const handleSupport = async () => { if (!supName||!supAmt) return; setSupporting(true); await api.sendSupport(supName, parseInt(supAmt), supDesc); setSupName(""); setSupAmt(""); setSupDesc(""); setSupporting(false); setActivePanel('none'); onRefresh(); };
  const openLateFeePayment = (member: MemberStats) => {
    setLateFeeMember(member);
    const selected:Record<number,boolean>={};
    member.lateFees.forEach(fee=>{selected[fee.id]=true;});
    setSelectedFeeIds(selected);
  };
  const handleLateFeePayment = async () => {
    if (!lateFeeMember) return;
    const feeIds=lateFeeMember.lateFees.filter(f=>selectedFeeIds[f.id]).map(f=>f.id);
    if (!feeIds.length) return;
    setPayingLateFeeId(lateFeeMember.memberId);
    try {
      const response = await api.payLateFees(lateFeeMember.memberId,feeIds);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not record late-fee payment');
      if (!data.waSent) setWaFailure({logId:data.logId,label:lateFeeMember.memberName+`'s late-fee payment`});
      else setWaFailure(null);
      setLateFeeMember(null);
      await onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not record late-fee payment');
    } finally {
      setPayingLateFeeId(null);
    }
  };
  const retryWhatsApp=async()=>{if(!waFailure)return;setRetrying(true);try{const response=await api.retryMessage(waFailure.logId);const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Retry failed');setWaFailure(null);await onRefresh();}catch(error){alert(error instanceof Error?error.message:'Retry failed');}finally{setRetrying(false);}};
  const openDebtorsPreview=async()=>{setLoadingDebtorsPreview(true);setDebtorsPreview('');try{const response=await api.previewDebtorsReport();const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not load report preview');setDebtorsPreview(data.message||'');setShowDebtorsConfirm(true);}catch(error){alert(error instanceof Error?error.message:'Could not load report preview');}finally{setLoadingDebtorsPreview(false);}};
  const openMemberReport=async(m:Member)=>{setMemberReport(m);setReportYears([new Date().getFullYear()]);setReportPreview('');setReportLoading(true);try{const response=await api.memberFinancialReport(m.id,[new Date().getFullYear()],'preview');const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not load report');setReportPreview(data.message||'');}catch(error){alert(error instanceof Error?error.message:'Could not load report');}finally{setReportLoading(false);}};
  const refreshMemberReport=async(years:number[])=>{setReportYears(years);if(!memberReport)return;setReportLoading(true);try{const response=await api.memberFinancialReport(memberReport.id,years,'preview');const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not load report');setReportPreview(data.message||'');}catch(error){setReportPreview(error instanceof Error?error.message:'Could not load report');}finally{setReportLoading(false);}};
  const sendMemberReport=async()=>{if(!memberReport||!reportYears.length)return;setReportSending(true);try{const response=await api.memberFinancialReport(memberReport.id,reportYears,'send');const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not send report');setMemberReport(null);if(!data.waSent)setWaFailure({logId:data.logId,label:memberReport.name+"'s financial report"});else alert('Financial report sent to the WhatsApp group.');await onRefresh();}catch(error){alert(error instanceof Error?error.message:'Could not send report');}finally{setReportSending(false);}};
  const sendDebtorsReport=async()=>{setShowDebtorsConfirm(false);setSendingDebtorsReport(true);try{const response=await api.sendDebtorsReport();const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not send debtors report');if(!data.waSent)setWaFailure({logId:data.logId,label:'the debtors report'});else setWaFailure(null);await onRefresh();alert(data.waSent?`Debtors report sent for ${data.debtorCount} member${data.debtorCount===1?'':'s'}.`:'The report was saved, but WhatsApp sending failed. Use Retry WhatsApp.');}catch(error){alert(error instanceof Error?error.message:'Could not send debtors report');}finally{setSendingDebtorsReport(false);}};

  const statsMap: Record<number, MemberStats> = {};
  finance?.memberTotals?.forEach(mt => { statsMap[mt.memberId] = mt; });

  return (
    <div className="space-y-4">
      {waFailure&&<div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-red-700">WhatsApp message failed</p><p className="text-xs text-red-600">{waFailure.label} was saved but not sent.</p></div><button onClick={retryWhatsApp} disabled={retrying} className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{retrying?'Retrying...':'Retry WhatsApp'}</button></div>}

      {clearDebtMember&&(()=>{const stats=finance?.memberTotals?.find(x=>x.memberId===clearDebtMember.id);const options=[{key:'weekly',label:'Weekly dues',amount:stats?.weeklyDebt||0},{key:'birthday',label:'Birthday contributions',amount:stats?.birthdayDebt||0},{key:'late_fee',label:'Late fees',amount:stats?.lateFeeOwed||0}];const selected=options.filter(x=>clearDebtTypes.includes(x.key));const total=selected.reduce((n,x)=>n+x.amount,0);return <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold text-gray-800">Clear Member Debt</h3><p className="text-sm text-gray-500">{clearDebtMember.name}</p></div><button onClick={()=>setClearDebtMember(null)} className="text-gray-400 text-2xl">×</button></div><p className="text-sm text-gray-600">Select the outstanding debts the member is paying. Only selected categories will be cleared.</p><div className="space-y-2">{options.map(o=><label key={o.key} className={`flex items-center gap-3 border rounded-lg p-3 ${o.amount>0?'cursor-pointer':'opacity-50'}`}><input type="checkbox" disabled={o.amount<=0} checked={clearDebtTypes.includes(o.key)} onChange={e=>setClearDebtTypes(v=>e.target.checked?[...v,o.key]:v.filter(k=>k!==o.key))} className="w-4 h-4"/><span className="flex-1 text-sm font-medium text-gray-700">{o.label}</span><strong className="text-sm">₦{o.amount.toLocaleString()}</strong></label>)}</div><div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1"><p className="text-xs font-semibold text-green-700">CLEARANCE SUMMARY</p>{selected.length?selected.map(x=><div key={x.key} className="flex justify-between text-sm"><span>{x.label}</span><strong>₦{x.amount.toLocaleString()}</strong></div>):<p className="text-sm text-gray-500">No debt category selected.</p>}<div className="border-t border-green-200 pt-2 mt-2 flex justify-between"><strong>TOTAL TO CLEAR</strong><strong className="text-green-700">₦{total.toLocaleString()}</strong></div></div><p className="text-xs text-gray-500">Confirming records the selected debts as settled and sends a clearance report to the family WhatsApp group. This action cannot be automatically undone.</p><div className="flex gap-2"><button onClick={()=>setClearDebtMember(null)} className="flex-1 bg-gray-100 py-2.5 rounded-lg font-semibold">Cancel</button><button onClick={confirmClearDebt} disabled={!total||clearingDebt} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">{clearingDebt?'Clearing...':'Clear Debt & Send Report'}</button></div></div></div>;})()}
      {memberReport&&<div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-bold text-gray-800">Member Financial Report</h3><p className="text-sm text-gray-500">{memberReport.name}</p></div><button onClick={()=>setMemberReport(null)} className="text-gray-400 text-2xl">×</button></div><div><p className="text-sm font-semibold text-gray-700 mb-2">Select report year(s)</p><div className="flex flex-wrap gap-2">{Array.from({length:8},(_,i)=>new Date().getFullYear()-2+i).map(y=><label key={y} className="flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm"><input type="checkbox" checked={reportYears.includes(y)} onChange={e=>refreshMemberReport(e.target.checked?[...reportYears,y].sort():reportYears.filter(v=>v!==y))}/>{y}</label>)}</div></div><div className="bg-gray-50 border rounded-lg p-3 text-sm whitespace-pre-wrap text-gray-700 max-h-[45vh] overflow-y-auto">{reportLoading?'Generating report...':reportPreview||'Select at least one year.'}</div><p className="text-xs text-gray-500">Preview only. Sending will post this report to the configured Umu Emily WhatsApp group. No balances or payments will be changed.</p><div className="flex gap-2"><button onClick={()=>setMemberReport(null)} className="flex-1 bg-gray-100 py-2.5 rounded-lg font-semibold">Cancel</button><button onClick={sendMemberReport} disabled={reportLoading||reportSending||!reportYears.length||!reportPreview} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">{reportSending?'Sending...':'Send to WhatsApp Group'}</button></div></div></div>}
      {showDebtorsConfirm&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4"><div><h3 className="text-lg font-bold text-gray-800">Send Debtors Report?</h3><p className="text-sm text-gray-500 mt-1">Review the exact WhatsApp message before sending.</p></div><div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-[55vh] overflow-y-auto">{debtorsPreview}</div><div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">This only sends a report. It will not change balances or mark any debt as paid.</div><div className="flex gap-3"><button onClick={()=>setShowDebtorsConfirm(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold">Cancel</button><button onClick={sendDebtorsReport} disabled={!debtorsPreview||sendingDebtorsReport} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">Send Report</button></div></div></div>}
      {lateFeeMember&&(()=>{const selected=lateFeeMember.lateFees.filter(f=>selectedFeeIds[f.id]);const selectedTotal=selected.reduce((sum,fee)=>sum+fee.amount,0);const remaining=lateFeeMember.lateFeeOwed-selectedTotal;return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-bold text-gray-800">Record Late-Fee Payment</h3><p className="text-sm text-gray-500">{lateFeeMember.memberName}</p></div><button onClick={()=>setLateFeeMember(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button></div><div className="max-h-64 overflow-y-auto space-y-2">{lateFeeMember.lateFees.map(fee=><label key={fee.id} className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={!!selectedFeeIds[fee.id]} onChange={e=>setSelectedFeeIds(current=>({...current,[fee.id]:e.target.checked}))} className="w-4 h-4"/><div className="flex-1"><p className="text-sm font-medium text-gray-800">{fee.birthdayMemberName}&apos;s {fee.year} birthday</p><p className="text-xs text-gray-500">Charged {fmtDT(fee.chargedAt)}</p></div><span className="font-semibold text-orange-600">₦{fee.amount.toLocaleString()}</span></label>)}</div><div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1"><div className="flex justify-between"><span>Selected payment</span><strong>₦{selectedTotal.toLocaleString()}</strong></div><div className="flex justify-between"><span>Remaining late fees</span><strong className={remaining>0?'text-red-600':'text-green-600'}>₦{remaining.toLocaleString()}</strong></div></div><p className="text-xs text-gray-500">A payment confirmation will be sent to the WhatsApp group.</p><div className="flex gap-2"><button onClick={()=>setLateFeeMember(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg text-sm">Cancel</button><button onClick={handleLateFeePayment} disabled={!selected.length||payingLateFeeId===lateFeeMember.memberId} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{payingLateFeeId===lateFeeMember.memberId?'Recording...':`Confirm ₦${selectedTotal.toLocaleString()}`}</button></div></div></div>;})()}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">👥 Family Members ({members.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openDebtorsPreview} disabled={sendingDebtorsReport||loadingDebtorsPreview||!finance} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{loadingDebtorsPreview?'Loading...':sendingDebtorsReport?'Sending...':'Send Report'}</button>
          {isAdmin&&<>
          <button onClick={()=>{setActivePanel(activePanel==='support'?'none':'support');setShowForm(false);}} className={`px-3 py-2 rounded-lg text-sm font-medium ${activePanel==='support'?'bg-gray-300 text-gray-700':'bg-purple-500 hover:bg-purple-600 text-white'}`}>{activePanel==='support'?'Cancel':'🤝 Support'}</button>
          <button onClick={()=>{setActivePanel(activePanel==='credit'?'none':'credit');setShowForm(false);}} className={`px-3 py-2 rounded-lg text-sm font-medium ${activePanel==='credit'?'bg-gray-300 text-gray-700':'bg-blue-500 hover:bg-blue-600 text-white'}`}>{activePanel==='credit'?'Cancel':'💳 Credit'}</button>
          <button onClick={()=>{reset();setShowForm(!showForm);setActivePanel('none');}} className="bg-accent hover:bg-accent-dark text-white px-3 py-2 rounded-lg text-sm font-medium">{showForm?'Cancel':'+ Add'}</button>
          </>}
        </div>
      </div>
      {isAdmin && activePanel==='support' && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">🤝 Record Group Support</h3><p className="text-xs text-gray-500">When a member voluntarily supports the group</p>
          <select value={supName} onChange={e=>setSupName(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">-- Select member --</option>{members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select>
          <input type="number" value={supAmt} onChange={e=>setSupAmt(e.target.value)} placeholder="Amount (₦)" className="w-full px-3 py-2 border rounded-lg" />
          <textarea value={supDesc} onChange={e=>setSupDesc(e.target.value)} placeholder="Note (optional)" rows={2} className="w-full px-3 py-2 border rounded-lg" />
          <button onClick={handleSupport} disabled={supporting||!supName||!supAmt} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50">{supporting?'Processing...':'🤝 Record & Notify'}</button>
        </div>
      )}
      {isAdmin && activePanel==='credit' && (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">💳 Send Credit</h3>
          <p className="text-xs text-gray-500">This amount is deducted from the group balance and announced in the group.</p>
          <select value={creditName} onChange={e=>setCreditName(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">-- Select member --</option>{members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select>
          <input type="number" value={creditAmt} onChange={e=>setCreditAmt(e.target.value)} placeholder="Amount (₦)" className="w-full px-3 py-2 border rounded-lg" />
          <textarea value={creditDesc} onChange={e=>setCreditDesc(e.target.value)} placeholder="Description" rows={2} className="w-full px-3 py-2 border rounded-lg" />
          {finance&&(()=>{
            const amt=parseInt(creditAmt||'0',10)||0;
            const after=finance.balance-amt;
            return(
              <div className="bg-gray-50 border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Current balance</span><span className={`font-semibold ${finance.balance<0?'text-red-600':'text-gray-700'}`}>₦{finance.balance.toLocaleString()}</span></div>
                {amt>0&&<>
                  <div className="flex justify-between"><span className="text-gray-500">This credit</span><span className="font-semibold text-red-600">−₦{amt.toLocaleString()}</span></div>
                  <div className="flex justify-between pt-1 border-t border-gray-200"><span className="text-gray-500">Balance after</span><span className={`font-bold ${after<0?'text-red-600':'text-green-700'}`}>₦{after.toLocaleString()}</span></div>
                  {after<0&&<p className="text-red-600 pt-1">⚠️ This will put the group fund into deficit.</p>}
                </>}
              </div>
            );
          })()}
          <button onClick={handleCredit} disabled={crediting||!creditName||!creditAmt||!creditDesc} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50">{crediting?'Processing...':'💳 Send & Notify'}</button>
        </div>
      )}
      {isAdmin && showForm && (
        <form onSubmit={submit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name" className="w-full px-3 py-2 border rounded-lg" required />
          <div className="flex gap-3"><select value={bm} onChange={e=>setBm(Number(e.target.value))} className="flex-1 px-3 py-2 border rounded-lg">{MN.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
          <input type="number" min={1} max={31} value={bd} onChange={e=>setBd(Number(e.target.value))} className="w-24 px-3 py-2 border rounded-lg" required /></div>
          <button type="submit" className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium">{editId?"Update":"Add"}</button>
        </form>
      )}
      {finance&&finance.memberTotals&&finance.memberTotals.length>0&&(()=>{
        const debtors=finance.memberTotals.filter(x=>x.totalDebt>0).length;
        const overallTotal=finance.balance+finance.totalBirthdayContributed;
        return(
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className="text-lg font-bold text-green-600">₦{finance.weeklyTotal.toLocaleString()}</div><div className="text-xs text-gray-500">Total Weekly Dues</div></div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className="text-lg font-bold text-pink-600">₦{finance.totalBirthdayContributed.toLocaleString()}</div><div className="text-xs text-gray-500">Total Birthday Contributions</div></div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className="text-lg font-bold text-purple-600">₦{finance.totalSupport.toLocaleString()}</div><div className="text-xs text-gray-500">Total Support</div></div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className={`text-lg font-bold ${finance.totalLateFeesOwed>0?'text-red-600':'text-green-600'}`}>₦{finance.totalLateFeesOwed.toLocaleString()}</div><div className="text-xs text-gray-500">Total Late Fees Owed</div></div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className={`text-lg font-bold ${debtors>0?'text-orange-600':'text-green-600'}`}>{debtors}</div><div className="text-xs text-gray-500">Members Owing</div></div>
            <div className="bg-white rounded-xl p-3 shadow-sm text-center"><div className="text-lg font-bold text-blue-700">₦{overallTotal.toLocaleString()}</div><div className="text-xs text-gray-500">Overall Total</div></div>
          </div>
        );
      })()}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{members.map(m=>{
        const d=daysUntil(m.birthMonth,m.birthDay);
        const s=statsMap[m.id];
        const weeklyPaid=s?s.totalContributed:0;
        const bdayPaid=s?s.birthdayContributed:0;
        const weeklyDebt=s?s.weeklyDebt:0;
        const bdayDebt=s?s.birthdayDebt:0;
        const lateFeeOwed=s?s.lateFeeOwed:0;
        const lateFeePaid=s?s.lateFeePaid:0;
        const totalDebt=s?s.totalDebt:0;
        const payoutTotal=s?s.birthdayPayoutReceived:0;
        const payoutToday=s?s.birthdayPayoutToday:0;
        const supported=s?s.totalSupported:0;
        const credited=s?s.totalCredited:0;
        const creditToday=s?s.creditToday:0;
        return(
        <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-800 truncate">{m.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">🎂 {fmtBday(m.birthMonth,m.birthDay)}</p>
              <p className={`text-xs mt-0.5 font-medium ${d===0?"text-red-600":d<=7?"text-yellow-600":"text-gray-400"}`}>{d===0?"🎉 Today!":d===1?"⏰ Tomorrow!":`${d} days away`}</p>
            </div>
            {isAdmin&&<div className="flex items-center gap-1 shrink-0"><button onClick={()=>openMemberReport(m)} title="Send member financial report" className="text-xs bg-green-50 hover:bg-green-100 text-green-700 px-2 py-1 rounded-md font-semibold whitespace-nowrap">Send Report</button><button onClick={()=>openClearDebt(m)} title="Clear selected member debt" className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 px-2 py-1 rounded-md font-semibold">Clear</button><button onClick={()=>edit(m)} title="Edit member" className="text-gray-400 hover:text-blue-500 p-1">✏️</button></div>}
          </div>

          {payoutToday>0&&(
            <div className="mt-3 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-pink-700">🎁 Birthday payout received today</p>
              <p className="text-lg font-bold text-pink-700">₦{payoutToday.toLocaleString()}</p>
            </div>
          )}

          {creditToday>0&&(
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-blue-700">💳 Credit received today</p>
              <p className="text-lg font-bold text-blue-700">₦{creditToday.toLocaleString()}</p>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">💰 Weekly dues paid</span>
              <span className="font-semibold text-green-600">₦{weeklyPaid.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">🎂 Birthday contributions paid</span>
              <span className="font-semibold text-green-600">₦{bdayPaid.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">⏰ Late fees paid</span>
              <span className="font-semibold text-green-600">₦{lateFeePaid.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
              <span className="text-gray-500">Total contributed</span>
              <span className="font-bold text-green-700">₦{(weeklyPaid+bdayPaid+lateFeePaid).toLocaleString()}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            {weeklyDebt>0&&<div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Weekly dues owed</span>
              <span className={`font-semibold ${weeklyDebt>0?'text-red-600':'text-gray-400'}`}>₦{weeklyDebt.toLocaleString()}</span>
            </div>}
            {bdayDebt>0&&<div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Birthday dues owed</span>
              <span className={`font-semibold ${bdayDebt>0?'text-red-600':'text-gray-400'}`}>₦{bdayDebt.toLocaleString()}</span>
            </div>}
            {lateFeeOwed>0&&<div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Late fees owed</span>
              <span className={`font-semibold ${lateFeeOwed>0?'text-red-600':'text-gray-400'}`}>₦{lateFeeOwed.toLocaleString()}</span>
            </div>}
            {lateFeeOwed>0&&s&&<button onClick={()=>openLateFeePayment(s)} disabled={payingLateFeeId===m.id} className="w-full mt-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50">{payingLateFeeId===m.id?'Recording...':'Select & Mark Late Fee Paid'}</button>}
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
              <span className="text-gray-500">Total debt</span>
              {totalDebt>0
                ? <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">⚠️ ₦{totalDebt.toLocaleString()}</span>
                : <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✅ Clear</span>}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              {supported>0&&(
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">🤝 Supported the group</span>
                  <span className="font-semibold text-purple-600">₦{supported.toLocaleString()}</span>
                </div>
              )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">🎁 Total payout received</span>
              <span className="font-semibold text-pink-600">₦{payoutTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">💳 Total credit sent</span>
              <span className="font-semibold text-blue-600">₦{credited.toLocaleString()}</span>
            </div>
          </div>
        </div>);})}</div>
    </div>
  );
}

// ==================== CONTRIBUTIONS TAB ====================
type WeekDef = { index: number; label: string; date: string; active: boolean };

function ContributionsTab() {
  const [ym, setYm] = useState(curYM());
  const [contribs, setContribs] = useState<ContributionRecord[]>([]);
  const [localC, setLocalC] = useState<Record<number, Record<number, boolean>>>({});
  const [weeks, setWeeks] = useState<WeekDef[]>([]);
  const [loading, setLoading] = useState(true); const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  const [error, setError] = useState<string|null>(null); const [showSum, setShowSum] = useState(false);
  const [summary, setSummary] = useState<{fullyPaid:string[];partialOrUnpaid:Array<{name:string;weeks:number[];paidCount:number}>}|null>(null);

  // Only weeks that exist this month AND fall on/after the group start date.
  const activeWeeks = weeks.filter(w => w.active);

  function weekVal(r: ContributionRecord, i: number): number {
    return (r[`week${i}` as 'week1'|'week2'|'week3'|'week4'|'week5'] ?? 0) as number;
  }

  function apply(list: ContributionRecord[]) {
    setContribs(list);
    const next: Record<number, Record<number, boolean>> = {};
    list.forEach(r => {
      const row: Record<number, boolean> = {};
      for (let i = 1; i <= 5; i++) row[i] = weekVal(r, i) === 1;
      next[r.memberId] = row;
    });
    setLocalC(next);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null); setShowSum(false); setSent(false);
      try {
        const res = await api.getContributions(ym);
        const data = await res.json();
        if (cancelled) return;
        // Fall back to locally computed Saturdays if the backend is older.
        const w: WeekDef[] = Array.isArray(data.weeks) && data.weeks.length
          ? data.weeks
          : monthSaturdays(ym).map((date, i) => ({ index: i+1, label: `Wk${i+1}`, date, active: true }));
        setWeeks(w);
        apply(data.contributions || []);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed'); setContribs([]); setWeeks([]); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const toggle = (memberId: number, i: number) => {
    const rec = contribs.find(c => c.memberId === memberId);
    if (rec && weekVal(rec, i) === 1) return; // locked once paid
    setLocalC(p => ({ ...p, [memberId]: { ...p[memberId], [i]: !p[memberId]?.[i] } }));
  };

  const hasChanges = contribs.some(c => {
    const row = localC[c.memberId];
    if (!row) return false;
    return activeWeeks.some(w => weekVal(c, w.index) === 0 && row[w.index]);
  });

  const update = async () => {
    setUpdating(true); setShowSum(false); setError(null); setSent(false);
    const ups = contribs.map(c => ({
      memberId: c.memberId,
      week1: !!localC[c.memberId]?.[1], week2: !!localC[c.memberId]?.[2],
      week3: !!localC[c.memberId]?.[3], week4: !!localC[c.memberId]?.[4],
      week5: !!localC[c.memberId]?.[5],
    }));
    try {
      const res = await api.updateContributions(ym, ups);
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.weeks) && data.weeks.length) setWeeks(data.weeks);
        apply(data.contributions); setSummary(data.summary); setShowSum(true);
      } else setError(data.error || 'Update failed');
    } catch { setError('Failed'); }
    setUpdating(false);
  };

  const sendReport = async () => {
    setSending(true);
    try {
      const res = await api.sendContributionReport(ym);
      const data = await res.json();
      if (data.success) setSent(true); else setError('Send failed: ' + (data.error || data.response));
    } catch { setError('Connection error'); }
    setSending(false);
  };

  const nav = (dir: number) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setYm(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };

  const paidCountFor = (memberId: number) =>
    activeWeeks.filter(w => localC[memberId]?.[w.index]).length;
  const localTotal = contribs.reduce((s, c) => s + paidCountFor(c.memberId) * 200, 0);
  const monthExpected = contribs.length * activeWeeks.length * 200;
  const skipped = weeks.length - activeWeeks.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">💰 Weekly Dues (₦200)</h2>
        <div className="flex items-center gap-2">
          <button onClick={()=>nav(-1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">←</button>
          <input type="month" value={ym} onChange={e=>setYm(e.target.value)} className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent bg-white" />
          <button onClick={()=>nav(1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">→</button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm opacity-80">Total Contributions</p>
          <p className="text-2xl font-bold">{fmtYM(ym)}</p>
          <p className="text-xs opacity-80 mt-0.5">🗓️ {activeWeeks.length} {activeWeeks.length===1?'week':'weeks'} (Saturdays){skipped>0?` · ${skipped} before group start`:''}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">₦{localTotal.toLocaleString()}</p>
          <p className="text-sm opacity-80">of ₦{monthExpected.toLocaleString()}</p>
        </div>
      </div>

      {error&&<div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">❌ {error}</div>}

      {loading ? <div className="text-center py-8 text-gray-500">Loading...</div>
       : contribs.length===0 ? <div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No members found.</p></div>
       : activeWeeks.length===0 ? <div className="bg-white rounded-xl p-8 text-center shadow-sm"><div className="text-4xl mb-2">🗓️</div><p className="text-gray-500">No contribution weeks for {fmtYM(ym)}.</p><p className="text-xs text-gray-400 mt-1">All Saturdays in this month fall before the group start date.</p></div>
       : (
      <>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Member</th>
                  {activeWeeks.map(w=>(
                    <th key={w.index} className="px-2 py-2 text-center text-sm font-semibold text-gray-700 w-16">
                      <div>{w.label}</div>
                      <div className="text-[10px] font-normal text-gray-400">{w.date.slice(8)}/{w.date.slice(5,7)}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-20">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contribs.map(c=>{
                  const paid = paidCountFor(c.memberId);
                  const complete = activeWeeks.length>0 && paid===activeWeeks.length;
                  return (
                    <tr key={c.memberId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.memberName}</td>
                      {activeWeeks.map(w=>{
                        const locked = weekVal(c, w.index)===1;
                        const checked = !!localC[c.memberId]?.[w.index];
                        return (
                          <td key={w.index} className="px-2 py-3 text-center">
                            <button onClick={()=>toggle(c.memberId,w.index)} disabled={locked}
                              title={locked?`Confirmed · ${w.date}`:`Mark ${w.label} (${w.date}) paid`}
                              className={`w-8 h-8 rounded-lg text-lg transition-all ${locked?'bg-green-100 text-green-600 cursor-not-allowed':checked?'bg-green-500 text-white hover:bg-green-600':'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                              {checked?'✓':''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-semibold ${complete?'text-green-600':'text-gray-600'}`}>₦{(paid*200).toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <button onClick={update} disabled={updating||!hasChanges} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{updating?'Updating...':'✅ Update Records'}</button>

        {showSum&&summary&&(
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">📊 Summary – {fmtYM(ym)}</h3>
              {summary.fullyPaid.length>0&&<div className="mb-4"><h4 className="text-sm font-medium text-green-700 mb-2">✅ Fully Paid ({summary.fullyPaid.length})</h4><div className="flex flex-wrap gap-2">{summary.fullyPaid.map((n,i)=><span key={i} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">{n}</span>)}</div></div>}
              {summary.partialOrUnpaid.length>0&&<div><h4 className="text-sm font-medium text-orange-700 mb-2">⏳ Pending ({summary.partialOrUnpaid.length})</h4><div className="space-y-1">{summary.partialOrUnpaid.map((m,i)=><div key={i} className="flex items-center justify-between bg-orange-50 px-3 py-2 rounded-lg"><span className="text-sm">{m.name}</span><span className="text-sm text-orange-600">{m.weeks.map(w=>w?'✅':'❌').join('')} ₦{m.paidCount*200}</span></div>)}</div></div>}
            </div>
            <button onClick={sendReport} disabled={sending||sent} className={`w-full font-semibold py-3 rounded-lg transition-colors ${sent?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-accent hover:bg-accent-dark text-white disabled:opacity-50'}`}>{sent?'✅ Report Sent':sending?'Sending...':'📲 Send Report to WhatsApp'}</button>
          </div>
        )}

        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700"><strong>ℹ️</strong> Each week is one Saturday, so a month has 4 or 5 weeks. Locked ✓ means confirmed and cannot be undone.</div>
      </>)}
    </div>
  );
}


// ==================== BIRTHDAY CONTRIBUTIONS TAB ====================
function BdayContribTab({ members, onRefresh }: { members: Member[]; onRefresh: () => void }) {
  const [year, setYear] = useState(lagosNow().getFullYear()); const [selectedId, setSelectedId] = useState<number|null>(null);
  const [bdayList, setBdayList] = useState<Array<{id:number;name:string;birthMonth:number;birthDay:number;paidCount:number;totalPaid:number;paidOut:boolean}>>([]);
  const [contributors, setContributors] = useState<BdayContributor[]>([]); const [localPaid, setLocalPaid] = useState<Record<number,boolean>>({});
  const [loading, setLoading] = useState(true); const [updating, setUpdating] = useState(false); const [bdayName, setBdayName] = useState(""); const [payingOut, setPayingOut] = useState(false);
  const [paidOut, setPaidOut] = useState(false);
  const [waFailure, setWaFailure] = useState<{logId:number;label:string}|null>(null); const [retrying, setRetrying] = useState(false);
  const [showPayoutConfirm,setShowPayoutConfirm]=useState(false);
  const [payoutDebt,setPayoutDebt]=useState({weeklyDebt:0,birthdayDebt:0,lateFeeDebt:0,totalDeduction:0,netPayout:20000});

  const fetchList = async()=>{setLoading(true);try{const r=await api.getBirthdayContributions(year);const d=await r.json();setBdayList(d.members||[]);}catch{}setLoading(false);};
  useEffect(()=>{fetchList();},[year]);
  const selectMember = async(id:number)=>{setSelectedId(id);try{const r=await api.getBirthdayContributionDetail(id,year);const d=await r.json();setContributors(d.contributors||[]);setBdayName(d.birthdayMemberName||'');setPaidOut(d.paidOut||false);setPayoutDebt({weeklyDebt:d.weeklyDebtDeduction||0,birthdayDebt:d.birthdayDebtDeduction||0,lateFeeDebt:d.lateFeeDebtDeduction||0,totalDeduction:d.celebrantTotalDeduction||0,netPayout:d.netPayout??20000});
    const lp:Record<number,boolean>={};(d.contributors||[]).forEach((c:BdayContributor)=>{lp[c.memberId]=c.paid===1;});setLocalPaid(lp);}catch{}};
  const togglePaid=(id:number)=>{const orig=contributors.find(c=>c.memberId===id);if(orig&&orig.paid===1)return;setLocalPaid(p=>({...p,[id]:!p[id]}));};
  const hasChanges=contributors.some(c=>c.paid===0&&localPaid[c.memberId]);
  const handleUpdate=async()=>{if(!selectedId)return;setUpdating(true);const ups=contributors.map(c=>({memberId:c.memberId,paid:localPaid[c.memberId]||false,amount:c.amount}));
    try{await api.updateBirthdayContributions(selectedId,year,ups);await selectMember(selectedId);await fetchList();}catch{}setUpdating(false);};
  const requestPayout=()=>{if(hasChanges){alert('Save the contribution updates before processing this payout.');return;}setShowPayoutConfirm(true);};
  const handlePayout=async()=>{if(!selectedId)return;setShowPayoutConfirm(false);
    setPayingOut(true);try{const response=await api.birthdayPayout(selectedId,year);const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Payout failed');if(!data.waSent)setWaFailure({logId:data.logId,label:bdayName+' payout'});else setWaFailure(null);await fetchList();await selectMember(selectedId);await onRefresh();alert(`Payout completed. Net amount: ₦${data.payoutAmount.toLocaleString()}. Debts cleared: ₦${data.totalDebtDeducted.toLocaleString()}. New late fees: ₦${data.lateFeeTotal.toLocaleString()}.${data.waSent?'':' The WhatsApp message failed; use Retry WhatsApp.'}`);}catch(error){alert(error instanceof Error?error.message:'Payout failed');}setPayingOut(false);};
  const retryWhatsApp=async()=>{if(!waFailure)return;setRetrying(true);try{const response=await api.retryMessage(waFailure.logId);const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Retry failed');setWaFailure(null);await onRefresh();}catch(error){alert(error instanceof Error?error.message:'Retry failed');}finally{setRetrying(false);}};

  if(selectedId){
    const totalCollected=contributors.reduce((s,c)=>s+(localPaid[c.memberId]?c.amount:0),0);
    const debtors=contributors.filter(c=>!localPaid[c.memberId]); const paidContributors=contributors.filter(c=>localPaid[c.memberId]);
    const BDAY_PAYOUT=20000; const shortfall=BDAY_PAYOUT-totalCollected;
    return(
    <div className="space-y-4">
      {waFailure&&<div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-red-700">WhatsApp message failed</p><p className="text-xs text-red-600">The payout and late fees were saved, but the {waFailure.label} announcement was not sent.</p></div><button onClick={retryWhatsApp} disabled={retrying} className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{retrying?'Retrying...':'Retry WhatsApp'}</button></div>}
      {showPayoutConfirm&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"><div><h3 className="text-lg font-bold text-gray-800">Confirm Birthday Payout</h3><p className="text-sm text-gray-500 mt-1">Review {bdayName}&apos;s payout before approval.</p></div><div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2"><div className="flex justify-between"><span>Gross payout</span><strong>₦20,000</strong></div><div className="flex justify-between"><span>Weekly dues to clear</span><strong className="text-red-600">−₦{payoutDebt.weeklyDebt.toLocaleString()}</strong></div><div className="flex justify-between"><span>Birthday debts to clear</span><strong className="text-red-600">−₦{payoutDebt.birthdayDebt.toLocaleString()}</strong></div><div className="flex justify-between"><span>Late fees to clear</span><strong className="text-red-600">−₦{payoutDebt.lateFeeDebt.toLocaleString()}</strong></div><div className="flex justify-between pt-2 border-t"><span>Net payout</span><strong className="text-green-700">₦{payoutDebt.netPayout.toLocaleString()}</strong></div><div className="flex justify-between pt-2"><span>Current-event debtors</span><strong>{debtors.length}</strong></div><div className="flex justify-between"><span>New late fees to add</span><strong className="text-red-600">₦{(debtors.length*500).toLocaleString()}</strong></div></div><div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="font-semibold text-red-700">⚠️ Warning</p><p className="text-sm text-red-700 mt-1">Once the payout is confirmed, each current-event debtor will be charged a ₦500 late fee. {bdayName}&apos;s listed weekly dues, birthday debts and late fees will be deducted and cleared.</p></div><div className="flex gap-3"><button onClick={()=>setShowPayoutConfirm(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold">Cancel</button><button onClick={handlePayout} disabled={payingOut} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">{payingOut?'Processing...':'Approve'}</button></div></div></div>}
      <div className="flex items-center gap-2 flex-wrap"><button onClick={()=>setSelectedId(null)} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm">← Back</button><h2 className="text-xl font-bold text-gray-800">🎂 {bdayName}&apos;s Birthday Fund</h2>{paidOut&&<span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">✅ Paid Out</span>}</div>
      <div className="bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-2"><div><p className="text-sm opacity-80">Birthday Fund</p><p className="text-lg font-bold">{bdayName}</p></div><div className="text-right"><p className="text-3xl font-bold">₦{totalCollected.toLocaleString()}</p><p className="text-sm opacity-80">of ₦{BDAY_PAYOUT.toLocaleString()} payout</p></div></div>
        <div className="w-full bg-white/20 rounded-full h-2"><div className="bg-white h-2 rounded-full transition-all" style={{width:`${Math.min(100,Math.round(totalCollected/BDAY_PAYOUT*100))}%`}}></div></div>
        <div className="flex justify-between mt-1 text-xs opacity-80"><span>{paidContributors.length} paid · {debtors.length} pending</span>{shortfall>0&&<span>₦{shortfall.toLocaleString()} from group funds</span>}</div>
      </div>
      {debtors.length>0&&<div className="bg-red-50 rounded-xl p-3"><p className="text-sm font-medium text-red-700 mb-1">⚠️ Debtors ({debtors.length}) — ₦{(debtors.length*1000).toLocaleString()} outstanding:</p><p className="text-sm text-red-600">{debtors.map(d=>d.memberName).join(', ')}</p></div>}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Contributor</th><th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-20">₦1,000</th><th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-24">Status</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{contributors.map(c=>{const lk=c.paid===1;const ch=localPaid[c.memberId];const isDebtor=paidOut&&!ch;return(
        <tr key={c.memberId} className={`hover:bg-gray-50 ${isDebtor?'bg-red-50':''}`}><td className="px-4 py-3 text-sm font-medium text-gray-800">{c.memberName}{isDebtor&&<span className="ml-1 text-xs text-red-600">⚠️</span>}</td>
        <td className="px-4 py-3 text-center"><button onClick={()=>togglePaid(c.memberId)} disabled={lk} className={`w-8 h-8 rounded-lg text-lg transition-all ${lk?'bg-green-100 text-green-600 cursor-not-allowed':ch?'bg-green-500 text-white hover:bg-green-600':'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{ch?'✓':''}</button></td>
        <td className="px-4 py-3 text-center text-sm">{ch?<span className="text-green-600 font-medium">Paid</span>:isDebtor?<span className="text-red-600 font-medium">Debtor</span>:<span className="text-gray-400">—</span>}</td></tr>);})}</tbody></table></div></div>
      <button onClick={handleUpdate} disabled={updating||!hasChanges} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{updating?'Updating...':'✅ Update & Send to Group'}</button>
      <button onClick={requestPayout} disabled={payingOut||paidOut||hasChanges} className={`w-full font-semibold py-3 rounded-lg ${paidOut?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50'}`}>{paidOut?'✅ ₦20,000 Payout Already Sent':hasChanges?'Save Contribution Updates Before Payout':payingOut?'Processing...':'💰 Send ₦20,000 Payout (₦'+totalCollected.toLocaleString()+' collected'+(shortfall>0?' + ₦'+shortfall.toLocaleString()+' from group':'')+')'}</button>
      {paidOut&&debtors.length>0&&<div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-700"><strong>ℹ️</strong> {debtors.length} member(s) still owe ₦{(debtors.length*1000).toLocaleString()} in birthday contributions plus ₦{(debtors.length*500).toLocaleString()} in late fees. Contribution payments are recorded here; late-fee payments are recorded from the Members tab.</div>}
    </div>);
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2"><h2 className="text-xl font-bold text-gray-800">🎂 Birthday Fund (₦20,000 payout)</h2>
        <div className="flex items-center gap-2"><button onClick={()=>setYear(y=>y-1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">←</button>
        <span className="px-4 py-2 bg-white rounded-lg shadow-sm font-semibold">{year}</span>
        <button onClick={()=>setYear(y=>y+1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">→</button></div>
      </div>
      {loading?<div className="text-center py-8 text-gray-500">Loading...</div>:
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{bdayList.map(m=>(
        <button key={m.id} onClick={()=>selectMember(m.id)} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left w-full">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-800">{m.name}</h3>{m.paidOut&&<span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Paid ✅</span>}</div>
          <p className="text-sm text-gray-500 mt-1">🎂 {fmtBday(m.birthMonth,m.birthDay)}</p>
          <div className="flex items-center justify-between mt-2"><span className="text-xs text-gray-400">{m.paidCount} paid</span><span className="text-sm font-bold text-green-600">₦{m.totalPaid.toLocaleString()}</span></div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2"><div className="bg-green-500 h-2 rounded-full transition-all" style={{width:`${members.length>1?Math.round(m.paidCount/(members.length-1)*100):0}%`}}></div></div>
        </button>))}</div>}
    </div>
  );
}

// ==================== SCHEDULER TAB ====================
function SchedulerTab({ messages, cronEvents, onRefresh, isAdmin }: { messages: ScheduledMessage[]; cronEvents: UpcomingCronEvent[]; onRefresh: () => void; isAdmin: boolean }) {
  const [show, setShow] = useState(false); const [eId, setEId] = useState<number|null>(null); const [msg, setMsg] = useState(""); const [sDate, setSDate] = useState(""); const [sTime, setSTime] = useState("08:00");
  const [filter, setFilter] = useState<'pending'|'sent'|'all'>('pending'); const [sub, setSub] = useState(false);
  const reset=()=>{setMsg("");setSDate("");setSTime("08:00");setEId(null);setShow(false);};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!msg||!sDate||!sTime)return;setSub(true);const at=`${sDate} ${sTime}:00`;if(eId)await api.updateScheduledMessage(eId,msg,at);else await api.addScheduledMessage(msg,at);setSub(false);reset();onRefresh();};
  const filtered=messages.filter(m=>filter==='all'||m.status===filter);
  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2"><h2 className="text-xl font-bold text-gray-800">📅 Message Scheduler</h2>{isAdmin&&<button onClick={()=>{reset();setShow(!show);}} className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-medium">{show?"Cancel":"+ Schedule"}</button>}</div>
      {!isAdmin&&<div className="bg-yellow-50 rounded-xl p-3 text-sm text-yellow-700">🔒 Read-only access. Contact main admin to schedule messages.</div>}
      <div className="grid grid-cols-2 gap-4"><div className="bg-blue-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-blue-600">{messages.filter(m=>m.status==='pending').length}</div><div className="text-sm text-blue-600">Pending</div></div><div className="bg-green-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-green-600">{messages.filter(m=>m.status==='sent').length}</div><div className="text-sm text-green-600">Sent</div></div></div>
      <div className="bg-white rounded-xl p-3 shadow-sm"><h3 className="text-xs font-semibold text-gray-600 mb-2">Upcoming Cron Events</h3>{cronEvents.length===0?<p className="text-[11px] text-gray-400">No upcoming automatic events.</p>:<div className="divide-y divide-gray-100">{cronEvents.map((event,index)=><div key={`${event.scheduledAt}-${event.title}-${index}`} className="flex items-center justify-between gap-3 py-1.5"><span className="text-xs text-gray-700 truncate">{event.title}</span><span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDT(event.scheduledAt)}</span></div>)}</div>}</div>
      {isAdmin&&show&&<form onSubmit={submit} className="bg-white rounded-xl p-4 shadow-sm space-y-4"><textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg" placeholder="Message..." required /><div className="grid grid-cols-2 gap-4"><input type="date" value={sDate} onChange={e=>setSDate(e.target.value)} min={lagosToday()} className="w-full px-3 py-2 border rounded-lg" required /><input type="time" value={sTime} onChange={e=>setSTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required /></div><p className="text-xs text-gray-500">🕐 Date and time are in West Africa Time (WAT).</p><button type="submit" disabled={sub} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{sub?"Saving...":eId?"Update":"Schedule"}</button></form>}
      <div className="flex gap-2">{(['pending','sent','all'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter===f?'bg-primary text-white':'bg-white text-gray-600 hover:bg-gray-100'}`}>{f[0].toUpperCase()+f.slice(1)}</button>)}<button onClick={onRefresh} className="ml-auto bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">🔄</button></div>
      {filtered.length===0?<div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No messages</p></div>:
      <div className="max-h-96 overflow-y-auto space-y-3 pr-1">{filtered.map(m=><div key={m.id} className="bg-white rounded-xl p-4 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full ${m.status==='pending'?'bg-blue-500':'bg-green-500'}`}></span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status==='pending'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>{m.status}</span><span className="text-xs text-gray-400">📆 {fmtDT(m.scheduledAt)}</span></div><p className="text-sm text-gray-800 whitespace-pre-wrap">{m.message}</p>{m.sentAt&&<p className="text-xs text-gray-400 mt-2">Sent: {fmtDT(m.sentAt)}</p>}</div>
      {isAdmin&&m.status==='pending'&&<div className="flex gap-1"><button onClick={()=>{const p=splitDbDateTime(m.scheduledAt);setEId(m.id);setMsg(m.message);setSDate(p?p.date:lagosToday());setSTime(p?p.time:'08:00');setShow(true);}} className="text-gray-400 hover:text-blue-500 p-1">✏️</button><button onClick={async()=>{if(confirm('Delete?')){await api.deleteScheduledMessage(m.id);onRefresh();}}} className="text-gray-400 hover:text-red-500 p-1">🗑️</button></div>}</div></div>)}</div>}
    </div>
  );
}

// ==================== SEND TAB ====================
function SendTab({ members, settings, onRefresh, isAdmin }: { members: Member[]; settings: Settings; onRefresh: () => void; isAdmin: boolean }) {
  const [sel, setSel] = useState<number|"">(""); const [mt, setMt] = useState<"7day"|"1day"|"birthday">("birthday"); const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{success:boolean;message:string}|null>(null); const [preview, setPreview] = useState(""); const [custom, setCustom] = useState(""); const [useC, setUseC] = useState(false);
  useEffect(()=>{if(sel&&!useC){const m=members.find(x=>x.id===Number(sel));if(m){const t=settings[`message_${mt}`]||"";setPreview(t.replace(/\{name\}/g,m.name).replace(/\{date\}/g,fmtBday(m.birthMonth,m.birthDay)));}}}, [sel,mt,settings,members,useC]);
  const send=async()=>{if(!sel)return;setSending(true);setResult(null);const m=members.find(x=>x.id===Number(sel));if(!m)return;
    try{const r=useC&&custom?await api.sendMessage(m.name,"custom",custom):await api.testSend(Number(sel),mt);const d=await r.json();setResult({success:d.success||false,message:d.error||(d.success?"Sent!":"Failed: "+d.response)});}catch{setResult({success:false,message:"Error"});}setSending(false);onRefresh();};
  if(!isAdmin) return(<div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">📨 Send Message</h2><div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-700">🔒 Read-only access. Contact main admin to send messages.</div></div>);
  return(
    <div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">📨 Send Message</h2>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <select value={sel} onChange={e=>setSel(e.target.value?Number(e.target.value):"")} className="w-full px-3 py-2 border rounded-lg"><option value="">-- Select member --</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} ({fmtBday(m.birthMonth,m.birthDay)})</option>)}</select>
        <div className="flex gap-2 flex-wrap">{([{k:"7day" as const,l:"7-Day 📅"},{k:"1day" as const,l:"1-Day ⏰"},{k:"birthday" as const,l:"Birthday 🎂"}]).map(t=><button key={t.k} onClick={()=>{setMt(t.k);setUseC(false);}} className={`px-4 py-2 rounded-lg text-sm font-medium ${mt===t.k&&!useC?"bg-primary text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{t.l}</button>)}<button onClick={()=>setUseC(!useC)} className={`px-4 py-2 rounded-lg text-sm font-medium ${useC?"bg-primary text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Custom ✍️</button></div>
        {useC&&<textarea value={custom} onChange={e=>setCustom(e.target.value)} rows={5} className="w-full px-3 py-2 border rounded-lg" placeholder="Custom message..." />}
        {!useC&&preview&&<div className="bg-green-50 rounded-lg p-4 text-sm whitespace-pre-wrap border border-green-200">{preview}</div>}
        <button onClick={send} disabled={sending||!sel||(useC&&!custom)} className="w-full bg-accent hover:bg-accent-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{sending?"Sending...":"Send 📲"}</button>
        {result&&<div className={`p-3 rounded-lg text-sm ${result.success?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{result.success?"✅":"❌"} {result.message}</div>}
      </div>
    </div>
  );
}

// ==================== SETTINGS TAB ====================
function SettingsTab({ settings, onRefresh, isAdmin }: { settings: Settings; onRefresh: () => void; isAdmin: boolean }) {
  const [at, setAt] = useState(settings.whatsapp_access_token||""); const [ii, setIi] = useState(settings.whatsapp_instance_id||""); const [gi, setGi] = useState(settings.whatsapp_group_id||"");
  const [gn, setGn] = useState(settings.whatsapp_group_name||""); const [cs, setCs] = useState(settings.cron_secret||""); const [ad, setAd] = useState(settings.account_details||"");
  const [publicAppUrl, setPublicAppUrl] = useState(settings.public_app_url||"");
  const [sig, setSig] = useState(settings.report_signature_name||"");
  const [autoDebtorsReport, setAutoDebtorsReport] = useState(settings.automatic_debtors_report_enabled==='1');
  const [m7, setM7] = useState(settings.message_7day||""); const [m1, setM1] = useState(settings.message_1day||""); const [mb, setMb] = useState(settings.message_birthday||"");
  const [pw, setPw] = useState(""); const [cpw, setCpw] = useState(""); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [saveError, setSaveError] = useState("");
  const save=async()=>{
    setSaving(true);setSaved(false);setSaveError("");
    const rawGroupId=gi.trim().replace(/\s+/g,'');
    const normalizedGroupId=rawGroupId&&/^[0-9-]+$/.test(rawGroupId)?`${rawGroupId}@g.us`:rawGroupId.toLowerCase();
    const u:Record<string,string>={whatsapp_access_token:at,whatsapp_instance_id:ii,whatsapp_group_id:normalizedGroupId,whatsapp_group_name:gn,cron_secret:cs,account_details:ad,public_app_url:publicAppUrl.trim().replace(/\/+$/,''),report_signature_name:sig,automatic_debtors_report_enabled:autoDebtorsReport?'1':'0',message_7day:m7,message_1day:m1,message_birthday:mb};
    if(pw)u.app_password=pw;if(cpw)u.contrib_admin_password=cpw;
    try{
      const response=await api.updateSettings(u);const data=await response.json();
      if(!response.ok||data.error){setSaveError(data.error||'Unable to save settings.');}
      else{setGi(normalizedGroupId);setSaved(true);setTimeout(()=>setSaved(false),3000);onRefresh();}
    }catch{setSaveError('Unable to connect to the backend.');}
    setSaving(false);
  };
  const cronUrl=`${getApiBaseUrl()}/api/cron.php?secret=${cs}`;
  if(!isAdmin) return(<div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">⚙️ Settings</h2><div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-700">🔒 Read-only. Contact main admin to change settings.</div>
    <div className="bg-white rounded-xl p-4 shadow-sm space-y-2"><p className="text-sm"><strong>Group:</strong> {settings.whatsapp_group_name||'Not set'}</p><p className="text-sm"><strong>Cron URL:</strong></p><div className="bg-gray-50 p-2 rounded text-xs font-mono break-all border">{cronUrl}</div></div></div>);
  return(
    <div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">⚙️ Settings</h2>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">WA Client API</h3>
        <input type="password" value={at} onChange={e=>setAt(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Access Token" />
        <input type="text" value={ii} onChange={e=>setIi(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Instance ID" />
        <div>
          <label className="block text-sm text-gray-600 mb-1">WhatsApp Group ID</label>
          <input type="text" value={gi} onChange={e=>setGi(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="120363419701508982@g.us" />
          <p className="text-xs text-gray-500 mt-1">Enter the full group ID ending in <strong>@g.us</strong>. If you enter only the numeric ID, the app adds @g.us automatically.</p>
        </div>
        <input type="text" value={gn} onChange={e=>setGn(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Group Name" />
        <div><label className="block text-sm text-gray-600 mb-1">Public App URL</label><input type="url" value={publicAppUrl} onChange={e=>setPublicAppUrl(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="https://your-app.vercel.app"/><p className="text-xs text-gray-500 mt-1">Used to create the read-only report links included in WhatsApp messages.</p></div>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">Cron Job</h3>
        <input type="text" value={cs} onChange={e=>setCs(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Cron Secret" />
        <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono break-all border">{cronUrl}</div>
        <label className="flex items-center justify-between gap-4 border rounded-lg p-3 cursor-pointer"><div><p className="text-sm font-semibold text-gray-700">Automatic Debtors Report</p><p className="text-xs text-gray-500">Send to the WhatsApp group every Saturday at 7:00 AM WAT.</p></div><input type="checkbox" checked={autoDebtorsReport} onChange={e=>setAutoDebtorsReport(e.target.checked)} className="w-5 h-5" /></label>
        <p className="text-xs text-orange-600">Your hosting cron job must call this URL regularly, including shortly after 7:00 AM.</p>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">🏦 Account Details</h3><p className="text-xs text-gray-500">Included in WhatsApp notifications</p>
        <textarea value={ad} onChange={e=>setAd(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"Bank: Access Bank\nAccount Name: Umu Emily\nAccount Number: 1234567890"} />
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">✍️ Report Signature</h3>
        <p className="text-xs text-gray-500">Added to the bottom of weekly dues and birthday reports sent to the group.</p>
        <input type="text" value={sig} onChange={e=>setSig(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Precious Egwuatu" />
        <div className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-600">
          <p className="text-gray-400 mb-1">Preview:</p>
          {sig.trim()
            ? <p className="font-mono">━━━━━━━━━━━━━━━━━━━━━<br/>Signed By ✍️ {sig.trim()}</p>
            : <p className="italic text-gray-400">No signature will be added.</p>}
        </div>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">Templates</h3><p className="text-xs text-gray-500">Use {"{name}"} and {"{date}"}</p>
        <textarea value={m7} onChange={e=>setM7(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="7-Day" />
        <textarea value={m1} onChange={e=>setM1(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="1-Day" />
        <textarea value={mb} onChange={e=>setMb(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Birthday" />
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">🔐 Passwords</h3>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="New main admin password (blank=keep)" />
        <input type="password" value={cpw} onChange={e=>setCpw(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="New contributor admin password (blank=keep)" />
      </div>
      {saveError&&<div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">❌ {saveError}</div>}
      <button onClick={save} disabled={saving} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{saving?"Saving...":saved?"✅ Saved!":"Save Settings"}</button>
    </div>
  );
}

// ==================== LOGS TAB ====================
function LogsTab({ logs, onRefresh }: { logs: LogEntry[]; onRefresh: () => void }) {
  const [retryingId,setRetryingId]=useState<number|null>(null);
  const retry=async(logId:number)=>{setRetryingId(logId);try{const response=await api.retryMessage(logId);const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Retry failed');await onRefresh();}catch(error){alert(error instanceof Error?error.message:'Retry failed');}finally{setRetryingId(null);}};
  return(
    <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-gray-800">📋 Message Logs</h2><button onClick={onRefresh} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">🔄</button></div>
      {logs.length===0?<div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No messages yet</p></div>:
      <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">{logs.map(l=><div key={l.id} className="bg-white rounded-xl p-4 shadow-sm"><div className="flex items-start justify-between flex-wrap gap-2"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${l.status==="sent"?"bg-green-500":"bg-red-500"}`}></span><span className="font-medium text-gray-800">{l.memberName}</span><span className={`text-xs px-2 py-0.5 rounded-full ${l.messageType==="birthday"?"bg-pink-100 text-pink-700":l.messageType==="contribution"?"bg-green-100 text-green-700":l.messageType==="birthday_contribution"||l.messageType==="birthday_payout"?"bg-pink-100 text-pink-700":l.messageType==="credit"?"bg-blue-100 text-blue-700":"bg-purple-100 text-purple-700"}`}>{l.messageType}</span></div><div className="flex items-center gap-2"><span className="text-xs text-gray-400">{fmtDT(l.sentAt)}</span>{l.status!=="sent"&&<button onClick={()=>retry(l.id)} disabled={retryingId===l.id} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">{retryingId===l.id?'Retrying...':'Retry WhatsApp'}</button>}</div></div><p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap line-clamp-3">{l.message}</p></div>)}</div>}
    </div>
  );
}

// ==================== MAIN APP ====================
export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false); const [checking, setChecking] = useState(true); const [role, setRole] = useState<Role>('admin');
  useEffect(()=>{(async()=>{const t=localStorage.getItem("auth_token");if(t){try{const response=await api.validateSession();const data=await response.json();if(response.ok&&data.success){setLoggedIn(true);setRole((data.role as Role)||'admin');localStorage.setItem("auth_role",data.role||'admin');}else{localStorage.removeItem("auth_token");localStorage.removeItem("auth_role");}}catch{/* Keep the user logged out when the session cannot be verified. */}}setChecking(false);})();},[]);
  if(checking) return <div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce">🎂</div></div>;
  if(!loggedIn) return <LoginPage onLogin={(r)=>{setLoggedIn(true);setRole(r);}}/>;
  return <Dashboard role={role} onLogout={()=>{localStorage.removeItem("auth_token");localStorage.removeItem("auth_role");setLoggedIn(false);}}/>;
}
