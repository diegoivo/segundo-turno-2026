"""Converte a reconstrucao do 1T 2026 (backfill/1t2026/secoes-*.csv.gz, por secao, com dt_bu_recebido) para o formato
de eventos do replay (igual ao de bweb2events.py): dl/events/1t2026/<UF>-c<cargo>.json
Uso: python3 -I csv2026_to_events.py <secoes-presidente.csv.gz> <cargo 1|3> <outdir> [<secoes-governador-xx.csv.gz> ...]
t = segundos desde 17:00:00 de 04/10/2026 (dt_bu_recebido); sem horario -> -1 (so no final).
"""
import sys, gzip, csv, json, os, collections
from datetime import datetime
cargo, outdir = sys.argv[2], sys.argv[3]
files = [sys.argv[1]] + sys.argv[4:]
T0 = datetime(2026, 10, 4, 17, 0, 0)
por_uf = collections.defaultdict(list)
cands = collections.defaultdict(dict)
for path in files:
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as g:
        rd = csv.DictReader(g)
        vcols = [c for c in rd.fieldnames if c.startswith('v_')]
        for r in rd:
            dt = r['dt_bu_recebido']
            t = int((datetime.strptime(dt, '%Y-%m-%d %H:%M:%S') - T0).total_seconds()) if dt else -1
            votos = {c[2:]: int(r[c]) for c in vcols if r[c] not in ('', '0')}
            for n in votos: cands[r['uf']].setdefault(n, n)
            por_uf[r['uf']].append([t, r['cd_municipio'], r['zona'], int(r['aptos']), int(r['comparecimento']), int(r['brancos'] or 0), int(r['nulos'] or 0), votos])
os.makedirs(os.path.join(outdir, '1t2026'), exist_ok=True)
for uf, lst in por_uf.items():
    lst.sort(key=lambda s: (s[0] < 0, s[0]))
    out = {'uf': uf, 'turno': '1t2026', 'cargo': cargo, 'cands': cands[uf], 'sections': lst}
    json.dump(out, open(os.path.join(outdir, '1t2026', f'{uf}-c{cargo}.json'), 'w'), separators=(',', ':'))
    tot = collections.Counter()
    for s in lst: tot.update(s[7])
    vv = sum(tot.values()); top = tot.most_common(2)
    print(uf, 'cargo', cargo, 'secoes', len(lst), 'sem-ts', sum(1 for s in lst if s[0] < 0), 'validos', vv, ' '.join(f'{n}:{v/vv*100:.2f}%' for n, v in top), 'tmax(min)', max(s[0] for s in lst) // 60)
