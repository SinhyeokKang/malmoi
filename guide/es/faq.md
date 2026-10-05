# Preguntas frecuentes

Respuestas breves a preguntas habituales sobre Malmoi, con un enlace a la página que explica cada una en detalle.

## ¿Qué hace Malmoi? {#what-is-malmoi}

Malmoi encuentra los archivos de traducción que ya están en tu repositorio de GitHub, permite que tu equipo edite las traducciones en el navegador y devuelve los cambios guardados como un pull request. La organización de archivos de tu repositorio no cambia. Consulta [Cómo funciona la sincronización](sync/README.md#how-it-works).

## ¿Los traductores necesitan Git o una cuenta de GitHub? {#translators}

No. Los traductores inician sesión con GitHub o Google, editan en el navegador y eligen **Publicar**; nunca usan Git. Consulta [Únete a un proyecto](translate/join.md#join).

## ¿Qué roles hay? {#roles}

Hay dos: **Propietario** y **Editor**. Los editores editan y publican traducciones; los propietarios también gestionan la conexión con el repositorio, las fuentes, los miembros y la sincronización. Consulta [Invita a traductores](setup/members.md#roles).

## ¿Qué formatos de archivo son compatibles? {#formats}

Catálogos JSON y YAML, mensajes de extensiones de Chrome y diccionarios de código TypeScript o JavaScript, con un archivo por idioma o con todos los idiomas en un archivo. Consulta [Formatos de archivo compatibles](reference/formats.md#formats).

## ¿Malmoi reescribe mis archivos? {#file-structure}

Malmoi aporta los valores, y el archivo existente conserva su forma: los catálogos YAML y los diccionarios de código conservan sus comentarios, líneas en blanco y orden de claves, y los archivos JSON conservan su sangría y sus escapes. Consulta [Conserva la estructura del archivo](reference/formats.md#file-structure).

## ¿Cómo vuelven las traducciones a mi repositorio? {#pull-request}

**Publicar** reúne los cambios guardados en un pull request para que tu equipo de desarrollo lo revise y lo fusione. Mientras ese pull request está abierto, la siguiente publicación lo actualiza en lugar de abrir otro. Consulta [Publica tus cambios](translate/publish.md#publish).

## ¿Qué pasa si el código cambia mientras se traduce? {#code-changes}

Malmoi nunca combina las dos partes. Mientras haya ediciones sin enviar o un pull request de Malmoi abierto, se retiene toda la actualización del repositorio y Registros muestra **Retenido**; cuando las ediciones se publican y el pull request se fusiona o se cierra, la siguiente actualización se aplica. Consulta [Cuando cambia el código](sync/push.md#deferred).

## ¿Qué pasa con las traducciones cuando se elimina una clave del código? {#removed-keys}

Se conservan. Si la clave vuelve en un commit posterior, sus traducciones vuelven con ella. Consulta [Conserva las claves eliminadas](sync/push.md#removed-keys).

## ¿Tengo que añadir el workflow? {#workflow}

No. Sin él, la ejecución nocturna recoge los cambios del repositorio una vez al día. Con él, los cambios llegan en cada commit. Consulta [Sincronización nocturna o workflow](sync/nightly.md#workflow).

## ¿Malmoi traduce el texto por mí? {#machine-translation}

No. Malmoi no tiene traducción automática ni memoria de traducción. Puedes conectar tu propio agente de IA; lo que escribe se guarda como tu edición, con las mismas comprobaciones que en el navegador. Consulta [Conecta un agente de IA](ai-agents/README.md).

## ¿Hay un paso de aprobación? {#review}

No. **Por revisar** solo marca las traducciones cuyo texto de origen cambió, y guardar lo quita. Consulta [Edita traducciones](translate/edit.md#save).

## ¿Cuántos proyectos y miembros puedo tener? {#limits}

Puedes ser propietario de hasta 3 proyectos activos, y no se pueden enviar invitaciones nuevas cuando un proyecto llega a 10 miembros. Archivar un proyecto libera un lugar. Consulta [Límites](reference/limits.md#limits).

## ¿Puedo cambiar el idioma, la zona horaria o el tema de Malmoi? {#preferences}

Sí, en **Preferencias**. Estos cambios solo afectan a cómo ves Malmoi, no a los idiomas a los que traducen tus proyectos. Consulta [Preferencias](account/preferences.md#preferences).

## ¿Qué guarda Malmoi sobre mí? {#privacy}

Tu nombre, tu dirección de correo y tu foto de perfil de GitHub o Google, tus membresías de proyecto y quién cambió por última vez cada traducción. Los nombres, las direcciones de correo y los tokens de conexión se guardan cifrados, y Malmoi no vende tus datos ni los usa para publicidad. La **Política de privacidad** del pie de página lo detalla todo.

## ¿Cómo elimino mi cuenta? {#delete-account}

No hay un botón para eliminarla. Escribe a la dirección que aparece en la **Política de privacidad**; las solicitudes se responden en un plazo de 30 días. Las traducciones se quedan en el proyecto, pero dejan de estar vinculadas a ti.
