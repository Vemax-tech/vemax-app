// Inicializa a página do VemaxCALL. Cada página declara o módulo e a função em data-atributos:
//   <script type="module" src="../js/boot.js" data-modulo="solicitacoes" data-fn="init"></script>
// Mesmo padrão do portal (app/js/boot.js): evita script embutido, então a CSP não precisa de
// 'unsafe-inline' para scripts, e só aceita nomes simples, sem barras, para não carregar código de outro lugar.
const tag = document.querySelector('script[data-modulo]');
const modulo = tag?.dataset.modulo || '', fn = tag?.dataset.fn || '';
if (/^[a-z]+$/.test(modulo) && /^(init|initFicha)$/.test(fn)) {
  import(`./modules/${modulo}.js`).then((m) => m[fn]()).catch((e) => {
    console.error(e);
    document.getElementById('app')?.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Não foi possível carregar esta página. Recarregue; se continuar, avise o administrador.', style: 'padding:24px' }));
  });
}
