# Qué puede hacer el agente

El agente solo puede hacer lo que tú puedes hacer en un proyecto, y solo lo que le permitiste, tanto con un token como con una aplicación conectada.

## Tu rol y las acciones permitidas {#permissions}

Un token o una aplicación conectada nunca añade un permiso: si eres traductor (rol Editor) en un proyecto, **Configuración del proyecto** y **Miembros** no hacen nada ahí.

Un token sin acciones permitidas aún puede leer traducciones, actividad y miembros en los proyectos que cubre su alcance. Los propietarios del proyecto también pueden previsualizar una sincronización o una reversión y leer el archivo de workflow sin ninguna. Solo listar tus repositorios de GitHub y sus ramas para un proyecto nuevo, y leer archivos del repositorio, necesitan una acción permitida.

### Acciones permitidas y roles {#allowed-actions}

| Acción permitida | Qué puede hacer el agente | Quién puede usarla |
| --- | --- | --- |
| **Traducir y publicar** | Guardar traducciones y publicarlas como un pull request. | Propietarios y Editores |
| **Configuración del proyecto** | Añadir fuentes y rotar el token de push (ambas requieren también acceso de escritura al repositorio), detectar formatos en el repositorio conectado, sincronizar desde el repositorio, revertir al último valor publicado, cambiar el nombre, la rama base o el idioma base, archivar o restaurar. | Propietarios |
| **Miembros** | Invitar a personas, cancelar invitaciones, cambiar roles, quitar miembros. | Propietarios |
| **Crear proyectos** | Listar tus repositorios y ramas de GitHub, detectar formatos y crear proyectos (crear también requiere acceso de escritura al repositorio). | Cualquier persona con sesión iniciada, hasta el [límite de proyectos](../reference/limits.md#limits) |

**Todos mis proyectos** cubre todos los proyectos de los que eres miembro, incluidos aquellos a los que te unas más adelante. **Proyectos elegidos** cubre solo los proyectos que elijas. Un proyecto que el agente crea con **Proyectos elegidos** se añade a ese token o conexión, y a ningún otro.

Los cambios en tu rol o tu pertenencia se aplican desde la siguiente solicitud del agente. Los proyectos archivados no se pueden cambiar, ni siquiera con la acción permitida adecuada, salvo para restaurarlos con **Configuración del proyecto**; el agente aún puede leer su actividad.

### Herramientas por tarea {#tools}

| Tarea | Herramientas |
| --- | --- |
| Averiguar quién y qué | `whoami`, `list_projects`, `get_project`, `list_members`, `list_events` |
| Configurar un proyecto | `list_repositories`, `list_branches`, `detect_formats`, `create_project`, `add_sources`, `get_workflow`, `rotate_push_token` |
| Traducir | `list_keys`, `get_key`, `set_translations` |
| Publicar | `preview_publish`, `publish` |
| Deshacer y resincronizar | `preview_revert`, `revert_to_last_sent`, `preview_sync`, `sync_repository` |
| Gestionar el proyecto | `update_project`, `set_base_locale`, `archive_project`, `unarchive_project` |
| Gestionar miembros | `invite_members`, `revoke_invitation`, `change_member` |

Las herramientas que pueden descartar trabajo o cortar el acceso, como `sync_repository`, `revert_to_last_sent`, `rotate_push_token`, `archive_project`, `revoke_invitation` y `change_member`, están marcadas como destructivas, así que la mayoría de los agentes te preguntan antes de ejecutarlas. Publicar, sincronizar y revertir empiezan cada uno con una vista previa; si algo cambió después de la vista previa, no ocurre nada y se le pide al agente que vuelva a previsualizar. `set_translations` guarda hasta 100 claves por llamada; una clave que no se puede guardar se informa y el resto se guarda. Mientras se ejecuta la **Sincronizar** de un propietario del proyecto o la actualización nocturna, `set_translations` y `revert_to_last_sent` no cambian nada e indican al agente cuándo puede intentarlo de nuevo.
