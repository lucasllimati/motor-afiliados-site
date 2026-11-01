// Retorno do login do TikTok: mostra o "code" para colar em scripts/tiktok_autorizar.py.
// Nada é enviado a lugar nenhum: a página só lê a URL, mostra e apaga o code da barra de endereço.
"use strict";

(function () {
  var p = new URLSearchParams(location.search);
  var titulo = document.getElementById("titulo");
  var status = document.getElementById("status");
  var codigo = document.getElementById("codigo");
  var copiar = document.getElementById("copiar");
  var code = p.get("code");
  var erro = p.get("error");

  // Tira o code da barra de endereço e do histórico do navegador.
  history.replaceState(null, "", location.pathname);

  if (erro) {
    titulo.textContent = "A autorização não foi concluída";
    status.classList.add("erro");
    status.textContent = "O TikTok respondeu: " + erro +
      (p.get("error_description") ? " (" + p.get("error_description") + ")" : "") +
      ". Rode o script de autorização de novo.";
    return;
  }
  if (!code) {
    titulo.textContent = "Nenhum código recebido";
    status.textContent = "Esta página recebe o retorno do login do TikTok. Abra o link gerado pelo script de autorização para começar.";
    return;
  }

  titulo.textContent = "Autorizado. Falta um passo.";
  status.textContent = "Copie o código abaixo e cole no script de autorização." +
    (p.get("state") ? " Confira se o state é " + p.get("state") + "." : "");
  codigo.textContent = code;
  codigo.hidden = false;

  if (navigator.clipboard) {
    copiar.hidden = false;
    copiar.addEventListener("click", function () {
      navigator.clipboard.writeText(code).then(function () {
        copiar.textContent = "Código copiado";
      }, function () {
        copiar.textContent = "Não deu para copiar: selecione o código";
      });
    });
  }
})();
