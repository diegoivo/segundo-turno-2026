import { initTema } from './theme.mjs';
import { initHome } from './home.mjs';
import { initGov } from './gov.mjs';
import { initAuditoria } from './audit-ui.mjs';
import { $$ } from './dom.mjs';

initTema();
const { page, uf } = document.body.dataset;
if (page === 'home') initHome();
else if (page === 'gov' && uf) initGov(uf);
else if (page === 'auditoria') $$('section[data-cadeia]').forEach((s) => initAuditoria(s, { n: s.dataset.cadeia === '6260' ? 3 : 6 }));
