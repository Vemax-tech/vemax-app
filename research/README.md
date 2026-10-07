# Pesquisa de mercado — nichos empresariais

Entregáveis em `output/`:

- `relatorio-mercado-nichos.pdf` — relatório com gráficos (22 páginas; também em `.html`)
- `planilha-mercado-nichos.xlsx` — dashboard + matriz com pesos editáveis (as pontuações recalculam), evidências, fatos, concorrentes, fontes e lacunas
- `powerbi/` — modelo de dados em CSV, relações e medidas DAX (`LEIA-ME.md`). O arquivo `.pbix` não foi gerado.

Toda a pesquisa vive em `scripts/data.js` (fatos, notas, justificativas e fontes). Para regenerar tudo depois de editar:

```
cd research/scripts
npm install
node build.js
```

Requer Microsoft Edge ou Chrome instalado (usado para gerar o PDF e as imagens dos gráficos).

Convenção: **Fato** = ancorado em fonte com código `Sxx`; **Inferência** = análise nossa, sempre rotulada.
