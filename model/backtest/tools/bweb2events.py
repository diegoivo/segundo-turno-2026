"""Convert a TSE bweb zip (boletim de urna web) into compact per-race section events.
Output: dl/events/<turno>/<UF>-c<cargo>.json
{ "uf","turno","cargo","cands":{num:name}, "sections":[[t_sec, mun, zona, aptos, comp, brancos, nulos, {num:votes}], ...] sorted by t }
t_sec = seconds since 17:00:00 (Brasilia) of election day (DT_BU_RECEBIDO). Sections without timestamp get t=-1 and are
listed at the end (never "counted" during replay, but included in the final).
"""
import sys, zipfile, io, csv, json, os, collections
from datetime import datetime
src, outdir = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
name = [n for n in z.namelist() if n.endswith('.csv')][0]
uf = name.split('_')[2]; turno = name.split('_')[1]
rows = csv.DictReader(io.TextIOWrapper(z.open(name), encoding='latin-1'), delimiter=';')
secs = {}   # (cargo, mun, zona, secao) -> dict
cands = collections.defaultdict(dict)
t0 = None
for r in rows:
    cargo = r['CD_CARGO_PERGUNTA']
    if cargo not in ('1', '3'):
        continue
    key = (cargo, r['CD_MUNICIPIO'], r['NR_ZONA'], r['NR_SECAO'])
    s = secs.get(key)
    if s is None:
        ts = r['DT_BU_RECEBIDO']
        if ts and ts != '#NULO#':
            dt = datetime.strptime(ts, '%d/%m/%Y %H:%M:%S')
            if t0 is None:
                t0 = datetime.strptime(r['DT_PLEITO'] + ' 17:00:00', '%d/%m/%Y %H:%M:%S')
            t = int((dt - t0).total_seconds())
        else:
            t = -1
        s = secs[key] = {'t': t, 'mun': r['CD_MUNICIPIO'], 'zona': r['NR_ZONA'], 'aptos': int(r['QT_APTOS']),
                         'comp': int(r['QT_COMPARECIMENTO']), 'b': 0, 'n': 0, 'v': {}}
    tv = r['CD_TIPO_VOTAVEL']; q = int(r['QT_VOTOS'])
    if tv == '1':
        num = r['NR_VOTAVEL']; s['v'][num] = s['v'].get(num, 0) + q; cands[cargo].setdefault(num, r['NM_VOTAVEL'])
    elif tv == '2':
        s['b'] += q
    elif tv == '3':
        s['n'] += q
    # tv 4 = anulado/sub judice etc: ignored (not valid votes)
os.makedirs(os.path.join(outdir, turno), exist_ok=True)
for cargo in sorted({k[0] for k in secs}):
    lst = [v for k, v in secs.items() if k[0] == cargo]
    lst.sort(key=lambda s: (s['t'] < 0, s['t']))
    out = {'uf': uf, 'turno': turno, 'cargo': cargo, 'cands': cands[cargo],
           'sections': [[s['t'], s['mun'], s['zona'], s['aptos'], s['comp'], s['b'], s['n'], s['v']] for s in lst]}
    p = os.path.join(outdir, turno, f'{uf}-c{cargo}.json')
    json.dump(out, open(p, 'w'), separators=(',', ':'))
    tot = collections.Counter()
    for s in lst: tot.update(s['v'])
    vv = sum(tot.values()); top = tot.most_common(3)
    print(uf, turno, 'cargo', cargo, 'sections', len(lst), 'no-ts', sum(1 for s in lst if s['t'] < 0), 'valid', vv,
          ' '.join(f"{n}:{v/vv*100:.2f}%" for n, v in top), 'aptos', sum(s['aptos'] for s in lst), 'tmax(min)', max(s['t'] for s in lst)//60)
