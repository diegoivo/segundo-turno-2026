import json, glob, gzip, csv, sys
S="/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/backfill/agg"
OUT="/Users/diego/Claude/segundo-turno/backfill/1t2026"
GOV=['AC','AM','DF','ES','RN','TO']
def rows(files):
    for f in files:
        for l in open(f):
            yield json.loads(l)
def write(path, rs):
    rs=list(rs)
    nrs=sorted({k for r in rs for k,t in r['td'].items() if t=='Nominal'}, key=int)
    n=0
    with gzip.open(path,'wt',encoding='utf-8',newline='') as g:
        w=csv.writer(g)
        w.writerow(['uf','cd_municipio','nm_municipio','zona','secao','dt_bu_recebido','aptos','comparecimento','secoes_agregadas']+['v_'+k for k in nrs]+['brancos','nulos'])
        for r in rs:
            v=r['v']
            w.writerow([r['uf'],r['mun'],r['nm'],r['zona'],r['secao'],r['dt'],r['aptos'],r['comp'],'' if r['agr']=='#NULO#' else r['agr']]+[v.get(k,0) for k in nrs]+[v.get('95',0),v.get('96',0)])
            n+=1
    print(path,n,len(nrs))
write(f"{OUT}/secoes-presidente.csv.gz", rows(sorted(glob.glob(S+"/*-c1.jsonl"))))
for u in GOV: write(f"{OUT}/secoes-governador-{u.lower()}.csv.gz", rows([f"{S}/{u}-c3.jsonl"]))
