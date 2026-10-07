# Pacote Power BI

Não foi possível gerar um arquivo .pbix neste ambiente (o Power BI Desktop não está disponível). Esta pasta contém o **modelo de dados pronto** para importar.

## Montagem (10 minutos)
1. Power BI Desktop → **Obter dados → Texto/CSV**. Importe todos os .csv desta pasta (delimitador ponto e vírgula, UTF-8).
2. **Modelo** → crie relações (um-para-muitos, filtro único):
   - dim_nichos[nicho_id] → fact_notas[nicho_id], fact_cenarios[nicho_id], fact_fatos[nicho_id], fact_concorrentes[nicho_id]
   - dim_criterios[criterio_id] → fact_notas[criterio_id], dim_cenarios_pesos[criterio_id]
   - dim_fontes[fonte_id] → fact_fatos[fonte_id], fact_concorrentes[fonte_id], fact_macro[fonte_id]
3. Medidas DAX:

```
Pontuação padrão =
DIVIDE(
  SUMX(fact_notas, fact_notas[nota] * RELATED(dim_criterios[peso_padrao])),
  SUMX(fact_notas, RELATED(dim_criterios[peso_padrao]))
)

% notas com fato =
DIVIDE(CALCULATE(COUNTROWS(fact_notas), fact_notas[base] = "Fato"), COUNTROWS(fact_notas))
```
4. Visuais sugeridos: barras (nicho × Pontuação padrão), radar (critério × nota, filtro por nicho), matriz (nicho × critério com formatação condicional na nota), tabela de cenários (fact_cenarios) e cartões de fact_macro.
