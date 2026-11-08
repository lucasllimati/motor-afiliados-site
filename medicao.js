// Medição anônima e sem cookies (Umami), só de eventos: busca (tipo e quantidade, nunca o texto),
// filtro, categoria, coleção, ordem, detalhe, oferta, vídeo, favorito e compartilhar.
// Desligada enquanto UMAMI_SITE estiver vazio. Para ligar: pôr o id do site abaixo, liberar o
// endereço de ENVIO no connect-src do Content-Security-Policy do index.html e atualizar a
// política de privacidade (ADR-013 do motor).
"use strict";

(function () {
  var UMAMI_SITE = "";
  var ENVIO = "https://cloud.umami.is/api/send";

  function enviar(nome, dados) {
    if (!UMAMI_SITE || navigator.doNotTrack === "1") return;
    var payload = {
      website: UMAMI_SITE,
      hostname: location.hostname,
      language: navigator.language,
      screen: screen.width + "x" + screen.height,
      title: document.title,
      url: location.pathname,
    };
    if (nome) {
      payload.name = nome;
      payload.data = dados || {};
    }
    try {
      fetch(ENVIO, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", payload: payload }),
      }).catch(function () {});
    } catch (e) {
      // Medir nunca pode atrapalhar a página.
    }
  }

  window.medir = function (nome, dados) {
    enviar(nome, dados);
  };
  enviar(); // a visita
})();
