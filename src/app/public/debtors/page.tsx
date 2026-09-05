"use client";
import {useEffect,useState} from "react";
import {api} from "@/lib/api";
type Debtor={id:number;name:string;weekly:number;birthday:number;late:number;total:number};
export default function DebtorsPage(){
  const [rows,setRows]=useState<Debtor[]|null>(null);const [error,setError]=useState('');
  useEffect(()=>{api.getPublicDebtorsReport().then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Report unavailable');setRows(d.debtors||[]);}).catch(e=>setError(e.message||'Report unavailable'));},[]);
  if(error)return <Shell><p className="text-red-600 text-center">{error}</p></Shell>;
  if(!rows)return <Shell><p className="text-gray-500 text-center">Loading report…</p></Shell>;
  const wt=rows.reduce((s,r)=>s+r.weekly,0),bt=rows.reduce((s,r)=>s+r.birthday,0),lt=rows.reduce((s,r)=>s+r.late,0);
  return <Shell><div className="space-y-4"><div className="text-center"><div className="text-5xl">📋</div><h1 className="text-2xl font-bold text-green-800 mt-2">Debtors Report</h1><p className="text-gray-500">{rows.length} member{rows.length===1?'':'s'} owing</p></div>{rows.length===0&&<div className="bg-white rounded-xl p-5 text-center text-green-700">✅ All members have cleared their debts.</div>}{rows.map(r=><a key={r.id} href={`/public/member?id=${r.id}`} className="block bg-white rounded-xl shadow-sm p-4 hover:shadow-md"><div className="flex justify-between gap-3"><h2 className="font-bold text-gray-800">{r.name}</h2><strong className="text-red-700">₦{r.total.toLocaleString()}</strong></div><div className="mt-2 text-sm text-gray-600 space-y-1">{r.weekly>0&&<p>Weekly dues: ₦{r.weekly.toLocaleString()}</p>}{r.birthday>0&&<p>Birthday contributions: ₦{r.birthday.toLocaleString()}</p>}{r.late>0&&<p>Late fees: ₦{r.late.toLocaleString()}</p>}</div><p className="text-xs text-green-700 mt-3">View full member details →</p></a>)}{rows.length>0&&<div className="bg-green-800 text-white rounded-xl p-4 space-y-1">{wt>0&&<p>Weekly dues: ₦{wt.toLocaleString()}</p>}{bt>0&&<p>Birthday contributions: ₦{bt.toLocaleString()}</p>}{lt>0&&<p>Late fees: ₦{lt.toLocaleString()}</p>}<p className="font-bold pt-2 border-t border-white/30">Overall: ₦{(wt+bt+lt).toLocaleString()}</p></div>}<p className="text-center text-xs text-gray-400">Read-only live report</p></div></Shell>
}
function Shell({children}:{children:React.ReactNode}){return <main className="min-h-screen bg-gray-50 p-4"><div className="max-w-2xl mx-auto">{children}</div></main>}
