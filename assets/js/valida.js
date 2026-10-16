/* Vemax — validação do formulário público (script clássico, sem módulos).
   Espelha shared/js/validacao.js e as regras do banco (migration 014); o teste tests/site.test.js garante que continuem iguais.
   É só conveniência: quem barra dado inválido de verdade é o banco. */
(function () {
  'use strict';
  var digitos = function (s) { return String(s == null ? '' : s).replace(/\D/g, ''); };
  var emailOk = function (s) { s = String(s == null ? '' : s); return s === '' || (s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)); };
  var telefoneOk = function (s) { s = String(s == null ? '' : s); return s === '' || (/^[0-9+()\s.-]{8,40}$/.test(s) && digitos(s).length >= 8 && digitos(s).length <= 15); };
  window.VEMAX_VALIDA = {
    contatoValido: function (s) { s = String(s == null ? '' : s).trim(); return s !== '' && (emailOk(s) || telefoneOk(s)); },
  };
})();
