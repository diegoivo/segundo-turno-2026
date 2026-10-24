#!/bin/bash
S=/private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/backfill
cp /private/tmp/claude-502/-Users-diego-Claude-segundo-turno/491e5ea6-5823-4efe-b024-50c84ba8465d/scratchpad/bu/bweb_1t_AC_051020261403.zip $S/zips/ 2>/dev/null
for UF in ZZ AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO; do
  f=bweb_1t_${UF}_051020261403.zip
  [ -f $S/agg/$UF-c1.jsonl ] && continue
  [ -f $S/zips/$f ] || curl -sS -f -o $S/zips/$f https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/buweb/$f || { echo FAIL $UF; continue; }
  python3 -I $S/scripts/agg_uf.py $UF $S/zips/$f $S/agg && rm -f $S/zips/$f
done
echo DONE
