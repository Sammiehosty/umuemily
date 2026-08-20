"use client";
import { useState, useEffect } from "react";
import { api, getApiBaseUrl } from "@/lib/api";

type Member = { id: number; name: string; birthMonth: number; birthDay: number };
type LogEntry = { id: number; memberName: string; messageType: string; message: string; status: string; response?: string | null; sentAt: string };
type ScheduledMessage = { id: number; message: string; scheduledAt: string; status: string; sentAt?: string | null };
type ContributionRecord = { memberId: number; memberName: string; yearMonth: string; week1: number; week2: number; week3: number; week4: number; week5: number; memberTotal?: number };
type DashboardData = { upcomingBirthdays: Array<{ id: number; name: string; birthMonth: number; birthDay: number; daysUntil: number }>; upcomingScheduled: ScheduledMessage[]; recentLogs: LogEntry[]; stats: { totalMembers: number; totalMessagesSent: number; pendingScheduled: number; upcomingBirthdays: number }; waClient: { configured: boolean; groupId: string; groupName: string; instanceId: string }; serverTime: string; timezone: string };
type Settings = Record<string, string>;
type FinanceData = { weeklyTotal: number; totalSupport: number; totalDebtRecovery: number; totalDeductions: number; balance: number; outstandingDebt: number; transactions: Array<{ id: number; type: string; amount: number; description: string; memberName: string; createdAt: string }>; memberTotals: Array<{ memberId: number; memberName: string; totalContributed: number }> };
type BdayContributor = { memberId: number; memberName: string; paid: number; amount: number };
type Role = 'admin' | 'contrib';

const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function ord(d: number) { if (d>=11&&d<=13) return "th"; switch(d%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th";} }
function fmtBday(m: number, d: number) { return `${MN[m-1]} ${d}${ord(d)}`; }
function fmtDT(s: string) { return new Date(s).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}); }
function daysUntil(m: number, d: number) { const n=new Date(),y=n.getFullYear(); let b=new Date(y,m-1,d); if(b<n) b=new Date(y+1,m-1,d); return Math.ceil((b.getTime()-n.getTime())/(864e5)); }
function curYM() { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
function fmtYM(ym: string) { const [y,m]=ym.split('-'); return `${MN[parseInt(m)-1]} ${y}`; }
function txnColor(t: string) { if (t==='support'||t==='debt_recovery') return 'text-green-600'; if (t==='birthday_payout'||t==='weekly_deduction'||t==='credit') return 'text-red-600'; return 'text-gray-600'; }
function txnSign(t: string) { if (t==='support'||t==='debt_recovery') return '+'; return '-'; }

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
  const [dash, setDash] = useState<DashboardData|null>(null); const [sched, setSched] = useState<ScheduledMessage[]>([]); const [finance, setFinance] = useState<FinanceData|null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = role === 'admin';

  const fetchAll = async () => {
    try {
      const [mR,sR,lR,dR,scR,fR] = await Promise.all([api.getMembers(),api.getSettings(),api.getLogs(),api.getDashboard(),api.getScheduledMessages('all'),api.getFinance()]);
      setMembers(await mR.json()); setSettings(await sR.json()); setLogs(await lR.json()); setDash(await dR.json()); setSched(await scR.json()); setFinance(await fR.json());
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="text-4xl animate-bounce mb-4">👥</div><p className="text-gray-500">Loading...</p></div></div>;

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
      <header className="bg-primary text-white shadow-lg"><div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-3xl">👥</span><div><h1 className="text-lg font-bold">Umu Emily Family Manager</h1><p className="text-xs text-green-200">{isAdmin?'Admin':'Contributor Admin'} • Birthdays • Contributions</p></div></div><button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm">Logout</button></div></header>
      <div className="max-w-6xl mx-auto px-4 mt-4"><div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm overflow-x-auto">
        {tabs.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={`flex-1 py-2 px-1 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${tab===t.key?"bg-primary text-white":"text-gray-600 hover:bg-gray-100"}`}><span className="hidden md:inline">{t.label}</span><span className="md:hidden">{t.ml}</span></button>)}
      </div></div>
      <div className="max-w-6xl mx-auto px-4 py-4 pb-8">
        {tab==="dashboard"&&<DashboardTab data={dash} finance={finance} onRefresh={fetchAll} isAdmin={isAdmin}/>}
        {tab==="members"&&<MembersTab members={members} finance={finance} onRefresh={fetchAll} isAdmin={isAdmin}/>}
        {tab==="contributions"&&<ContributionsTab/>}
        {tab==="bdayContrib"&&<BdayContribTab members={members}/>}
        {tab==="scheduler"&&<SchedulerTab messages={sched} onRefresh={()=>api.getScheduledMessages('all').then(r=>r.json()).then(setSched)} isAdmin={isAdmin}/>}
        {tab==="send"&&<SendTab members={members} settings={settings} onRefresh={()=>api.getLogs().then(r=>r.json()).then(setLogs)} isAdmin={isAdmin}/>}
        {tab==="settings"&&<SettingsTab settings={settings} onRefresh={()=>api.getSettings().then(r=>r.json()).then(setSettings)} isAdmin={isAdmin}/>}
        {tab==="logs"&&<LogsTab logs={logs} onRefresh={()=>api.getLogs().then(r=>r.json()).then(setLogs)}/>}
      </div>
    </div>
  );
}


// ==================== DASHBOARD TAB ====================
function DashboardTab({ data, finance, onRefresh, isAdmin }: { data: DashboardData|null; finance: FinanceData|null; onRefresh: () => void; isAdmin: boolean }) {
  const [showTxns, setShowTxns] = useState(false);
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
              <p className={`font-semibold ${txnColor(t.type)}`}>{txnSign(t.type)}₦{t.amount.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{fmtDT(t.createdAt)}</p>
              {isAdmin && <button onClick={async()=>{if(confirm(`Delete this transaction?\n\n${t.description}\n₦${t.amount.toLocaleString()}\n\nThe funds will be reversed.`)){await api.deleteTransaction(t.id);onRefresh();}}} className="text-xs text-red-400 hover:text-red-600 mt-1">🗑️ Delete</button>}
            </div>
          </div>))}
      </div>}
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-800">📊 Dashboard</h2>
        <div className="flex gap-2">
          <button onClick={()=>setShowTxns(!showTxns)} className={`px-4 py-2 rounded-lg text-sm font-medium ${showTxns?'bg-primary text-white':'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>{showTxns?'Hide':'💳 Transactions'}</button>
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
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4"><p className="text-xs opacity-80">Deducted</p><p className="text-xl font-bold">₦{finance.totalDeductions.toLocaleString()}</p></div>
          <div className={`bg-gradient-to-r ${finance.balance<0?'from-red-500 to-red-600':'from-primary to-primary-dark'} text-white rounded-xl p-4`}><p className="text-xs opacity-80">Balance</p><p className="text-xl font-bold">{finance.balance<0?'-':''}₦{Math.abs(finance.balance).toLocaleString()}</p></div>
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
      <div className="text-center text-xs text-gray-400">Server: {data.serverTime} ({data.timezone})</div>
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

  const reset = () => { setName(""); setBm(1); setBd(1); setEditId(null); setShowForm(false); };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if(editId) await api.updateMember(editId,name,bm,bd); else await api.addMember(name,bm,bd); reset(); onRefresh(); };
  const edit = (m: Member) => { setEditId(m.id); setName(m.name); setBm(m.birthMonth); setBd(m.birthDay); setShowForm(true); setActivePanel('none'); };
  const handleCredit = async () => { if (!creditName||!creditAmt||!creditDesc) return; setCrediting(true); await api.sendCredit(creditName, parseInt(creditAmt), creditDesc); setCreditName(""); setCreditAmt(""); setCreditDesc(""); setCrediting(false); setActivePanel('none'); onRefresh(); };
  const handleSupport = async () => { if (!supName||!supAmt) return; setSupporting(true); await api.sendSupport(supName, parseInt(supAmt), supDesc); setSupName(""); setSupAmt(""); setSupDesc(""); setSupporting(false); setActivePanel('none'); onRefresh(); };

  const totalsMap: Record<number, number> = {};
  finance?.memberTotals?.forEach(mt => { totalsMap[mt.memberId] = mt.totalContributed; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">👥 Family Members ({members.length})</h2>
        {isAdmin && <div className="flex gap-2 flex-wrap">
          <button onClick={()=>{setActivePanel(activePanel==='support'?'none':'support');setShowForm(false);}} className={`px-3 py-2 rounded-lg text-sm font-medium ${activePanel==='support'?'bg-gray-300 text-gray-700':'bg-purple-500 hover:bg-purple-600 text-white'}`}>{activePanel==='support'?'Cancel':'🤝 Support'}</button>
          <button onClick={()=>{setActivePanel(activePanel==='credit'?'none':'credit');setShowForm(false);}} className={`px-3 py-2 rounded-lg text-sm font-medium ${activePanel==='credit'?'bg-gray-300 text-gray-700':'bg-blue-500 hover:bg-blue-600 text-white'}`}>{activePanel==='credit'?'Cancel':'💳 Credit'}</button>
          <button onClick={()=>{reset();setShowForm(!showForm);setActivePanel('none');}} className="bg-accent hover:bg-accent-dark text-white px-3 py-2 rounded-lg text-sm font-medium">{showForm?'Cancel':'+ Add'}</button>
        </div>}
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
          <select value={creditName} onChange={e=>setCreditName(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">-- Select member --</option>{members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select>
          <input type="number" value={creditAmt} onChange={e=>setCreditAmt(e.target.value)} placeholder="Amount (₦)" className="w-full px-3 py-2 border rounded-lg" />
          <textarea value={creditDesc} onChange={e=>setCreditDesc(e.target.value)} placeholder="Description" rows={2} className="w-full px-3 py-2 border rounded-lg" />
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{members.map(m=>{const d=daysUntil(m.birthMonth,m.birthDay); const total=totalsMap[m.id]||0; return(
        <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between"><div><h3 className="font-semibold text-gray-800">{m.name}</h3><p className="text-sm text-gray-500 mt-1">🎂 {fmtBday(m.birthMonth,m.birthDay)}</p>
          <p className={`text-xs mt-1 font-medium ${d===0?"text-red-600":d<=7?"text-yellow-600":"text-gray-400"}`}>{d===0?"🎉 Today!":d===1?"⏰ Tomorrow!":`${d} days away`}</p>
          <p className="text-xs mt-2 font-semibold text-green-600">💰 Total: ₦{total.toLocaleString()}</p>
          </div>{isAdmin&&<button onClick={()=>edit(m)} className="text-gray-400 hover:text-blue-500 p-1">✏️</button>}</div>
        </div>);})}</div>
    </div>
  );
}

// ==================== CONTRIBUTIONS TAB ====================
function ContributionsTab() {
  const [ym, setYm] = useState(curYM()); const [contribs, setContribs] = useState<ContributionRecord[]>([]); const [localC, setLocalC] = useState<Record<number,{week1:boolean;week2:boolean;week3:boolean;week4:boolean;week5:boolean}>>({});
  const [loading, setLoading] = useState(true); const [updating, setUpdating] = useState(false); const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  const [error, setError] = useState<string|null>(null); const [showSum, setShowSum] = useState(false);
  const [summary, setSummary] = useState<{fullyPaid:string[];partialOrUnpaid:Array<{name:string;weeks:number[];paidCount:number}>}|null>(null);

  function apply(list: ContributionRecord[]) { setContribs(list); const c: Record<number,{week1:boolean;week2:boolean;week3:boolean;week4:boolean;week5:boolean}>={};
    list.forEach(r=>{c[r.memberId]={week1:r.week1===1,week2:r.week2===1,week3:r.week3===1,week4:r.week4===1,week5:r.week5===1};}); setLocalC(c); }

  useEffect(()=>{let can=false; (async()=>{setLoading(true);setError(null);setShowSum(false);setSent(false);
    try{const r=await api.getContributions(ym);const d=await r.json();if(!can)apply(d.contributions||[]);}catch(e){if(!can){setError(e instanceof Error?e.message:'Failed');setContribs([]);}}
    if(!can)setLoading(false);})(); return()=>{can=true;}; },[ym]);

  const toggle = (id:number,w:'week1'|'week2'|'week3'|'week4'|'week5')=>{const o=contribs.find(c=>c.memberId===id);if(o&&o[w]===1)return;setLocalC(p=>({...p,[id]:{...p[id],[w]:!p[id]?.[w]}}));};
  const hasChanges = contribs.some(c=>{const l=localC[c.memberId]; if(!l) return false; return (['week1','week2','week3','week4','week5'] as const).some(w=> c[w]===0 && l[w]); });
  const update = async()=>{setUpdating(true);setShowSum(false);setError(null);setSent(false);
    const ups=contribs.map(c=>({memberId:c.memberId,week1:localC[c.memberId]?.week1||false,week2:localC[c.memberId]?.week2||false,week3:localC[c.memberId]?.week3||false,week4:localC[c.memberId]?.week4||false,week5:localC[c.memberId]?.week5||false}));
    try{const r=await api.updateContributions(ym,ups);const d=await r.json();if(d.success){apply(d.contributions);setSummary(d.summary);setShowSum(true);}else setError(d.error);}catch{setError('Failed');}setUpdating(false);};
  const sendReport = async()=>{setSending(true);try{const r=await api.sendContributionReport(ym);const d=await r.json();if(d.success)setSent(true);else setError('Send failed: '+(d.error||d.response));}catch{setError('Connection error');}setSending(false);};
  const nav=(dir:number)=>{const[y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+dir,1);setYm(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
  const localTotal=contribs.reduce((s,c)=>{const l=localC[c.memberId]||{week1:false,week2:false,week3:false,week4:false,week5:false};return s+[l.week1,l.week2,l.week3,l.week4,l.week5].filter(Boolean).length*200;},0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2"><h2 className="text-xl font-bold text-gray-800">💰 Weekly Dues (₦200)</h2>
        <div className="flex items-center gap-2"><button onClick={()=>nav(-1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">←</button>
        <input type="month" value={ym} onChange={e=>setYm(e.target.value)} className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent bg-white" />
        <button onClick={()=>nav(1)} className="w-9 h-9 bg-white rounded-lg shadow-sm text-gray-600 hover:bg-gray-100 flex items-center justify-center">→</button></div>
      </div>
      <div className="bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl p-4 flex items-center justify-between"><div><p className="text-sm opacity-80">Total Contributions</p><p className="text-2xl font-bold">{fmtYM(ym)}</p></div><div className="text-right"><p className="text-3xl font-bold">₦{localTotal.toLocaleString()}</p><p className="text-sm opacity-80">of ₦{(contribs.length*1000).toLocaleString()}</p></div></div>
      {error&&<div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">❌ {error}</div>}
      {loading?<div className="text-center py-8 text-gray-500">Loading...</div>:contribs.length===0?<div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No members found.</p></div>:(
      <>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Member</th>{[1,2,3,4,5].map(w=><th key={w} className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-14">Wk{w}</th>)}<th className="px-3 py-3 text-center text-sm font-semibold text-gray-700 w-20">Total</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{contribs.map(c=>{const l=localC[c.memberId]||{week1:false,week2:false,week3:false,week4:false,week5:false};const tp=[l.week1,l.week2,l.week3,l.week4,l.week5].filter(Boolean).length;return(
          <tr key={c.memberId} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm font-medium text-gray-800">{c.memberName}</td>
          {(['week1','week2','week3','week4','week5'] as const).map(w=>{const lk=c[w]===1;const ch=l[w];return(<td key={w} className="px-2 py-3 text-center"><button onClick={()=>toggle(c.memberId,w)} disabled={lk} className={`w-8 h-8 rounded-lg text-lg transition-all ${lk?'bg-green-100 text-green-600 cursor-not-allowed':ch?'bg-green-500 text-white hover:bg-green-600':'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{ch?'✓':''}</button></td>);})}
          <td className="px-3 py-3 text-center"><span className={`text-sm font-semibold ${tp===5?'text-green-600':'text-gray-600'}`}>₦{(tp*200).toLocaleString()}</span></td></tr>);})}</tbody></table></div></div>
        <button onClick={update} disabled={updating||!hasChanges} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{updating?'Updating...':'✅ Update Records'}</button>
        {showSum&&summary&&(<div className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm"><h3 className="font-semibold text-gray-800 mb-3">📊 Summary – {fmtYM(ym)}</h3>
            {summary.fullyPaid.length>0&&<div className="mb-4"><h4 className="text-sm font-medium text-green-700 mb-2">✅ Fully Paid ({summary.fullyPaid.length})</h4><div className="flex flex-wrap gap-2">{summary.fullyPaid.map((n,i)=><span key={i} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">{n}</span>)}</div></div>}
            {summary.partialOrUnpaid.length>0&&<div><h4 className="text-sm font-medium text-orange-700 mb-2">⏳ Pending ({summary.partialOrUnpaid.length})</h4><div className="space-y-1">{summary.partialOrUnpaid.map((m,i)=><div key={i} className="flex items-center justify-between bg-orange-50 px-3 py-2 rounded-lg"><span className="text-sm">{m.name}</span><span className="text-sm text-orange-600">{m.weeks.map(w=>w?'✅':'❌').join('')} ₦{m.paidCount*200}</span></div>)}</div></div>}
          </div>
          <button onClick={sendReport} disabled={sending||sent} className={`w-full font-semibold py-3 rounded-lg transition-colors ${sent?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-accent hover:bg-accent-dark text-white disabled:opacity-50'}`}>{sent?'✅ Report Sent':sending?'Sending...':'📲 Send Report to WhatsApp'}</button>
        </div>)}
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700"><strong>ℹ️</strong> Locked ✓ = confirmed. Use ← → or calendar to browse months.</div>
      </>)}
    </div>
  );
}

// ==================== BIRTHDAY CONTRIBUTIONS TAB ====================
function BdayContribTab({ members }: { members: Member[] }) {
  const [year, setYear] = useState(new Date().getFullYear()); const [selectedId, setSelectedId] = useState<number|null>(null);
  const [bdayList, setBdayList] = useState<Array<{id:number;name:string;birthMonth:number;birthDay:number;paidCount:number;totalPaid:number;paidOut:boolean}>>([]);
  const [contributors, setContributors] = useState<BdayContributor[]>([]); const [localPaid, setLocalPaid] = useState<Record<number,boolean>>({});
  const [loading, setLoading] = useState(true); const [updating, setUpdating] = useState(false); const [bdayName, setBdayName] = useState(""); const [payingOut, setPayingOut] = useState(false);
  const [paidOut, setPaidOut] = useState(false);

  const fetchList = async()=>{setLoading(true);try{const r=await api.getBirthdayContributions(year);const d=await r.json();setBdayList(d.members||[]);}catch{}setLoading(false);};
  useEffect(()=>{fetchList();},[year]);
  const selectMember = async(id:number)=>{setSelectedId(id);try{const r=await api.getBirthdayContributionDetail(id,year);const d=await r.json();setContributors(d.contributors||[]);setBdayName(d.birthdayMemberName||'');setPaidOut(d.paidOut||false);
    const lp:Record<number,boolean>={};(d.contributors||[]).forEach((c:BdayContributor)=>{lp[c.memberId]=c.paid===1;});setLocalPaid(lp);}catch{}};
  const togglePaid=(id:number)=>{const orig=contributors.find(c=>c.memberId===id);if(orig&&orig.paid===1)return;setLocalPaid(p=>({...p,[id]:!p[id]}));};
  const hasChanges=contributors.some(c=>c.paid===0&&localPaid[c.memberId]);
  const handleUpdate=async()=>{if(!selectedId)return;setUpdating(true);const ups=contributors.map(c=>({memberId:c.memberId,paid:localPaid[c.memberId]||false,amount:c.amount}));
    try{await api.updateBirthdayContributions(selectedId,year,ups);await selectMember(selectedId);await fetchList();}catch{}setUpdating(false);};
  const handlePayout=async()=>{if(!selectedId)return;const tc=contributors.reduce((s,c)=>s+(localPaid[c.memberId]?c.amount:0),0);const sf=20000-tc;
    if(!confirm(`Send ₦20,000 birthday payout to ${bdayName}?\n\nCollected: ₦${tc.toLocaleString()}\n${sf>0?`Shortfall: ₦${sf.toLocaleString()} from group funds\n`:''}`))return;
    setPayingOut(true);try{await api.birthdayPayout(selectedId,year);await fetchList();await selectMember(selectedId);}catch{}setPayingOut(false);};

  if(selectedId){
    const totalCollected=contributors.reduce((s,c)=>s+(localPaid[c.memberId]?c.amount:0),0);
    const debtors=contributors.filter(c=>!localPaid[c.memberId]); const paidContributors=contributors.filter(c=>localPaid[c.memberId]);
    const BDAY_PAYOUT=20000; const shortfall=BDAY_PAYOUT-totalCollected;
    return(
    <div className="space-y-4">
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
      <button onClick={handlePayout} disabled={payingOut||paidOut} className={`w-full font-semibold py-3 rounded-lg ${paidOut?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50'}`}>{paidOut?'✅ ₦20,000 Payout Already Sent':payingOut?'Processing...':'💰 Send ₦20,000 Payout (₦'+totalCollected.toLocaleString()+' collected'+(shortfall>0?' + ₦'+shortfall.toLocaleString()+' from group':'')+')'}</button>
      {paidOut&&debtors.length>0&&<div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-700"><strong>ℹ️</strong> {debtors.length} member(s) still owe ₦{(debtors.length*1000).toLocaleString()}. When they pay, mark them and click Update — the amount will be returned to group funds.</div>}
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
function SchedulerTab({ messages, onRefresh, isAdmin }: { messages: ScheduledMessage[]; onRefresh: () => void; isAdmin: boolean }) {
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
      {isAdmin&&show&&<form onSubmit={submit} className="bg-white rounded-xl p-4 shadow-sm space-y-4"><textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} className="w-full px-3 py-2 border rounded-lg" placeholder="Message..." required /><div className="grid grid-cols-2 gap-4"><input type="date" value={sDate} onChange={e=>setSDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border rounded-lg" required /><input type="time" value={sTime} onChange={e=>setSTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required /></div><button type="submit" disabled={sub} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{sub?"Saving...":eId?"Update":"Schedule"}</button></form>}
      <div className="flex gap-2">{(['pending','sent','all'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter===f?'bg-primary text-white':'bg-white text-gray-600 hover:bg-gray-100'}`}>{f[0].toUpperCase()+f.slice(1)}</button>)}<button onClick={onRefresh} className="ml-auto bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">🔄</button></div>
      {filtered.length===0?<div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No messages</p></div>:
      <div className="max-h-96 overflow-y-auto space-y-3 pr-1">{filtered.map(m=><div key={m.id} className="bg-white rounded-xl p-4 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full ${m.status==='pending'?'bg-blue-500':'bg-green-500'}`}></span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status==='pending'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>{m.status}</span><span className="text-xs text-gray-400">📆 {fmtDT(m.scheduledAt)}</span></div><p className="text-sm text-gray-800 whitespace-pre-wrap">{m.message}</p>{m.sentAt&&<p className="text-xs text-gray-400 mt-2">Sent: {fmtDT(m.sentAt)}</p>}</div>
      {isAdmin&&m.status==='pending'&&<div className="flex gap-1"><button onClick={()=>{setEId(m.id);setMsg(m.message);setSDate(new Date(m.scheduledAt).toISOString().split('T')[0]);setSTime(new Date(m.scheduledAt).toTimeString().slice(0,5));setShow(true);}} className="text-gray-400 hover:text-blue-500 p-1">✏️</button><button onClick={async()=>{if(confirm('Delete?')){await api.deleteScheduledMessage(m.id);onRefresh();}}} className="text-gray-400 hover:text-red-500 p-1">🗑️</button></div>}</div></div>)}</div>}
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
  const [m7, setM7] = useState(settings.message_7day||""); const [m1, setM1] = useState(settings.message_1day||""); const [mb, setMb] = useState(settings.message_birthday||"");
  const [pw, setPw] = useState(""); const [cpw, setCpw] = useState(""); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const save=async()=>{setSaving(true);const u:Record<string,string>={whatsapp_access_token:at,whatsapp_instance_id:ii,whatsapp_group_id:gi,whatsapp_group_name:gn,cron_secret:cs,account_details:ad,message_7day:m7,message_1day:m1,message_birthday:mb};if(pw)u.app_password=pw;if(cpw)u.contrib_admin_password=cpw;await api.updateSettings(u);setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),3000);onRefresh();};
  const cronUrl=`${getApiBaseUrl()}/api/cron.php?secret=${cs}`;
  if(!isAdmin) return(<div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">⚙️ Settings</h2><div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-700">🔒 Read-only. Contact main admin to change settings.</div>
    <div className="bg-white rounded-xl p-4 shadow-sm space-y-2"><p className="text-sm"><strong>Group:</strong> {settings.whatsapp_group_name||'Not set'}</p><p className="text-sm"><strong>Cron URL:</strong></p><div className="bg-gray-50 p-2 rounded text-xs font-mono break-all border">{cronUrl}</div></div></div>);
  return(
    <div className="space-y-4"><h2 className="text-xl font-bold text-gray-800">⚙️ Settings</h2>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">WA Client API</h3>
        <input type="password" value={at} onChange={e=>setAt(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Access Token" />
        <input type="text" value={ii} onChange={e=>setIi(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Instance ID" />
        <input type="text" value={gi} onChange={e=>setGi(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Group ID (chat_id)" />
        <input type="text" value={gn} onChange={e=>setGn(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Group Name" />
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">Cron Job</h3>
        <input type="text" value={cs} onChange={e=>setCs(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Cron Secret" />
        <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono break-all border">{cronUrl}</div>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3"><h3 className="font-semibold text-gray-700">🏦 Account Details</h3><p className="text-xs text-gray-500">Included in WhatsApp notifications</p>
        <textarea value={ad} onChange={e=>setAd(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"Bank: Access Bank\nAccount Name: Umu Emily\nAccount Number: 1234567890"} />
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
      <button onClick={save} disabled={saving} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg disabled:opacity-50">{saving?"Saving...":saved?"✅ Saved!":"Save Settings"}</button>
    </div>
  );
}

// ==================== LOGS TAB ====================
function LogsTab({ logs, onRefresh }: { logs: LogEntry[]; onRefresh: () => void }) {
  return(
    <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-gray-800">📋 Message Logs</h2><button onClick={onRefresh} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">🔄</button></div>
      {logs.length===0?<div className="bg-white rounded-xl p-8 text-center shadow-sm"><p className="text-gray-500">No messages yet</p></div>:
      <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">{logs.map(l=><div key={l.id} className="bg-white rounded-xl p-4 shadow-sm"><div className="flex items-start justify-between flex-wrap gap-2"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${l.status==="sent"?"bg-green-500":"bg-red-500"}`}></span><span className="font-medium text-gray-800">{l.memberName}</span><span className={`text-xs px-2 py-0.5 rounded-full ${l.messageType==="birthday"?"bg-pink-100 text-pink-700":l.messageType==="contribution"?"bg-green-100 text-green-700":l.messageType==="birthday_contribution"||l.messageType==="birthday_payout"?"bg-pink-100 text-pink-700":l.messageType==="credit"?"bg-blue-100 text-blue-700":"bg-purple-100 text-purple-700"}`}>{l.messageType}</span></div><span className="text-xs text-gray-400">{fmtDT(l.sentAt)}</span></div><p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap line-clamp-3">{l.message}</p></div>)}</div>}
    </div>
  );
}

// ==================== MAIN APP ====================
export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false); const [checking, setChecking] = useState(true); const [role, setRole] = useState<Role>('admin');
  useEffect(()=>{const t=localStorage.getItem("auth_token"); const r=localStorage.getItem("auth_role"); if(t){setLoggedIn(true);setRole((r as Role)||'admin');}setChecking(false);},[]);
  if(checking) return <div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-bounce">🎂</div></div>;
  if(!loggedIn) return <LoginPage onLogin={(r)=>{setLoggedIn(true);setRole(r);}}/>;
  return <Dashboard role={role} onLogout={()=>{localStorage.removeItem("auth_token");localStorage.removeItem("auth_role");setLoggedIn(false);}}/>;
}
