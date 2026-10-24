import sys, csv, subprocess, json, collections, io
# usage: agg_uf.py UF zipfile outdir
uf, zp, out = sys.argv[1:4]
GOV = {'AC','AM','DF','ES','RN','TO'}
name = subprocess.check_output(['unzip','-Z1',zp],text=True).split('\n')
csvn = [n for n in name if n.lower().endswith('.csv')][0]
p1 = subprocess.Popen(['unzip','-p',zp,csvn],stdout=subprocess.PIPE)
p2 = subprocess.Popen(['grep','-a','-E','^"DT_GERACAO"|;(1;"Presidente"|3;"Governador");'],stdin=p1.stdout,stdout=subprocess.PIPE,env={'LC_ALL':'C'})
p1.stdout.close()
rd = csv.reader(io.TextIOWrapper(p2.stdout,encoding='latin1',newline=''),delimiter=';')
cols = next(rd)
ix = {c:i for i,c in enumerate(cols)}
NC=len(cols)
# key -> dict
secs = {}
diag = collections.Counter()
for r in rd:
    assert len(r)==NC, len(r)
    cargo = r[ix['CD_CARGO_PERGUNTA']]
    if cargo == '3' and uf not in GOV: continue
    key = (cargo, r[ix['SG_UF']], r[ix['CD_MUNICIPIO']], r[ix['NR_ZONA']], r[ix['NR_SECAO']])
    s = secs.get(key)
    dt = r[ix['DT_BU_RECEBIDO']]
    if s is None:
        s = secs[key] = dict(nm=r[ix['NM_MUNICIPIO']], dt=dt, aptos=r[ix['QT_APTOS']], comp=r[ix['QT_COMPARECIMENTO']],
                             tipo=r[ix['DS_TIPO_URNA']], agr=r[ix['DS_SECOES_AGREGADAS']], v={})
    elif s['dt'] != dt:
        diag['multi_dt']+=1
    nr = r[ix['NR_VOTAVEL']]; td = r[ix['DS_TIPO_VOTAVEL']]
    k = nr
    if k in s['v']: diag['dup_votavel']+=1
    s['v'][k] = s['v'].get(k,0)+int(r[ix['QT_VOTOS']])
    s.setdefault('td',{})[k]=td
    diag['tipo_'+s['tipo']]+=1
    diag['cargo'+cargo+'_'+r[ix['DS_TIPO_URNA']]]+=0
# write
for cargo in ('1','3'):
    items = [(k,s) for k,s in secs.items() if k[0]==cargo]
    if not items: continue
    json.dump({'diag':dict(diag)}, open(f'{out}/{uf}.diag.json','w'))
    with open(f'{out}/{uf}-c{cargo}.jsonl','w') as f:
        for k,s in items:
            f.write(json.dumps({'uf':k[1],'mun':k[2],'nm':s['nm'],'zona':k[3],'secao':k[4],'dt':s['dt'],'aptos':s['aptos'],'comp':s['comp'],'tipo':s['tipo'],'agr':s['agr'],'v':s['v'],'td':s['td']},ensure_ascii=False)+'\n')
print(uf, len(secs), dict(diag))
