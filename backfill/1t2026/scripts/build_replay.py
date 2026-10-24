import json, glob, gzip, os, copy, sys, datetime as dtm
import numpy as np
FIX="/Users/diego/Claude/segundo-turno/fixtures/tse/oficial/ele2026"
OUT="/Users/diego/Claude/segundo-turno/backfill/1t2026/replay"
AGG="/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/backfill/agg"
GOV=['AC','AM','DF','ES','RN','TO']
BASE=dtm.datetime(2026,10,4)
def sec(s): return (dtm.datetime.strptime(s,"%Y-%m-%d %H:%M:%S")-BASE).total_seconds()

def f2(x): return ("%.2f"%x).replace('.',',')
def fn(x):
    s=("%.9f"%x).rstrip('0').rstrip('.')
    return (s or "0").replace('.',',')
def pct(a,b): return 100.0*a/b if b else 0.0

def load(files):
    return [json.loads(l) for f in files for l in open(f)]

def snapshot_times(last):
    t0=17*3600; ts=list(range(t0,20*3600+1,60))
    t=20*3600+300
    while True:
        ts.append(t)
        if t>=last: break
        t+=300
    return ts
def hhmm(t):
    t%=86400; return "%02d%02d"%(t//3600,(t%3600)//60)
def dgdh(t):
    d=BASE+dtm.timedelta(seconds=t); return d.strftime("%d/%m/%Y"), d.strftime("%H:%M:%S")

class Scope:
    """sections of one scope sorted by arrival; cumulative sums."""
    def __init__(s, recs, cands, ts_full, te_full):
        recs=sorted(recs,key=lambda r:sec(r['dt']))
        s.t=np.array([sec(r['dt']) for r in recs])
        s.cands=cands
        s.ts=ts_full; s.te=te_full
        s.apt=np.cumsum([int(r['aptos']) for r in recs]) if recs else np.zeros(0)
        s.comp=np.cumsum([int(r['comp']) for r in recs]) if recs else np.zeros(0)
        # numeros fora da lista de candidatos oficiais (exceto 95 branco / 96 nulo) = nulo tecnico (vnt)
        extra={k for r in recs for k in r['v']}-set(cands)-{'95','96'}
        assert len(extra)<=1, extra
        s.extra=sorted(extra)
        def row(r):
            return [r['v'].get(c,0) for c in cands]+[r['v'].get('95',0),r['v'].get('96',0),sum(r['v'].get(e,0) for e in s.extra)]
        M=np.array([row(r) for r in recs],dtype=np.int64) if recs else np.zeros((0,len(cands)+3),dtype=np.int64)
        s.M=np.cumsum(M,axis=0); s.n=len(recs)
    def at(s,T):
        k=int(np.searchsorted(s.t,T,side='right'))
        if k==0: z=np.zeros(len(s.cands)+3,dtype=np.int64); return 0,0,0,z,None
        return k,int(s.apt[k-1]),int(s.comp[k-1]),s.M[k-1],s.t[k-1]

def ranking(scope,T,tpl):
    vc=scope.at(T)[3][:len(scope.cands)]
    votes={c:int(vc[i]) for i,c in enumerate(scope.cands)}
    cl=[c for a in tpl["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]
    order=sorted(cl,key=lambda c:(-votes[c["n"]],int(c["seq"])))
    return {c["n"]:i+1 for i,c in enumerate(order)}

def build(template, scope, T, tpabr, cdabr, ele, final_tpl, rank_ovr=None):
    d=copy.deepcopy(template)
    k,apt,comp,vec,tlast=scope.at(T)
    complete = (k==scope.n)
    nc=len(scope.cands)
    vc=vec[:nc]; blank=int(vec[nc]); vn=int(vec[nc+1]); vnt=int(vec[nc+2]); nul=vn+vnt
    dg,hg=dgdh(T)
    d.update(ele=ele,t="1",f="o",sup="n",tpabr=tpabr,cdabr=cdabr,dg=dg,hg=hg,idg="0",dv="s",esae="n",mnae=[])
    if k==0: d.update(dt="",ht="",tf="n",**{"and":"n"})
    else:
        a,b=dgdh(int(tlast)); d.update(dt=a,ht=b,tf="s" if complete else "n",**{"and":"f" if complete else "p"})
    ts,te=scope.ts,scope.te
    S={}
    def trio(pfx,val,tot,names=None): pass
    S["ts"]=str(ts); S["st"]=str(k); S["pst"]=f2(pct(k,ts)); S["pstn"]=fn(pct(k,ts))
    S["snt"]=str(ts-k); S["psnt"]=f2(pct(ts-k,ts)); S["psntn"]=fn(pct(ts-k,ts))
    S["si"]=str(k); S["psi"]=S["pst"]; S["psin"]=S["pstn"]
    S["sni"]=str(ts-k); S["psni"]=S["psnt"]; S["psnin"]=S["psntn"]
    S["sa"]=str(k); S["psa"]=S["pst"]; S["psan"]=S["pstn"]
    S["sna"]=str(ts-k); S["psna"]=S["psnt"]; S["psnan"]=S["psntn"]
    d["s"]=S
    E={"te":str(te),"est":str(apt),"pest":f2(pct(apt,te)),"pestn":fn(pct(apt,te)),
       "esnt":str(te-apt),"pesnt":f2(pct(te-apt,te)),"pesntn":fn(pct(te-apt,te)),
       "esi":str(apt),"pesi":f2(pct(apt,te)),"pesin":fn(pct(apt,te)),
       "esni":str(te-apt),"pesni":f2(pct(te-apt,te)),"pesnin":fn(pct(te-apt,te)),
       "esa":str(apt),"pesa":f2(pct(apt,te)),"pesan":fn(pct(apt,te)),
       "esna":str(te-apt),"pesna":f2(pct(te-apt,te)),"pesnan":fn(pct(te-apt,te)),
       "c":str(comp),"pc":f2(pct(comp,apt)),"pcn":fn(pct(comp,apt)),
       "a":str(apt-comp),"pa":f2(pct(apt-comp,apt)),"pan":fn(pct(apt-comp,apt))}
    d["e"]=E
    vvc=int(vc.sum()); tv=vvc+blank+nul
    V={"tv":str(tv),"vvc":str(vvc),"pvvc":f2(pct(vvc,tv)),"pvvcn":fn(pct(vvc,tv)),
       "vv":str(vvc),"pvv":f2(100.0 if vvc else 0),"pvvn":fn(100.0 if vvc else 0),
       "vnom":str(vvc),"pvnom":f2(100.0 if vvc else 0),"pvnomn":fn(100.0 if vvc else 0),
       "van":"0","pvan":"0,00","pvann":"0","vansj":"0","pvansj":"0,00","pvansjn":"0",
       "vb":str(blank),"pvb":f2(pct(blank,tv)),"pvbn":fn(pct(blank,tv)),
       "tvn":str(nul),"ptvn":f2(pct(nul,tv)),"ptvnn":fn(pct(nul,tv)),
       "vn":str(vn),"pvn":f2(pct(vn,nul)),"pvnn":fn(pct(vn,nul)),
       "vnt":str(vnt),"pvnt":f2(pct(vnt,nul)),"pvntn":fn(pct(vnt,nul)),"vsan":"0","vscv":"0"}
    d["v"]=V
    # candidates: rank by votes desc, ties by final seq
    votes={c:int(vc[i]) for i,c in enumerate(scope.cands)}
    cl=[c for a in d["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]
    fin={c["n"]:(c["e"],c["st"],c["seq"]) for c in final_tpl}
    order=sorted(cl,key=lambda c:(-votes[c["n"]],int(c["seq"])))
    rank=rank_ovr or {c["n"]:i+1 for i,c in enumerate(order)}
    for a in d["carg"][0]["agr"]:
        for p in a["par"]:
            tot=0
            for c in p["cand"]:
                v=votes[c["n"]]; tot+=v
                c["vap"]=str(v); c["pvap"]=f2(pct(v,vvc)); c["pvapn"]=fn(pct(v,vvc))
                c["seq"]=str(rank[c["n"]])
                if complete: c["e"],c["st"]=fin[c["n"]][0],fin[c["n"]][1]
                else: c["e"],c["st"]="n",""
            p["tvtn"]=str(tot); p["tvan"]=str(tot)
    d["_sintetico_backfill"]=True
    return d

def dump(path,d):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    with open(path,"w",encoding="utf-8") as f: json.dump(d,f,ensure_ascii=False,separators=(",",":"))

def cand_list(tpl): return [c["n"] for a in tpl["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]
def cands_of(tpl): return [c for a in tpl["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]

def main():
    # ---- presidente
    br=json.load(open(f"{FIX}/6257/dados/br/br-c0001-e006257-u.json"))
    cl=cand_list(br)
    recs=load(sorted(glob.glob(AGG+"/*-c1.jsonl")))
    byuf={}
    for r in recs: byuf.setdefault(r["uf"],[]).append(r)
    last=max(sec(r["dt"]) for r in recs)
    times=snapshot_times(last)
    print("snapshots",len(times),hhmm(times[0]),hhmm(times[-1]))
    uf_tpl={}; scopes={}
    sum_ts=0; sum_te=0
    for uf,rs in byuf.items():
        if uf=="ZZ": continue
        t=json.load(open(f"{FIX}/6257/dados/{uf.lower()}/{uf.lower()}-c0001-e006257-u.json"))
        uf_tpl[uf]=t; sum_ts+=int(t["s"]["ts"]); sum_te+=int(t["e"]["te"])
        scopes[uf]=Scope(rs,cl,int(t["s"]["ts"]),int(t["e"]["te"]))
    zz_ts=int(br["s"]["ts"])-sum_ts; zz_te=int(br["e"]["te"])-sum_te
    print("ZZ derived ts,te",zz_ts,zz_te,"BU sections",len(byuf["ZZ"]))
    scopes["ZZ"]=Scope(byuf["ZZ"],cl,zz_ts,zz_te); uf_tpl["ZZ"]=json.load(open(f"{FIX}/6257/dados/ac/ac-c0001-e006257-u.json"))
    scopes["BR"]=Scope(recs,cl,int(br["s"]["ts"]),int(br["e"]["te"]))
    for T in times:
        h=hhmm(T)
        brrank=ranking(scopes["BR"],T,br)
        for name,sc in scopes.items():
            if name=="BR": tpl,tp,cd=br,"br","br"
            else: tpl,tp,cd=uf_tpl[name],"uf",name.lower()
            # final labels: use BR template for ZZ (no own official file)
            ftpl=cands_of(br if name in("BR","ZZ") else tpl)
            d=build(br if name in("BR","ZZ") else tpl,sc,T,tp,cd,"6257",ftpl,brrank)
            dump(f"{OUT}/presidente/{h}/{cd}-c0001-e006257-u.json",d)
    print("presidente ok")
    # ---- governador
    for uf in GOV:
        tpl=json.load(open(f"{FIX}/6259/dados/{uf.lower()}/{uf.lower()}-c0003-e006259-u.json"))
        cg=cand_list(tpl)
        rs=load([f"{AGG}/{uf}-c3.jsonl"])
        scs={"UF":Scope(rs,cg,int(tpl["s"]["ts"]),int(tpl["e"]["te"]))}
        bym={}
        for r in rs: bym.setdefault(r["mun"],[]).append(r)
        for m,mr in bym.items():
            scs[m]=Scope(mr,cg,len(mr),sum(int(r["aptos"]) for r in mr))
        ftpl=cands_of(tpl)
        for T in times:
            h=hhmm(T)
            ufrank=ranking(scs["UF"],T,tpl)
            for name,sc in scs.items():
                if name=="UF":
                    d=build(tpl,sc,T,"uf",uf.lower(),"6259",ftpl); fn_=f"{uf.lower()}-c0003-e006259-u.json"
                else:
                    if sc.at(T)[0]==0: continue
                    cd5=name.zfill(5)
                    d=build(tpl,sc,T,"mu",cd5,"6259",ftpl,ufrank); fn_=f"{uf.lower()}{cd5}-c0003-e006259-u.json"
                dump(f"{OUT}/governador/{uf.lower()}/{h}/{fn_}",d)
        print("gov",uf,len(scs)-1,"municipios")
main()
