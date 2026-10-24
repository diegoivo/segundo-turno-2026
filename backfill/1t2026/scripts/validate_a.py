import json, glob, os
FIX="/Users/diego/Claude/segundo-turno/fixtures/tse/oficial/ele2026"
R="/Users/diego/Claude/segundo-turno/backfill/1t2026/replay"
def cands(d): return {c['n']:int(c['vap']) for a in d['carg'][0]['agr'] for p in a['par'] for c in p['cand']}
def cmp(rec,off,label,out):
    cr,co=cands(rec),cands(off)
    dif={k:(cr[k],co[k]) for k in co if cr.get(k)!=co[k]}
    fld={}
    for blk,keys in (('v',['tv','vvc','vb','tvn','vn','vnt','vsan','vscv','van','vansj']),('e',['te','c','a','est']),('s',['ts','st','si','sni'])):
        for k in keys:
            if rec[blk][k]!=off[blk][k]: fld[blk+'.'+k]=(rec[blk][k],off[blk][k])
    seq_ok=all(c1['seq']==c2['seq'] for c1,c2 in zip([c for a in rec['carg'][0]['agr'] for p in a['par'] for c in p['cand']],[c for a in off['carg'][0]['agr'] for p in a['par'] for c in p['cand']]))
    st_ok=all((c1['e'],c1['st'])==(c2['e'],c2['st']) for c1,c2 in zip([c for a in rec['carg'][0]['agr'] for p in a['par'] for c in p['cand']],[c for a in off['carg'][0]['agr'] for p in a['par'] for c in p['cand']]))
    pv_ok=all(c1['pvap']==c2['pvap'] for c1,c2 in zip([c for a in rec['carg'][0]['agr'] for p in a['par'] for c in p['cand']],[c for a in off['carg'][0]['agr'] for p in a['par'] for c in p['cand']]))
    out.append((label,len(co),len(dif),dif,fld,seq_ok,st_ok,pv_ok))
out=[]
L=lambda p: json.load(open(p))
cmp(L(f"{R}/presidente/0300/br-c0001-e006257-u.json"),L(f"{FIX}/6257/dados/br/br-c0001-e006257-u.json"),"BR pres",out)
for u in sorted(os.listdir(f"{FIX}/6257/dados")):
    if u=='br': continue
    cmp(L(f"{R}/presidente/0300/{u}-c0001-e006257-u.json"),L(f"{FIX}/6257/dados/{u}/{u}-c0001-e006257-u.json"),"UF pres "+u,out)
for u in ['ac','am','df','es','rn','to']:
    cmp(L(f"{R}/governador/{u}/0300/{u}-c0003-e006259-u.json"),L(f"{FIX}/6259/dados/{u}/{u}-c0003-e006259-u.json"),"UF gov "+u,out)
cmp(L(f"{R}/governador/ac/0300/ac01392-c0003-e006259-u.json"),L(f"{FIX}/6259/dados/ac/ac01392-c0003-e006259-u.json"),"MUN gov ac01392",out)
# ZZ = BR - sum UF
br=L(f"{FIX}/6257/dados/br/br-c0001-e006257-u.json"); b=cands(br)
tot={k:0 for k in b}
for u in os.listdir(f"{FIX}/6257/dados"):
    if u=='br': continue
    for k,v in cands(L(f"{FIX}/6257/dados/{u}/{u}-c0001-e006257-u.json")).items(): tot[k]+=v
zz=cands(L(f"{R}/presidente/0300/zz-c0001-e006257-u.json"))
zzd={k:(zz[k],b[k]-tot[k]) for k in b if zz[k]!=b[k]-tot[k]}
print("ZZ vs BR-sum(UF) diffs:",zzd)
ok=0
for r in out:
    print(r[0],"cand=%d difs=%d"%(r[1],r[2]),r[3],"campos:",r[4],"seq",r[5],"e/st",r[6],"pvap",r[7])
