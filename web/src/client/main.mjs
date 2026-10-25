import { initTema } from './theme.mjs';
import { initHome } from './home.mjs';
import { initGov } from './gov.mjs';
import { initAuditoria } from './audit-ui.mjs';
import { initGithub } from './github.mjs';
import { initNavFade } from './nav-fade.mjs';
import { initDemo } from './demo-ui.mjs';
import { DEMO } from './dados.mjs';
import { $$ } from './dom.mjs';

initTema();
initGithub();
initNavFade();
if (DEMO) initDemo();
const { page, uf } = document.body.dataset;
if (page === 'home') initHome();
else if (page === 'gov' && uf) initGov(uf);
else if (page === 'auditoria') $$('section[data-cadeia]').forEach((s) => initAuditoria(s, { n: s.dataset.cadeia === '6260' ? 3 : 6 }));
