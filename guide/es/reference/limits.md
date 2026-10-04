# Límites

Consulta los límites fijos de proyectos, miembros, invitaciones y archivos de traducción.

## Límites de proyectos y miembros {#limits}

Puedes ser propietario de hasta 3 proyectos activos. Las invitaciones nuevas y los reenvíos se bloquean cuando un proyecto tiene 10 miembros. La dirección de un proyecto (el nombre que aparece en su URL) puede tener hasta 40 caracteres. Archivar un proyecto libera un hueco de proyecto. El mismo límite se aplica cuando restauras un proyecto archivado, cuando se te cambia a **Propietario** y cuando aceptas una invitación como **Propietario**: Malmoi bloquea el cambio si llevara a alguien por encima de 3 proyectos activos de los que es propietario, y al restaurar se comprueba a cada **Propietario** del proyecto. Una invitación bloqueada no se consume, así que puedes archivar proyectos hasta que seas propietario de menos de 3 activos y abrir el mismo enlace de nuevo. Si ya eres propietario de 3 o más proyectos activos, se quedan como están y siempre puedes archivar uno, pero ninguno de estos cambios se completa hasta que seas propietario de menos de 3. Las invitaciones pendientes no cuentan para la comprobación de miembros. Las invitaciones emitidas anteriormente aún se pueden aceptar, así que el número de miembros puede superar ese umbral.

## Límites de invitaciones {#invitations}

Un proyecto puede enviar hasta 20 invitaciones en una hora, y una persona puede enviar hasta 30 en una hora entre todos sus proyectos, con no más de 20 direcciones en una misma solicitud de invitación. La misma dirección tiene un tiempo de espera de 60 segundos; todos estos límites se aplican a la invitación inicial y a **Reenviar**. Si alguna dirección superara un límite, no se envía ninguna invitación.

## Límites de archivos y traducciones {#files}

Cada fuente debe caber en 200 archivos, 2 MB por archivo y 10 MB en total cuando Malmoi la lee desde el repositorio. Cuando se añaden varias fuentes a la vez, sus archivos combinados deben caber en el mismo presupuesto. La ejecución nocturna lee el repositorio con el mismo presupuesto; un cambio mayor se retiene hasta que reduzcas los archivos o lo entregues con el workflow. Cada paso de fuente de un workflow puede enviar hasta 20.000 claves, 200 idiomas, 10.000 caracteres por valor y 200.000 valores de traducción en total. Estos límites se aplican a la vez; una fuente no puede enviar 20.000 claves en los 200 idiomas a la vez. Un nombre de clave puede tener hasta 1.000 caracteres. Una foto de perfil debe ser PNG o JPEG y no superar los 3 MB. Un nombre de proyecto puede tener hasta 200 caracteres.
