"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Week={index:number;label:string;date:string;active:boolean};
type Row={memberId:number;memberName:string;memberTotal:number;[key:string]:string|number};
type Data={yearMonth:string;weeks:Week[];contributions:Row[];monthTotal:number;monthExpected:number};

export default function PublicWeeklyReport(){
  const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');
  useEffect(()=>{const month=new URLSearchParams(window.location.search).get('month')||'';if(!/^\d{4}-\d{2}$/.test(month)){setError('Invalid weekly report link.');return;}api.getContributions(month).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Report unavailable');setData(d);}).catch(e=>setError(e.message||'Report unavailable'));},[]);
  if(error)return <ReportShell><p className="text-center text-red-600">{error}</p></ReportShell>;
  if(!data)return <ReportShell><p className="text-center text-gray-500">Loading report…</p></ReportShell>;
  const active=data.weeks.filter(w=>w.active);const fully=data.contributions.filter(r=>active.length>0&&active.every(w=>Number(r[`week${w.index}`])===1));const pending=data.contributions.filter(r=>!fully.includes(r));
  return <ReportShell><div className="space-y-5"><div className="text-center"><div className="text-5xl">💰</div><h1 className="text-2xl font-bold text-green-800 mt-2">Weekly Dues Report</h1><p className="text-gray-500">{new Date(data.yearMonth+'-02').toLocaleDateString('en-NG',{month:'long',year:'numeric'})}</p></div><div className="grid grid-cols-2 gap-3"><Stat label="Collected" value={data.monthTotal}/><Stat label="Expected" value={data.monthExpected}/></div><div className="bg-white rounded-xl shadow-sm p-4"><h2 className="font-bold text-green-700 mb-3">✅ Fully Paid ({fully.length})</h2>{fully.length?fully.map(r=><Member key={r.memberId} row={r} weeks={active}/>):<p className="text-sm text-gray-400">No fully paid members yet.</p>}</div><div className="bg-white rounded-xl shadow-sm p-4"><h2 className="font-bold text-orange-700 mb-3">⏳ Pending ({pending.length})</h2>{pending.length?pending.map(r=><Member key={r.memberId} row={r} weeks={active}/>):<p className="text-sm text-green-600">Everyone has paid.</p>}</div><p className="text-center text-xs text-gray-400">Read-only live report • Africa/Lagos time</p></div></ReportShell>;
}
function ReportShell({children}:{children:React.ReactNode}){return <main className="min-h-screen bg-gray-50 p-4"><div className="max-w-2xl mx-auto">{children}</div></main>}
function Stat({label,value}:{label:string;value:number}){return <div className="bg-green-700 text-white rounded-xl p-4 text-center"><p className="text-xs opacity-80">{label}</p><p className="text-xl font-bold">₦{value.toLocaleString()}</p></div>}
function Member({row,weeks}:{row:Row;weeks:Week[]}){return <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0"><div><p className="font-medium text-gray-800">{row.memberName}</p><p className="text-xs mt-1">{weeks.map(w=><span key={w.index} className="mr-1">{Number(row[`week${w.index}`])===1?'✅':'❌'}</span>)}</p></div><span className="font-semibold text-green-700">₦{Number(row.memberTotal||0).toLocaleString()}</span></div>}
