import json, glob, numpy as np, datetime as dtm, statistics as st
S="/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/backfill/agg"
BASE=dtm.datetime(2026,10,4)
sec=lambda s:(dtm.datetime.strptime(s,"%Y-%m-%d %H:%M:%S")-BASE).total_seconds()
recs=[json.loads(l) for f in sorted(glob.glob(S+"/*-c1.jsonl")) for l in open(f)]
CANDS=['13','14','16','21','22','27','29','30','35','55','70','80']
recs.sort(key=lambda r:sec(r['dt']))
t=np.array([sec(r['dt']) for r in recs])
lula=np.cumsum([r['v'].get('13',0) for r in recs]); fla=np.cumsum([r['v'].get('22',0) for r in recs])
vv=np.cumsum([sum(r['v'].get(c,0) for c in CANDS) for r in recs])
N=len(recs); TS=499248
h=json.load(open("/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/prev/live.json"))['history']
rows=[]
for p in h:
    k=min(p['sectionsCounted'],N)
    tot=dtm.datetime.strptime(p['totalizedAt'],"%d/%m/%Y %H:%M:%S"); T=(tot-BASE).total_seconds()
    # (1) mesmo numero de secoes
    lp=100*lula[k-1]/vv[k-1]; fp=100*fla[k-1]/vv[k-1]
    # tie range: ties at t[k-1]
    lo=int(np.searchsorted(t,t[k-1],'left')); hi=int(np.searchsorted(t,t[k-1],'right'))
    lag=T-t[k-1]
    # (2) mesmo horario
    kt=int(np.searchsorted(t,T,'right')); 
    lt=100*lula[kt-1]/vv[kt-1] if kt else float('nan'); ft=100*fla[kt-1]/vv[kt-1] if kt else float('nan')
    rows.append(dict(T=p['totalizedAt'],real_pct=p['countedPercent'],k=k,dL=lp-p['lulaPercent'],dF=fp-p['bolsonaroPercent'],
        dLv=int(lula[k-1])-p['lulaVotes'],lag=lag,ties=hi-lo,kt=kt,dpct_t=100*kt/TS-p['countedPercent'],dLt=lt-p['lulaPercent'],dFt=ft-p['bolsonaroPercent'],
        real_gap=p['bolsonaroPercent']-p['lulaPercent'],rec_gap=fp-lp))
def S_(name,xs):
    xs=[x for x in xs if x==x]
    a=np.array(xs); print("%-34s n=%d media=%.4f mediana=%.4f p5=%.4f p95=%.4f min=%.4f max=%.4f maxabs=%.4f"%(name,len(a),a.mean(),np.median(a),np.percentile(a,5),np.percentile(a,95),a.min(),a.max(),np.abs(a).max()))
print("pontos reais",len(h),"primeiro",h[0]['totalizedAt'],h[0]['countedPercent'],"ultimo",h[-1]['totalizedAt'],h[-1]['countedPercent'])
S_("(1) dLula pp (mesmas secoes)",[r['dL'] for r in rows]); S_("(1) dFlavio pp (mesmas secoes)",[r['dF'] for r in rows])
S_("(1) dLula votos (mesmas secoes)",[r['dLv'] for r in rows])
S_("(1) lag s (totalizedAt - dt_BU_k)",[r['lag'] for r in rows]); 
S_("(1) lag min (idem)",[r['lag']/60 for r in rows])
S_("(2) d%secoes @mesmo horario pp",[r['dpct_t'] for r in rows]); S_("(2) dLula pp @mesmo horario",[r['dLt'] for r in rows]); S_("(2) dFlavio pp @mesmo horario",[r['dFt'] for r in rows])
S_("gap F-L real - recon (pp)",[r['real_gap']-r['rec_gap'] for r in rows])
# por faixa de % secoes
for a,b in ((0,60),(60,80),(80,95),(95,99.5),(99.5,101)):
    sel=[r for r in rows if a<=r['real_pct']<b]
    if sel: print("faixa %5.1f-%5.1f n=%3d |dL|max=%.4f |dF|max=%.4f lag_med_min=%.1f lag_max_min=%.1f"%(a,b,len(sel),max(abs(r['dL']) for r in sel),max(abs(r['dF']) for r in sel),st.median(r['lag'] for r in sel)/60,max(r['lag'] for r in sel)/60))
print("ties max",max(r['ties'] for r in rows))
# monotonia do lag
lags=[r['lag'] for r in rows]
print("pontos com lag<0 (real antes do BU):",sum(1 for l in lags if l<0), "lag>0:",sum(1 for l in lags if l>0))
print("primeiros 5:",[(r['T'],round(r['real_pct'],2),round(r['dL'],4),round(r['dF'],4),round(r['lag']/60,1)) for r in rows[:5]])
print("ultimos 5:",[(r['T'],round(r['real_pct'],2),round(r['dL'],4),round(r['dF'],4),round(r['lag']/60,1)) for r in rows[-5:]])
# espaçamento dos pontos reais
ts=[dtm.datetime.strptime(p['totalizedAt'],"%d/%m/%Y %H:%M:%S") for p in h]
gaps=[(b-a).total_seconds()/60 for a,b in zip(ts,ts[1:])]; print("gap entre pontos reais min: med %.1f max %.1f"%(st.median(gaps),max(gaps)))
# corr de ordem: para cada ponto, k_real vs k_t
print("k_real - k_recon@T (secoes): ", st.median([r['k']-r['kt'] for r in rows]), max(abs(r['k']-r['kt']) for r in rows))
json.dump(rows,open("/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/backfill/validate_b_rows.json","w"))
print("=== (3) pareamento por votos validos reais (robusto ao 'sectionsCounted' que inclui as ~42 secoes sem BU) ===")
r3=[]; exact=0
for p in h:
    V=p['validVotes']; k3=int(np.searchsorted(vv,V,'left'))+1  # primeiro prefixo com vv>=V
    k3=min(k3,N)
    # escolher prefixo mais proximo
    cand=[kk for kk in (k3-1,k3) if kk>=1]
    kk=min(cand,key=lambda x:abs(int(vv[x-1])-V))
    tot=dtm.datetime.strptime(p['totalizedAt'],"%d/%m/%Y %H:%M:%S"); T=(tot-BASE).total_seconds()
    ex=int(vv[kk-1])==V; exact+=ex
    r3.append(dict(dV=int(vv[kk-1])-V,dL=100*lula[kk-1]/vv[kk-1]-p['lulaPercent'],dF=100*fla[kk-1]/vv[kk-1]-p['bolsonaroPercent'],
                   dLv=int(lula[kk-1])-p['lulaVotes'],lag=T-t[kk-1],extra=p['sectionsCounted']-kk,pct=p['countedPercent']))
print("matches exatos de votos validos:",exact,"de",len(h))
S_("(3) |dV| votos validos",[abs(r['dV']) for r in r3]); S_("(3) dLula pp",[r['dL'] for r in r3]); S_("(3) dFlavio pp",[r['dF'] for r in r3])
S_("(3) lag min (totalizedAt - dt_BU)",[r['lag']/60 for r in r3])
S_("(3) secoes reais - prefixo BU",[r['extra'] for r in r3])
for a,b in ((0,95),(95,99.9),(99.9,100.0),(100,101)):
    sel=[r for r in r3 if a<=r['pct']<b]
    if sel: print("faixa %5.1f-%5.1f n=%3d lag_med=%.1f min lag_p90=%.1f lag_max=%.1f lag_min=%.1f |dL|max=%.4f"%(a,b,len(sel),st.median(r['lag'] for r in sel)/60,np.percentile([r['lag'] for r in sel],90)/60,max(r['lag'] for r in sel)/60,min(r['lag'] for r in sel)/60,max(abs(r['dL']) for r in sel)))
