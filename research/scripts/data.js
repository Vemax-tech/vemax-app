// Base de dados da pesquisa de mercado — única fonte de verdade para PDF, Excel e Power BI.
// Convenção: tipo "F" = nota/afirmação ancorada em dado com fonte; "I" = inferência da análise (sem dado direto).
// Data de acesso de todas as fontes: 07/10/2026.

const ACESSO = '2026-10-07';

const fontes = [
  { id: 'S01', titulo: 'Sebrae/DataSebrae — Resumo Executivo: Aberturas de Pequenos Negócios, Anual 2025 (13/01/2026)', url: 'https://datasebrae.com.br/wp-content/uploads/2026/01/13012026_resumo_executivo_aberturas_pn_anual.pdf', tipo: 'Pesquisa oficial (entidade de apoio, dados da Receita Federal)', conf: 'Alta', obs: 'Texto do PDF lido integralmente. O texto do próprio documento traz um erro de digitação ("comparando com 2025" onde se lê 2024).' },
  { id: 'S02', titulo: 'CGI.br/Cetic.br — TIC Empresas 2024, Resumo Executivo', url: 'https://cetic.br/media/docs/publicacoes/2/20250512121759/tic_empresas_2024_resumo_executivo.pdf', tipo: 'Pesquisa oficial (survey por telefone, 4.453 empresas)', conf: 'Alta', obs: 'Abrange apenas empresas com 10 ou mais pessoas ocupadas — NÃO representa microempresas e MEI.' },
  { id: 'S03', titulo: 'CGI.br/Cetic.br — TIC Empresas 2025, Principais Resultados (15/06/2026)', url: 'https://cetic.br/media/analises/TIC-Empresas-2025-lancamento.pdf', tipo: 'Pesquisa oficial (4.174 empresas; coleta fev/2025–jan/2026)', conf: 'Média-alta', obs: 'Valores de CRM por porte e estimativa de empresas com IA foram extraídos do texto de gráficos do PDF; conferir nas tabelas do site do Cetic.br antes de citar externamente.' },
  { id: 'S04', titulo: 'IBGE — Pesquisa Anual de Serviços (PAS) 2023, Informativo', url: 'https://biblioteca.ibge.gov.br/visualizacao/periodicos/150/pas_2023_v25_informativo.pdf', tipo: 'Estatística oficial', conf: 'Alta', obs: 'Cobre serviços não financeiros, empresas formais.' },
  { id: 'S05', titulo: 'IBGE — Pesquisa Anual de Comércio (PAC) 2024, divulgada em 29/07/2026 (via Poder360)', url: 'https://www.poder360.com.br/poder-economia/comercio-formal-ocupou-106-milhoes-de-pessoas-em-2024-diz-ibge/', tipo: 'Estatística oficial reportada por veículo de imprensa', conf: 'Média-alta', obs: 'A página da agência do IBGE retornou erro 403 na consulta; números conferidos em veículo que reproduz o release.' },
  { id: 'S06', titulo: 'Sebrae — Pesquisa TIC 2025: Transformação Digital nos Pequenos Negócios (resumo no Sebrae/PR)', url: 'https://sebraepr.com.br/impulsiona/pesquisa-tic-2025-transformacao-digital-nos-pequenos-negocios/', tipo: 'Pesquisa oficial (resumo institucional)', conf: 'Média', obs: 'O resumo não informa tamanho de amostra nem ano de coleta; indicadores citados são qualitativos ("quase metade").' },
  { id: 'S07', titulo: 'Agência Sebrae — Três em cada 10 MEI fecham as portas em até cinco anos (16/06/2021)', url: 'https://agenciasebrae.com.br/economia-e-politica/tres-em-cada-10-mei-fecham-as-portas-em-ate-cinco-anos-de-atividade-no-brasil', tipo: 'Pesquisa oficial (Sobrevivência de Empresas, 2020)', conf: 'Média', obs: 'Dado antigo e influenciado pela pandemia (40% atribuíram o fechamento à Covid-19). Usar como ordem de grandeza.' },
  { id: 'S08', titulo: 'Diário do Comércio — Sebrae: pequenos negócios ainda misturam finanças (pesquisa "Hábitos Financeiros", 2023 e 2025)', url: 'https://diariodocomercio.com.br/negocios/sebrae-pequenos-negocios-ainda-misturam-financas/', tipo: 'Pesquisa Sebrae reportada por imprensa', conf: 'Média', obs: 'Amostra não informada na matéria. Uma busca anterior citou "6 em 10"; a matéria lida diz "5 em cada 10" para controle precário — usamos o texto lido.' },
  { id: 'S09', titulo: 'InfoMoney / Estado de Minas — Censo Condominial 2025/26 (uCondo)', url: 'https://www.infomoney.com.br/consumo/taxa-de-condominio-sobe-25-no-brasil-e-atinge-media-de-r-516-em-2025/', tipo: 'Estudo de empresa do setor (uCondo, concorrente direto de software condominial)', conf: 'Média-baixa', obs: 'Base = clientes da própria plataforma + IBGE/Receita. Metodologia e amostra não detalhadas. Possível viés comercial.' },
  { id: 'S10', titulo: 'Exame — Superlógica quer ser a rede social dos condomínios (11/06/2024)', url: 'https://exame.com/mercado-imobiliario/presente-em-108-mil-imoveis-superlogica-quer-ser-a-rede-social-dos-condominios', tipo: 'Imprensa de negócios (dados informados pela empresa)', conf: 'Média', obs: 'Número de 108 mil condomínios e "~50% do mercado" são declarações da empresa.' },
  { id: 'S11', titulo: 'Sindiconet — Conexão Sindiconet: um mar de oportunidades para o síndico (cita AABIC)', url: 'https://www.sindiconet.com.br/informese/conexao-sindiconet-um-mar-de-oportunidades-para-o-sindico-noticias-eventos', tipo: 'Portal setorial citando associação (AABIC)', conf: 'Baixa', obs: 'Estimativa de ">500 mil condomínios" diverge do censo uCondo (327 mil); data da estimativa não confirmada.' },
  { id: 'S12', titulo: 'Medicina S/A — Clínicas privadas perdem até R$ 144 mil por problemas com agendamento (02/09/2024)', url: 'https://medicinasa.com.br/agendamento-consultas/', tipo: 'Pesquisa de fornecedor (Conclínica) reportada por imprensa', conf: 'Baixa', obs: 'Sem tamanho de amostra nem metodologia. A estimativa de prejuízo usa premissa própria (30 faltas/mês × R$ 300) e é específica da Grande São Paulo.' },
  { id: 'S13', titulo: 'Startups.com.br — Doctoralia compra brasileira Feegow (21/07/2022)', url: 'https://startups.com.br/negocios/doctoralia-compra-brasileira-feegow-e-mira-gestao-para-clinicas/', tipo: 'Imprensa especializada', conf: 'Média', obs: 'Valor da transação não divulgado; "~40 mil profissionais" é dado informado.' },
  { id: 'S14', titulo: 'Startupi — Afya anuncia aquisição de healthtech (iClinic) por R$ 182,7 milhões', url: 'https://startupi.com.br/afya-educacional-anuncia-aquisicao-de-healthtech-por-r-1827-milhoes/', tipo: 'Imprensa especializada', conf: 'Média', obs: 'Data exata da operação não confirmada na leitura.' },
  { id: 'S15', titulo: 'Baguete — Afya compra Shosp por R$ 77,7 milhões', url: 'https://www.baguete.com.br/noticias/afya-compra-shosp-por-r-777-milhoes', tipo: 'Imprensa especializada', conf: 'Média-baixa', obs: 'Apenas manchete/trecho consultado; conferir antes de citar.' },
  { id: 'S16', titulo: 'Brazil Journal — Locaweb paga R$ 524 mi pela Bling; Suno — Locaweb conclui compra', url: 'https://braziljournal.com/em-sua-maior-aquisicao-locaweb-paga-r-524-mi-pela-bling', tipo: 'Imprensa de negócios', conf: 'Média', obs: 'Aquisição da Tiny pela Olist citada em resultados de busca; não verificada em página própria.' },
  { id: 'S17', titulo: 'Bloomberg Law / LatAmList — Visma adquire a Conta Azul (anúncio em 01/08/2025)', url: 'https://latamlist.com/visma-acquires-conta-azul-to-expand-across-brazil/', tipo: 'Imprensa de negócios', conf: 'Média', obs: 'Valor reportado: ~US$ 300 mi (R$ 1,7–2 bi); ~100 mil PMEs clientes; sujeito a aprovação do CADE à época.' },
  { id: 'S18', titulo: 'ABStartups — Mapeamento do Ecossistema Brasileiro de Startups 2025', url: 'https://abstartups.com.br/wp-content/uploads/Mapeamento-do-Ecossistema-de-Startups-2025.pdf', tipo: 'Levantamento de associação (dados autodeclarados, 3.650 startups)', conf: 'Média-alta', obs: 'Dados autodeclarados; viés de seleção para startups já conectadas à associação.' },
  { id: 'S19', titulo: 'App Store / CB Insights — Trinks, Avec e Belasis (descrições dos fornecedores)', url: 'https://apps.apple.com/ng/app/trinks-com/id628518776', tipo: 'Descrição do próprio fornecedor / agregador', conf: 'Baixa', obs: '"16 mil estabelecimentos" (Trinks) e "40 mil" (Avec) são alegações dos fornecedores, sem auditoria.' },
  { id: 'S20', titulo: 'Baguete / CB Insights — Amplimed (prontuário e gestão de clínicas)', url: 'https://www.baguete.com.br/noticias/unimed-sp-telemedicina-e-prontuario-eletronico-com-amplimed', tipo: 'Imprensa / agregador', conf: 'Baixa', obs: '"670 clínicas, 8.500 profissionais" veio de resultado de busca agregador; não verificado na página.' },
].map((f) => ({ ...f, acesso: ACESSO }));

// Critérios e pesos padrão (mesmos do banco do portal: supabase/migrations/001_init.sql)
const criterios = [
  { chave: 'tamanho', nome: 'Tamanho do mercado', peso: 1, desc: 'Nº de empresas/receita potencialmente endereçável.' },
  { chave: 'dor', nome: 'Dor / necessidade tecnológica', peso: 1.5, desc: 'Intensidade dos problemas operacionais evidenciados.' },
  { chave: 'digitalizacao', nome: 'Espaço de digitalização', peso: 1, desc: 'Maior nota = mais espaço (menos digitalizado hoje).' },
  { chave: 'concorrencia', nome: 'Concorrência (menos = melhor)', peso: 1, desc: 'Maior nota = menos concorrência estruturada.' },
  { chave: 'pagar', nome: 'Disposição a pagar', peso: 1.5, desc: 'Ticket e capacidade de investimento do cliente típico.' },
  { chave: 'aquisicao', nome: 'Facilidade de aquisição', peso: 1, desc: 'Facilidade de alcançar e fechar com o decisor.' },
  { chave: 'recorrencia', nome: 'Recorrência de receita', peso: 1, desc: 'Potencial de contratos contínuos/evolução.' },
  { chave: 'aderencia', nome: 'Aderência à Vemax', peso: 1, desc: 'Encaixe com sob medida, automação, IA e dashboards.' },
];

// notas: [nota, tipo, fontes, justificativa]
const nichos = [
  {
    id: 'comercio', nome: 'Comércio', icone: 'bag',
    resumo: 'Maior base de empresas formais entre os nichos, porém com ERPs de varejo/e-commerce já consolidados e capitalizados.',
    fatos: [
      ['1,6 milhão de empresas comerciais, 1,8 milhão de unidades locais e 10,6 milhões de pessoas ocupadas em 2024; receita operacional líquida de R$ 7,7 trilhões.', 'S05'],
      ['Varejo concentra 7,6 milhões dos ocupados; atacado 2,0 milhões; veículos 950,7 mil.', 'S05'],
      ['Aberturas de pequenos negócios no comércio caíram de 1,10 milhão (2021) para 1,05 milhão (2025), −4,8%; participação do setor no total recuou 6,8 p.p.', 'S01'],
      ['Comércio teve a maior mortalidade em 5 anos entre os setores (30,2%) na pesquisa Sebrae com dados de 2020.', 'S07'],
      ['57% dos pequenos negócios do comércio pagam despesas da empresa com conta pessoal (2025).', 'S08'],
      ['O WhatsApp (49%) e o e-mail (34%) seguem como canais de venda online relevantes entre empresas com 10+ ocupados (2024).', 'S02'],
    ],
    problemas: [
      ['Mistura de finanças pessoais e do negócio e controle precário de caixa.', 'F', 'S08'],
      ['Vendas conduzidas por mensagens de WhatsApp, sem registro integrado a estoque e financeiro.', 'F', 'S02'],
      ['Alta mortalidade no 5º ano (dado antigo, influenciado pela pandemia).', 'F', 'S07'],
    ],
    necessidades: [
      ['Integração entre canais de venda (WhatsApp/marketplaces) e estoque/financeiro.', 'I'],
      ['Automação de reposição e alertas de estoque; conciliação financeira.', 'I'],
      ['Painéis simples de margem e giro para o dono (não para contador).', 'I'],
    ],
    concorrentes: [
      ['Bling (LWSA/Locaweb)', 'ERP para e-commerce e pequenos negócios', 'Adquirida pela Locaweb por R$ 524,3 mi', 'S16', 'Alto'],
      ['Tiny (Olist)', 'ERP para lojas e e-commerce', 'Aquisição pela Olist citada em buscas — verificar', 'S16', 'Alto'],
      ['Conta Azul (Visma)', 'ERP em nuvem para PMEs e contadores', '~100 mil PMEs; aquisição anunciada em 01/08/2025 (~US$ 300 mi)', 'S17', 'Alto'],
    ],
    oportunidades: [
      'Integrações e automações sob medida entre ERP existente, WhatsApp e marketplaces (não competir com o ERP).',
      'Dashboards operacionais para redes pequenas (2–10 lojas) mal atendidas por ERPs genéricos. (inferência)',
    ],
    riscos: ['ERPs com muito capital e base instalada; disputa por preço.', 'Retração das aberturas no setor (−4,8% 2021–2025).'],
    notas: {
      tamanho: [8, 'F', 'S05,S01', '1,6 mi de empresas e R$ 7,7 tri de receita; mas aberturas de PN em queda.'],
      dor: [7, 'F', 'S08,S07,S02', 'Maior mortalidade em 5 anos (30,2%, dado de 2020); 57% misturam contas; venda via WhatsApp sem integração.'],
      digitalizacao: [5, 'F', 'S06', 'Sebrae aponta o comércio como o setor onde sistemas integrados mais avançam → menos espaço.'],
      concorrencia: [3, 'F', 'S16,S17', 'ERPs consolidados por grupos grandes (LWSA, Olist, Visma).'],
      pagar: [5, 'I', '', 'Sem dado de ticket; margens apertadas no varejo e concorrência por preço de ERPs.'],
      aquisicao: [5, 'I', '', 'Muitos compradores, decisão por dono/gerente; sem canal concentrado identificado.'],
      recorrencia: [7, 'I', '', 'Sistemas de operação diária geram contratos contínuos.'],
      aderencia: [7, 'I', '', 'Integrações/automações/dashboards encaixam; ERP completo seria commodity.'],
    },
  },
  {
    id: 'servicos', nome: 'Prestadores de serviço', icone: 'wrench',
    resumo: 'Maior volume de novos negócios do país e baixa maturidade digital; ticket tende a ser menor por ser dominado por MEI.',
    fatos: [
      ['Serviços responderam por 63,8% das aberturas de pequenos negócios em 2025: ~3,16 milhões de novas empresas.', 'S01'],
      ['Setor de serviços não financeiros em 2023: 1,7 milhão de empresas ativas, 15,2 milhões de ocupados, R$ 3,2 tri de receita operacional líquida.', 'S04'],
      ['62% dos pequenos negócios de serviços pagam despesas da empresa com conta pessoal (2025).', 'S08'],
      ['Controle financeiro dos pequenos negócios: planilha 30%, caderno 25%, app/sistema 20%, contador 13%, nenhum 10%.', 'S08'],
      ['Serviços tiveram mortalidade de 26,6% em 5 anos (dados de 2020).', 'S07'],
      ['"Atividades de malote e entrega" foi a classe com mais MEI novos em 2025: 282.616 (7,4% dos MEI).', 'S01'],
    ],
    problemas: [
      ['Gestão em planilha/caderno e finanças misturadas.', 'F', 'S08'],
      ['Uso básico da internet: menos de 13% usam plataformas de gestão, marketplaces ou cursos online (Sebrae TIC 2025).', 'F', 'S06'],
      ['Agenda, orçamento e atendimento concentrados em WhatsApp.', 'I', ''],
    ],
    necessidades: [
      ['Agenda + orçamento + cobrança integrados e simples, para quem não usa ERP.', 'I'],
      ['Automação de lembretes e follow-up de clientes.', 'I'],
      ['Soluções verticais por ofício (cada segmento tem fluxo próprio).', 'I'],
    ],
    concorrentes: [
      ['Trinks', 'Agendamento e gestão para beleza/estética', '"16 mil estabelecimentos" (alegação da empresa)', 'S19', 'Médio'],
      ['Avec', 'Gestão "tudo-em-um" para salões', '"40 mil estabelecimentos" (alegação da empresa)', 'S19', 'Médio'],
      ['Belasis', 'Agendamento para barbearias', 'Citada em resultados de busca; sem dados', 'S19', 'Baixo'],
    ],
    oportunidades: [
      'Verticais ainda sem líder (oficinas, manutenção residencial, assistência técnica, contabilidade, advocacia pequena). (inferência — ofícios não pesquisados individualmente)',
      'Automação de atendimento por WhatsApp com IA para pequenos prestadores.',
    ],
    riscos: ['77% das aberturas são MEI → ticket baixo e alta rotatividade.', 'Concorrência de apps genéricos baratos.'],
    notas: {
      tamanho: [9, 'F', 'S01,S04', '63,8% das aberturas; 1,7 mi de empresas e 15,2 mi de ocupados.'],
      dor: [7, 'F', 'S08,S06', '62% misturam contas; controle por planilha/caderno; baixo uso de plataformas de gestão.'],
      digitalizacao: [8, 'F', 'S08,S06', 'Só 20% controlam finanças por app/sistema; MEI com dificuldade de adoção.'],
      concorrencia: [5, 'I', 'S19', 'Há líderes verticais em beleza, mas o universo de serviços é fragmentado por ofício.'],
      pagar: [4, 'I', 'S01', 'Predomínio de MEI (76,9% das aberturas) sugere ticket baixo.'],
      aquisicao: [5, 'I', '', 'Volume enorme, porém pulverizado; exige canal de baixo custo.'],
      recorrencia: [6, 'I', '', 'Assinaturas leves, com churn alto esperado.'],
      aderencia: [8, 'I', '', 'Automação, agenda, orçamento, IA de atendimento e painéis encaixam bem.'],
    },
  },
  {
    id: 'condominios', nome: 'Condomínios', icone: 'building',
    resumo: 'Mercado com incumbente forte e dados de tamanho divergentes; recorrente, mas com espaço mais estreito para software sob medida.',
    fatos: [
      ['Censo uCondo 2025/26: 327 mil condomínios ativos e ~39 milhões de moradores (base da própria plataforma + IBGE/Receita).', 'S09'],
      ['Outra estimativa (AABIC via Sindiconet) fala em mais de 500 mil condomínios — divergência não reconciliada.', 'S11'],
      ['Taxa condominial média R$ 516 no 1º semestre de 2025, alta de 24,9% desde 2022 (R$ 413).', 'S09'],
      ['Superlógica declara 108 mil condomínios (~50% do mercado segundo a empresa) e R$ 450 mi captados da Warburg Pincus (2020 e 2023).', 'S10'],
      ['Superlógica fez 8 aquisições desde 2019 e lançou o app Gruvi (20 mil+ condomínios).', 'S10'],
    ],
    problemas: [
      ['Aumento da taxa condominial pressiona a gestão financeira e a cobrança.', 'F', 'S09'],
      ['Comunicação e processos internos dispersos (síndico profissional ou voluntário).', 'I', ''],
    ],
    necessidades: [
      ['Integração de portaria/controle de acesso, comunicados e ocorrências.', 'I'],
      ['Automação de cobrança e prestação de contas para administradoras pequenas.', 'I'],
    ],
    concorrentes: [
      ['Superlógica', 'Gestão condominial, acesso, serviços financeiros', '108 mil condomínios (alegação), Warburg Pincus R$ 450 mi', 'S10', 'Alto'],
      ['uCondo', 'Plataforma de gestão e publicadora do Censo Condominial', 'Base de clientes não divulgada na fonte lida', 'S09', 'Médio'],
    ],
    oportunidades: [
      'Integrações com portaria/CFTV e automações para administradoras de pequeno porte. (inferência)',
    ],
    riscos: ['Incumbente com ecossistema (pagamentos, acesso, app).', 'Dados de tamanho de mercado contraditórios.'],
    notas: {
      tamanho: [4, 'F', 'S09,S11', '327 mil a 500 mil condomínios: poucos clientes em número absoluto, mas contas B2B2C.'],
      dor: [6, 'I', 'S09', 'Taxa +24,9% em ~3,5 anos pressiona gestão; demais dores sem dado direto.'],
      digitalizacao: [4, 'F', 'S10', 'Superlógica já atende 108 mil condomínios → mercado digitalizado.'],
      concorrencia: [3, 'F', 'S10,S09', 'Líder capitalizado e em consolidação (8 aquisições).'],
      pagar: [6, 'I', '', 'Orçamento do condomínio existe, mas decisão coletiva (assembleia) e sensível a custo.'],
      aquisicao: [6, 'I', '', 'Administradoras concentram a decisão de vários condomínios.'],
      recorrencia: [8, 'I', '', 'Serviço contínuo por natureza.'],
      aderencia: [5, 'I', '', 'Produto padronizado domina; espaço em integrações e automações.'],
    },
  },
  {
    id: 'clinicas', nome: 'Clínicas', icone: 'heart',
    resumo: 'Dor operacional evidente (faltas, confirmação), alta disposição a pagar presumida, porém concorrência consolidada por grupos de saúde.',
    fatos: [
      ['"Atenção ambulatorial por médicos e odontólogos" foi a classe CNAE com mais novas micro e pequenas empresas em 2025: 69.407 (6,1% do grupo).', 'S01'],
      ['Pesquisa da Conclínica (fornecedor, sem amostra informada): 42,2% das clínicas privadas têm dificuldade em confirmar consultas; 60% em conquistar novos pacientes.', 'S12'],
      ['Estimativa de prejuízo na Grande SP: R$ 12 mil/mês (30 faltas × R$ 300), ou R$ 144 mil/ano — premissa do fornecedor.', 'S12'],
      ['Afya comprou a iClinic por R$ 182,7 mi e a Shosp por R$ 77,7 mi; Doctoralia comprou a Feegow (~40 mil profissionais, 2022).', 'S14,S15,S13'],
    ],
    problemas: [
      ['Faltas e dificuldade de confirmação de consultas.', 'F', 'S12'],
      ['Captação de pacientes.', 'F', 'S12'],
    ],
    necessidades: [
      ['Confirmação e reagendamento automáticos por WhatsApp; fila de espera.', 'I'],
      ['Painéis de ocupação e faturamento por convênio.', 'I'],
      ['Conformidade com LGPD e normas do CFM (não pesquisado nesta rodada — lacuna).', 'I'],
    ],
    concorrentes: [
      ['iClinic (Afya)', 'Prontuário, agenda, financeiro, telemedicina', 'Comprada por R$ 182,7 mi', 'S14', 'Alto'],
      ['Shosp (Afya)', 'Gestão para clínicas', 'Comprada por R$ 77,7 mi', 'S15', 'Alto'],
      ['Feegow (Doctoralia)', 'Gestão de clínicas e consultórios', '~40 mil profissionais; adquirida em 21/07/2022', 'S13', 'Alto'],
      ['Amplimed', 'Prontuário e gestão', '"670 clínicas / 8.500 profissionais" (não verificado)', 'S20', 'Médio'],
    ],
    oportunidades: [
      'Camada de automação/IA de relacionamento sobre os sistemas existentes (integração via API). (inferência)',
    ],
    riscos: ['Concorrentes com apoio de grupos de saúde/educação.', 'Exigências regulatórias e de proteção de dados elevam custo de entrada.'],
    notas: {
      tamanho: [6, 'F', 'S01', 'Universo total de clínicas não levantado (lacuna); entrada de 69 mil novas MPE de saúde ambulatorial em 2025.'],
      dor: [8, 'F', 'S12', '42,2% com dificuldade de confirmar consultas (fonte de fornecedor — confiança baixa).'],
      digitalizacao: [5, 'I', 'S13,S14', 'Prontuário e agenda já são amplamente ofertados.'],
      concorrencia: [3, 'F', 'S13,S14,S15', 'Três consolidações por grupos maiores (Afya x2, Doctoralia).'],
      pagar: [8, 'I', 'S14', 'Profissionais liberais com ticket alto; grupos pagaram R$ 77–183 mi por plataformas.'],
      aquisicao: [6, 'I', '', 'Decisor identificável (médico/gestor), mas desconfiança e compliance alongam o ciclo.'],
      recorrencia: [8, 'I', '', 'Sistemas de prontuário/agenda são contratos contínuos.'],
      aderencia: [6, 'I', '', 'Automação/IA encaixam; exigências de saúde exigem competência específica.'],
    },
  },
  {
    id: 'empresas', nome: 'Empresas (10+ ocupados)', icone: 'briefcase',
    resumo: 'Melhor evidência direta de demanda por desenvolvimento externo (IA, automação, CRM) e menor mapeamento de concorrência para software sob medida.',
    fatos: [
      ['Pacotes de CRM: 25% das empresas em 2024 (pequenas 23%, médias 38%, grandes 50%) e 31% em 2025 (29%, 41%, 56%) — valores extraídos de gráfico.', 'S03'],
      ['Estimativa de empresas que usaram IA: 65.529 (2024) → 93.475 (2025), +42,6%.', 'S02,S03'],
      ['Entre as empresas que usam IA (2024): 76% adquiriram soluções prontas; 56% contrataram fornecedores externos para modificar/desenvolver sistemas de IA; 20% desenvolveram internamente.', 'S02'],
      ['Automação de processos de fluxo de trabalho foi o tipo de IA mais usado.', 'S02'],
      ['Pesquisa cobre só empresas com 10+ ocupados; 4.174 respondentes em 2025.', 'S03'],
    ],
    problemas: [
      ['Baixa adoção de CRM mesmo entre empresas formais (≈ 3 em cada 10).', 'F', 'S03'],
      ['Desenvolvimento interno de IA ainda limitado — dependência de fornecedores.', 'F', 'S02'],
    ],
    necessidades: [
      ['Automação de fluxos de trabalho e integrações entre sistemas.', 'F'],
      ['Aplicações de IA customizadas (atendimento, análise de texto, previsão).', 'F'],
      ['Painéis consolidados de operação.', 'I'],
    ],
    concorrentes: [
      ['Software houses e consultorias de TI', 'Desenvolvimento sob medida e integração', 'Concorrência não mapeada nesta rodada — LACUNA', '—', 'Desconhecido'],
      ['Fornecedores de ERP/CRM de prateleira', 'Pacotes configuráveis', 'Participação não levantada — LACUNA', '—', 'Desconhecido'],
    ],
    oportunidades: [
      '56% das empresas com IA contrataram externos: demanda comprovada por customização/integração (fato).',
      'Nicho de médias empresas (10–249) com baixa adoção de CRM e forte uso de WhatsApp. (inferência)',
    ],
    riscos: ['Ciclo de venda longo; compras com comparação de propostas.', 'Pesquisa não representa micro e MEI.'],
    notas: {
      tamanho: [5, 'I', 'S03', 'Universo de empresas com 10+ ocupados não foi levantado (lacuna).'],
      dor: [7, 'F', 'S02,S03', 'Adoção baixa de CRM; 56% dependem de externos para IA.'],
      digitalizacao: [6, 'F', 'S03', 'CRM 31% em 2025; IA em crescimento mas ainda minoritária.'],
      concorrencia: [6, 'I', '', 'Concorrência de software houses não foi mapeada; nota provisória.'],
      pagar: [7, 'I', 'S02', 'Empresas com 10+ ocupados contratam fornecedores externos de IA.'],
      aquisicao: [5, 'I', '', 'Ciclo mais longo, com múltiplos decisores.'],
      recorrencia: [7, 'I', '', 'Manutenção e evolução contínuas.'],
      aderencia: [9, 'I', '', 'Encaixe direto: sob medida, automação, IA, dashboards.'],
    },
  },
  {
    id: 'novos', nome: 'Novos negócios', icone: 'rocket',
    resumo: 'Fluxo contínuo de fundadores querendo MVP; porém capital limitado e recorrência incerta.',
    fatos: [
      ['4,95 milhões de pequenos negócios abertos em 2025 (+25,7% sobre 2021), 76,9% deles MEI.', 'S01'],
      ['ABStartups 2025: 3.650 startups mapeadas em 424 cidades; 82,2% atendem empresas (B2B/B2B2C); faturamento médio de R$ 736 mil; 88,2% têm até 20 colaboradores; Edtech, Healthtech e Tech lideram.', 'S18'],
      ['SaaS é o modelo mais comum entre as startups (39,2%).', 'S18'],
    ],
    problemas: [
      ['Gerar e escalar startups são os maiores desafios do ecossistema.', 'F', 'S18'],
      ['Fundadores sem equipe técnica precisam validar rápido com baixo capital.', 'I', ''],
    ],
    necessidades: [
      ['MVP enxuto e plataforma que escale sem reescrita.', 'I'],
      ['Integração com pagamentos, CRM e dados desde o início.', 'I'],
    ],
    concorrentes: [
      ['Software houses, freelancers e ferramentas no-code', 'Desenvolvimento de MVP', 'Concorrência não mapeada nesta rodada — LACUNA', '—', 'Desconhecido'],
    ],
    oportunidades: ['Pacotes de MVP com escopo fechado e evolução mensal. (inferência)'],
    riscos: ['Faturamento médio das startups é baixo (R$ 736 mil).', 'Risco de projeto sem continuidade se o negócio não vingar.'],
    notas: {
      tamanho: [6, 'F', 'S01,S18', '4,95 mi de aberturas, porém 76,9% MEI; 3.650 startups mapeadas.'],
      dor: [7, 'I', 'S18', 'Escalar é o principal desafio do ecossistema; dor específica de desenvolvimento não medida.'],
      digitalizacao: [7, 'I', '', 'Nascem digitais, mas precisam construir o produto.'],
      concorrencia: [6, 'I', '', 'Software houses/no-code não mapeados; nota provisória.'],
      pagar: [4, 'F', 'S18', 'Faturamento médio R$ 736 mil e 88% com até 20 colaboradores.'],
      aquisicao: [7, 'I', '', 'Fundadores buscam ativamente fornecedores e comunidades.'],
      recorrencia: [5, 'I', '', 'Depende da sobrevivência do negócio; evolução contínua possível.'],
      aderencia: [8, 'I', '', 'MVP e plataformas são o núcleo do que a Vemax descreve.'],
    },
  },
];

const cenarios = [
  { id: 'padrao', nome: 'Padrão (pesos do portal)', pesos: null },
  { id: 'iguais', nome: 'Pesos iguais', pesos: { tamanho: 1, dor: 1, digitalizacao: 1, concorrencia: 1, pagar: 1, aquisicao: 1, recorrencia: 1, aderencia: 1 } },
  { id: 'receita', nome: 'Foco em receita', pesos: { tamanho: 1.5, dor: 1, digitalizacao: 0.5, concorrencia: 1, pagar: 2, aquisicao: 1, recorrencia: 2, aderencia: 1 } },
  { id: 'entrada', nome: 'Foco em entrada fácil', pesos: { tamanho: 0.5, dor: 1.5, digitalizacao: 1.5, concorrencia: 2, pagar: 1, aquisicao: 2, recorrencia: 0.5, aderencia: 1.5 } },
];

const lacunas = [
  'Universo de clínicas e consultórios (CNES/DATASUS): consulta pública não retornou o total nacional; não estimado.',
  'Quantidade de empresas com 10+ ocupados e adoção de ERP por porte: dados do Cetic.br não foram extraídos com segurança; apenas CRM e IA.',
  'Concorrência de software houses/consultorias para os nichos "Empresas" e "Novos negócios": não mapeada.',
  'Preços praticados e ticket médio por nicho: nenhuma fonte pública confiável encontrada; "disposição a pagar" é inferência.',
  'Requisitos regulatórios de saúde (LGPD, CFM, TISS) e de condomínios: não pesquisados nesta rodada.',
  'Entrevistas com donos de negócio: não realizadas (a pesquisa é só de fontes públicas).',
  'Números de clientes de fornecedores (Trinks, Avec, Amplimed, Superlógica) são alegações das próprias empresas.',
  'Arquivo Power BI (.pbix): não gerado (a ferramenta não está disponível no ambiente). Entregue modelo de dados em CSV e guia de montagem.',
];

module.exports = { fontes, criterios, nichos, cenarios, lacunas, ACESSO };
