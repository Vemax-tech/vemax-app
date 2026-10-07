// Módulos com estrutura de dados pronta, interface prevista para as próximas fases
import { start, h, pageHead, empty } from '../ui.js';

const INFO = {
  projetos: ['Projetos', 'Clientes, projetos, status, responsáveis e prazos. Tabela `projetos` já criada.'],
  contatos: ['Contatos do site', 'Mensagens recebidas pelo formulário do site, com o problema descrito e a solução sugerida. Tabela `contatos_site` já criada.'],
  conhecimento: ['Base de conhecimento', 'Processos internos, templates e prompts reutilizáveis. Tabela `conhecimento` já criada.'],
};

export const init = (key) => start(key + '/', INFO[key][0], async (ctx, view) => {
  view.append(pageHead('Em breve', INFO[key][0], INFO[key][1]), empty('Este módulo será construído na próxima fase.'));
});
