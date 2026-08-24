// ═══════════════════════════════════════════════════════════════════════════
// Service Worker del Sistema Operativo 8010 / Kubik
// Sol. Santiago Arias · 19-ago-2026
//
// Unica funcion: recibir el aviso de que se genero un informe y mostrarlo como
// notificacion del celular, aunque el Sistema Operativo este cerrado.
// No cachea nada ni intercepta peticiones: no cambia como carga el sistema.
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('install',  e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function(event){
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch(e){ d = { titulo:'Sistema Operativo', cuerpo:(event.data?event.data.text():'') }; }
  var titulo = d.titulo || 'Sistema Operativo';
  var opts = {
    body: d.cuerpo || '',
    tag: d.tag || 'so-informe',
    data: { url: d.url || '/' },
    requireInteraction: false,
    badge: undefined,
    icon: undefined
  };
  event.waitUntil(self.registration.showNotification(titulo, opts));
});

// Al tocar la notificacion se abre el Sistema Operativo; si ya esta abierto, lo trae al frente.
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var destino = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(lista){
      for (var i=0; i<lista.length; i++){
        if (lista[i].url.indexOf(self.registration.scope) === 0 && 'focus' in lista[i]) return lista[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
