// Gerado por model/tools/gerar-baselines.mjs. Nao editar a mao.
import presidente from './presidente.json' with { type: 'json' };
import presidenteMunicipios from './presidente-municipios.json' with { type: 'json' };
import gov_ac from './governador-ac.json' with { type: 'json' };
import gov_am from './governador-am.json' with { type: 'json' };
import gov_df from './governador-df.json' with { type: 'json' };
import gov_es from './governador-es.json' with { type: 'json' };
import gov_rn from './governador-rn.json' with { type: 'json' };
import gov_to from './governador-to.json' with { type: 'json' };
export const BASELINES = Object.freeze({
  presidente,
  presidenteMunicipios,
  governador: Object.freeze({ ac: gov_ac, am: gov_am, df: gov_df, es: gov_es, rn: gov_rn, to: gov_to }),
});
