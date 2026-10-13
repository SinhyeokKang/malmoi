# Gestiona el token y la conexión de GitLab

Reemplaza tu token de acceso personal de GitLab o desconéctalo desde Cuenta.

Antes de empezar: abre el menú de tu avatar, arriba a la derecha, y elige **Cuenta**.

## Gestiona el token de GitLab {#gitlab-token}

Los propietarios de proyectos que usan repositorios de GitLab.com conectan un token de acceso personal de GitLab en la sección **GitLab PAT**. Los traductores pueden omitir esta sección.

1. Si no hay ningún token conectado, elige **Crear un token en GitLab**, crea allí un token de acceso personal clásico con el alcance `api`, pégalo en **Token de acceso personal** y elige **Conectar**.
2. Revisa la insignia: **Conectado**, **Caduca pronto** cuando el token caduca en 14 días o menos, o **Caducado**. La sección también muestra la fecha de caducidad y cuántos proyectos usan esta conexión. En los 14 días anteriores a la caducidad, un aviso en la parte superior de la sección indica cuántos días quedan.
3. Para renovar el token, elige **Reemplazar token** y pega un token nuevo de la misma cuenta de GitLab. Los proyectos que usan esta conexión pasan a usarlo al instante. Un token de otra cuenta de GitLab se rechaza; para cambiar de cuenta, desconecta primero.

Al elegir **Desconectar**, Malmoi borra el token guardado. Los proyectos que lo usaban muestran **Desconectado** y dejan de sincronizar y publicar hasta que un propietario del proyecto los vuelva a conectar en **Configuración** del proyecto, y **Registros** anota que se quitó la conexión. Desconectar en Malmoi no revoca el token en GitLab; revócalo allí si ya no lo necesitas.

Los proyectos que conectas publican con tu token, así que sus commits y merge requests en GitLab quedan a nombre de tu cuenta de GitLab.

![Cuenta desplazada hasta las secciones GitHub App y GitLab PAT, cada una con su cuenta conectada y sus botones, sobre Sesiones](/guide/account-connections.webp "Gestiona el acceso a repositorios en las secciones GitHub App y GitLab PAT.")

## Qué pasa después {#next}

Vuelve a tu proyecto. Si el acceso sigue fallando, consulta [Soluciona problemas de GitLab](troubleshooting.md).
