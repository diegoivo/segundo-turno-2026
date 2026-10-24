#!/usr/bin/env python3
"""Gera o replay sintetico do 2o turno (6258/6260) a partir do replay do 1T. Saida: tse/assets/<HHMM>/oficial/ele2026/..."""
import json, os, sys, shutil
SRC = '/Users/diego/Claude/segundo-turno/backfill/1t2026/replay'
FIX = '/Users/diego/Claude/segundo-turno/fixtures/tse/oficial/ele2026/6260/config/mun-e006260-cm.json'
OUT = sys.argv[1]
PRES = ('13', '22')
GOV = {'ac': ('11', '10'), 'am': ('55', '22'), 'df': ('11', '13'), 'es': ('10', '15'), 'rn': ('44', '13'), 'to': ('44', '45')}
UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split()
ALVOS = [0, 0.3, 0.8, 1.5, 3, 5, 7, 9.5, 12, 15, 19, 23, 28, 34, 40, 46, 52, 58, 64, 70, 75, 80, 85, 89, 92, 95, 97, 98.5, 99.5, 100]

def pct(n, d, casas=2):
    return 0.0 if not d else 100.0 * n / d
def f2(x): return f'{x:.2f}'.replace('.', ',')
def f9(x):
    s = f'{x:.9f}'.rstrip('0').rstrip('.')
    return (s or '0').replace('.', ',')
def put_pct(d, k, kn, n, tot):
    x = pct(n, tot); d[k] = f2(x); d[kn] = f9(x)

def instantes():
    ks = sorted(os.listdir(f'{SRC}/presidente'), key=lambda h: (h < '1700', h))  # 1700..2355, 0000..0300
    pst = {}
    for k in ks:
        d = json.load(open(f'{SRC}/presidente/{k}/br-c0001-e006257-u.json'))
        pst[k] = float(d['s']['pstn'].replace(',', '.'))
    escolhidos = []
    for a in ALVOS:
        k = min(ks, key=lambda h: (abs(pst[h] - a), h))
        if k not in escolhidos: escolhidos.append(k)
    # garante o 100% (ultimo snapshot) como final
    return sorted(escolhidos, key=lambda h: (h < '1700', h)), pst

def data_dg(hhmm):
    return '26/10/2026' if hhmm < '1700' else '25/10/2026'

def cands(d):
    return [c for a in d['carg'][0]['agr'] for p in a['par'] for c in p['cand']]

def num(s): return int(s)

def reduzir(d, par, hhmm, ele, region_over=None):
    """Mantem so os 2 candidatos; redistribui os votos dos demais na proporcao dos 2 (validos preservados)."""
    cs = {c['n']: c for c in cands(d)}
    a, b = par
    va, vb_ = num(cs[a]['vap']), num(cs[b]['vap'])
    vvc = num(d['v']['vvc'])
    if va + vb_ > 0:
        na = (va * vvc) // (va + vb_)
    else:
        na = vvc // 2
    nb = vvc - na
    return {a: na, b: nb}

def montar(d, votos, par, hhmm, ele):
    d = json.loads(json.dumps(d))
    d['ele'] = ele; d['t'] = '2'
    d['dg'] = data_dg(hhmm)
    if d.get('dt'): d['dt'] = data_dg(hhmm) if d['dt'] else ''
    d.pop('_sintetico_backfill', None); d['_sintetico_ensaio'] = True
    carg = d['carg'][0]
    novas = []
    for ag in carg['agr']:
        pars = [p for p in ag['par'] if any(c['n'] in par for c in p['cand'])]
        if not pars: continue
        for p in pars:
            p['cand'] = [c for c in p['cand'] if c['n'] in par]
        ag['par'] = pars
        novas.append(ag)
    carg['agr'] = novas
    ptn = {n for ag in novas for p in ag['par'] for n in [p['n']]}
    carg['fed'] = [f for f in carg.get('fed', []) if any(x in ptn for x in f.get('npar', []))]
    v = d['v']; tv = num(v['tv']); vvc = sum(votos.values())
    tf_final = d['tf'] == 's'
    ordem = sorted(votos, key=lambda n: -votos[n])
    for ag in novas:
        for p in ag['par']:
            for c in p['cand']:
                n = votos[c['n']]
                c['vap'] = str(n)
                put_pct(c, 'pvap', 'pvapn', n, vvc)
                c['seq'] = str(ordem.index(c['n']) + 1)
                if tf_final and vvc > 0:
                    gan = ordem[0] == c['n']
                    c['e'] = 's' if gan else 'n'; c['st'] = 'Eleito' if gan else 'Não eleito'
                else:
                    c['e'] = 'n'; c['st'] = ''
            tot = sum(votos[c['n']] for c in p['cand'])
            p['tvtn'] = p['tvan'] = str(tot)
        tot = sum(votos[c['n']] for p in ag['par'] for c in p['cand'])
        if 'tvtn' in ag or True:
            ag['tvtn'] = ag['tvan'] = str(tot)
    v['vvc'] = v['vv'] = v['vnom'] = str(vvc)
    v['tv'] = str(vvc + num(v['vb']) + num(v['tvn']))
    e = d['e']; e['c'] = v['tv']
    e['a'] = str(max(0, num(e['te']) - num(e['c'])))
    recalc_pcts(d)
    return d

def recalc_pcts(d):
    s, e, v = d['s'], d['e'], d['v']
    ts = num(s['ts'])
    for k in ('st', 'snt', 'si', 'sni', 'sa', 'sna'):
        put_pct(s, 'p' + k, 'p' + k + 'n', num(s[k]), ts)
    te = num(e['te'])
    for k in ('est', 'esnt', 'esi', 'esni', 'esa', 'esna'):
        put_pct(e, 'p' + k, 'p' + k + 'n', num(e[k]), te)
    est = num(e['est'])
    put_pct(e, 'pc', 'pcn', num(e['c']), est); put_pct(e, 'pa', 'pan', num(e['a']), est)
    tv = num(v['tv'])
    put_pct(v, 'pvvc', 'pvvcn', num(v['vvc']), tv)
    for k in ('vv', 'vnom', 'van', 'vansj'):
        put_pct(v, 'p' + k, 'p' + k + 'n', num(v[k]), num(v['vvc']) if k in ('vv', 'vnom') else tv)
    put_pct(v, 'pvb', 'pvbn', num(v['vb']), tv); put_pct(v, 'ptvn', 'ptvnn', num(v['tvn']), tv)
    put_pct(v, 'pvn', 'pvnn', num(v['vn']), num(v['tvn'])); put_pct(v, 'pvnt', 'pvntn', num(v['vnt']), num(v['tvn']))

def alocar(total, w, i):
    W = sum(w); c0 = sum(w[:i]); c1 = sum(w[:i + 1])
    return total * c1 // W - total * c0 // W

def zona(d, votos, par, hhmm, ele, zonas, i, cdmu):
    """Divide o 'municipio' do DF em zonas (pesos 1..n): arquivo da zona = fracao deterministica do total."""
    w = list(range(1, len(zonas) + 1))
    z = json.loads(json.dumps(d))
    zv = {n: alocar(votos[n], w, i) for n in votos}
    for k in ('st', 'si', 'sa', 'ts'):
        z['s'][k] = str(alocar(num(d['s'][k]), w, i))
    ts = num(z['s']['ts'])
    for k in ('st', 'si', 'sa'):
        z['s'][k] = str(min(num(z['s'][k]), ts))
    z['s']['snt'] = str(ts - num(z['s']['st'])); z['s']['sni'] = str(ts - num(z['s']['si'])); z['s']['sna'] = str(ts - num(z['s']['sa']))
    for k in ('te', 'est', 'esi', 'esa'):
        z['e'][k] = str(alocar(num(d['e'][k]), w, i))
    te = num(z['e']['te'])
    for k in ('est', 'esi', 'esa'): z['e'][k] = str(min(num(z['e'][k]), te))
    z['e']['esnt'] = str(te - num(z['e']['est'])); z['e']['esni'] = str(te - num(z['e']['esi'])); z['e']['esna'] = str(te - num(z['e']['esa']))
    for k in ('vb', 'vn', 'vnt'): z['v'][k] = str(alocar(num(d['v'][k]), w, i))
    z['v']['tvn'] = str(num(z['v']['vn']) + num(z['v']['vnt']))
    z['tpabr'] = 'mu'
    z['cdabr'] = cdmu
    return z, zv

def main():
    shutil.rmtree(OUT, ignore_errors=True)
    insts, pst = instantes()
    print('instantes', len(insts), insts)
    json.dump({'instantes': insts, 'pst_br': {k: pst[k] for k in insts}}, open(os.path.dirname(OUT) + '/instantes.json', 'w'))
    cfg = json.load(open(FIX))
    zonas_df = next(m for a in cfg['abr'] if a['cd'] == 'df' for m in a['mu'])
    estr_cfg = {a['cd']: [m['cd'] for m in a['mu']] for a in cfg['abr']}
    nfiles = 0
    def gravar(hhmm, ele, uf, nome, obj):
        nonlocal nfiles
        p = f'{OUT}/{hhmm}/oficial/ele2026/{ele}/dados/{uf}/{nome}-c000{1 if ele=="6258" else 3}-e00{ele}-u.json'
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(obj, open(p, 'w'), ensure_ascii=False, separators=(',', ':')); nfiles += 1
    for h in insts:
        # presidente: UFs+zz primeiro; BR = soma dos votos (coerencia aditiva)
        soma = {n: 0 for n in PRES}
        for r in UFS + ['zz']:
            d = json.load(open(f'{SRC}/presidente/{h}/{r}-c0001-e006257-u.json'))
            vt = reduzir(d, PRES, h, '6258')
            for n in PRES: soma[n] += vt[n]
            gravar(h, '6258', r, r, montar(d, vt, PRES, h, '6258'))
        d = json.load(open(f'{SRC}/presidente/{h}/br-c0001-e006257-u.json'))
        gravar(h, '6258', 'br', 'br', montar(d, soma, PRES, h, '6258'))
        for uf, par in GOV.items():
            somauf = {n: 0 for n in par}; nest = 0
            for cd in estr_cfg[uf]:
                p = f'{SRC}/governador/{uf}/{h}/{uf}{cd}-c0003-e006259-u.json'
                if not os.path.exists(p): continue
                d = json.load(open(p)); d['cdabr'] = cd
                vt = reduzir(d, par, h, '6260'); nest += 1
                for n in par: somauf[n] += vt[n]
                if uf == 'df':
                    base = montar(d, vt, par, h, '6260')
                    for i, zc in enumerate(zonas_df['z']):
                        z, zv = zona(base, vt, par, h, '6260', zonas_df['z'], i, cd)
                        zz = montar(z, zv, par, h, '6260')
                        zz['s'] = z['s']; zz['e'] = z['e']; zz['v']['tv'] = str(sum(zv.values()) + num(z['v']['vb']) + num(z['v']['tvn']))
                        zz['e']['c'] = zz['v']['tv']; zz['e']['a'] = str(max(0, num(zz['e']['te']) - num(zz['e']['c'])))
                        recalc_pcts(zz)
                        gravar(h, '6260', uf, f'{uf}{cd}-z{zc}', zz)
                else:
                    gravar(h, '6260', uf, f'{uf}{cd}', montar(d, vt, par, h, '6260'))
            d = json.load(open(f'{SRC}/governador/{uf}/{h}/{uf}-c0003-e006259-u.json'))
            vt = somauf if nest else reduzir(d, par, h, '6260')
            gravar(h, '6260', uf, uf, montar(d, vt, par, h, '6260'))
    # config estatica
    os.makedirs(f'{OUT}/_estatico/6260/config', exist_ok=True)
    shutil.copy(FIX, f'{OUT}/_estatico/6260/config/mun-e006260-cm.json')
    print('arquivos', nfiles)
main()
