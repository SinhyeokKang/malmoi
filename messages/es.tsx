import type { ReactNode } from "react";

import type { Messages } from "@/lib/i18n";

/**
 * **es 사전** — `messages/en.tsx`와 키·함수 시그니처·JSX 구조가 같고 문장만 다르다. 문맥 주석은 en에만 둔다(사본은 낡는다).
 *
 * ⚠️ **영어 고정 네임스페이스(`mcp`·`seo`·`crash`·`publicDocs.privacy`)는 여기 없다** — ui-locales orch D2.
 * 문체: tú · 라벨은 동사 원형 · sentence case · "por favor"·"lo sentimos" 금지(DESIGN §10). 원어민 검수 없이 나간다(design §6).
 */
const UNAVAILABLE = "No disponible";
const NIGHTLY_RETRY = "La próxima ejecución nocturna lo volverá a intentar.";

export const es = {
  search: {
    label: "Buscar",
    placeholder: "Buscar…",
    groups: { projects: "Proyectos", pages: "Páginas", keys: "Claves", docs: "Documentación" },
    goToDocs: "Ir a la documentación",
    loadingKeys: "Cargando claves…",
    loadingDocs: "Cargando documentación…",
    projectsUnavailable: "Ahora mismo no se pueden buscar proyectos. Vuelve a abrir la búsqueda para intentarlo de nuevo.",
    sessionEnded: "Tu sesión terminó. Vuelve a iniciar sesión para buscar en tus proyectos.",
    keysUnavailable: "Ahora mismo no se pueden buscar claves. Modifica la búsqueda para intentarlo de nuevo.",
    docsUnavailable: "Ahora mismo no se puede buscar en la documentación. Vuelve a abrir la búsqueda para intentarlo de nuevo.",
    noResults: (q: string): string => `Sin resultados para “${q}”`,
    noResultsDescription: "Prueba con otra búsqueda.",
    goTo: "Ir a",
    results: (count: number): string => `${count.toLocaleString("es")} ${count === 1 ? "resultado" : "resultados"}`,
  },
  repositorySync: {
    action: "Sincronizar",
    paused: "La sincronización no está disponible en este momento.",
    waitPublish: "Espera a que termine la publicación.",
    running: "Ya hay una sincronización en curso.",
    resultTitle: {
      complete: "Sincronización completada",
      issues: "Sincronización completada con problemas",
      nothingReplaced: "No se reemplazó nada",
      didntRun: "La sincronización no se ejecutó",
      failed: "Sincronización fallida",
      unknown: "Resultado de la sincronización desconocido",
    },
    resultHeadline: {
      "unavailable": "Vuelve a intentarlo en un momento — Registros muestra lo que se haya registrado",
      "ingest-failed": "Vuelve a intentarlo en un momento — Registros muestra lo que se haya registrado",
      "unauthorized": "Tu sesión terminó — inicia sesión y vuelve a sincronizar",
      "unconfirmed": "No llegó la respuesta — revisa Registros antes de volver a sincronizar",
    },
    confirm: "Sincronizar desde el repositorio",
    confirmDiscard: "Descartar cambios y sincronizar",
    resultInLogs: "El resultado aparecerá en Registros.",
    title: (name: string): string => `¿Sincronizar ${name} desde el repositorio?`,
    body: (branch: ReactNode): ReactNode => (
      <>Malmoi leerá los archivos de traducción de {branch} y reemplazará con ellos lo que hay en la app.</>
    ),
    unsentCount: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "edición sin enviar" : "ediciones sin enviar"}`,
    unsent: (n: number, edits: ReactNode): ReactNode => (
      <>Sincronizar descartará {edits} y {n === 1 ? "la reemplazará" : "las reemplazará"} con los valores del repositorio.</>
    ),
    openPr: (n: number, branch: string): string =>
      `Las ediciones de la pull request #${n} aún no están en ${branch} — también se reemplazarán.`,
    prChecking: "Comprobando si queda algo pendiente en una pull request…",
    prUnknown: "No se pudo comprobar si queda algo pendiente en una pull request.",
    sendFirst: "Publicar primero",
    sendHint: (n: number, link: ReactNode): ReactNode => <>Para {n === 1 ? "conservarla" : "conservarlas"}, usa {link}: abre la pantalla de traducción.</>,
    nothingUnsent: "No hay nada que enviar — todas las ediciones ya se enviaron.",
    seeOpen: "Ver qué está abierto",
    completed: (n: number, branch: string): string => `${n.toLocaleString("es")} ${n === 1 ? "clave sincronizada" : "claves sincronizadas"} desde ${branch}`,
    syncedKeys: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "clave sincronizada" : "claves sincronizadas"}`,
    unreadable: (n: number): string => `No pudimos leer ${n} ${n === 1 ? "fuente" : "fuentes"}`,
    notReplaced: (n: number): string => `${n} ${n === 1 ? "fuente no se reemplazó" : "fuentes no se reemplazaron"}`,
    withIssue: (base: string, issue: string): string => `${base}, pero ${issue}`,
    partial: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "elemento quedó" : "elementos quedaron"} sin sincronizar. Revisa los detalles abajo.`,
    kept: (n: number): string => `Se ${n === 1 ? "conservó" : "conservaron"} ${n.toLocaleString("es")} ${n === 1 ? "edición sin enviar" : "ediciones sin enviar"}. Las actualizaciones del repositorio se retienen hasta que ${n === 1 ? "se envíe" : "se envíen"}.`,
    cause: (surface: ReactNode, reason: string): ReactNode => <>{surface} — {reason}</>,
    failedTitle: "La última sincronización no pudo terminar",
    supersededTitle: "Reemplazado",
    openSettings: "Abrir Configuración",
    openAccount: "Abrir Cuenta",
    signIn: "Iniciar sesión",
    reconnect: "Volver a conectar",
    errors: {
      "invalid-format": "Esta fuente no tiene un formato de archivo válido.",
      "superseded": "Llegaron datos nuevos del repositorio durante la sincronización. Esta fuente no se reemplazó. Vuelve a intentarlo si hace falta.",
      "lease-lost": "Esta sincronización se detuvo antes de reemplazar esta fuente. Actualiza la página para ver el estado actual antes de volver a intentarlo.",
      "not-ready": "Este proyecto aún no ha terminado su primera sincronización",
      "not-connected": "Tu cuenta de GitHub no está conectada a Malmoi — conéctala en Cuenta para sincronizar",
      unpinned: "Este repositorio está desconectado",
      "already-running": "Ya hay una sincronización en curso",
      "reconfirm": "No se pudo confirmar que lo que revisaste sigue vigente — no se descartó nada. Abre Sincronizar de nuevo para revisar y confirmar",
      "no-surfaces": "No hay nada que sincronizar — este proyecto no tiene fuentes activas",
      "invalid input": "No se pudo identificar el proyecto. Actualiza la página y vuelve a intentarlo.",
      "ingest-failed": "La sincronización no se pudo hacer",
      "unauthorized": "Tu sesión terminó — no se sincronizó nada. Inicia sesión y vuelve a sincronizar",
      "unavailable": "La sincronización no se pudo hacer",
      "unconfirmed": "No se pudo confirmar si la sincronización terminó",
      "repo-replaced": "Esta conexión apunta a otro repositorio",
    },
    baseBranchMissing: {
      owner: (branch: string): string => `La rama base ${branch} ya no está en el repositorio — elige otra rama base en Configuración`,
      editor: (branch: string): string => `La rama base ${branch} ya no está en el repositorio — pide a un propietario del proyecto que elija otra rama base`,
    },
  },
  notFound: {
    title: "Página no encontrada",
    description: "Es posible que esta página se haya movido o que ya no esté disponible.",
    action: "Ir a tus proyectos",
  },
  surfaces: {
    sourceCounts: (keys: number, locales: number): string => `${keys.toLocaleString("es")} ${keys === 1 ? "clave" : "claves"} · ${locales.toLocaleString("es")} ${locales === 1 ? "idioma" : "idiomas"}`,
    label: "Fuente", baseLocale: "Idioma base", confirm: "Comprobar archivos", cancel: "Cancelar", conflict: "Estos archivos ya pertenecen a otra fuente:",
    failed: "No se pudo añadir esta fuente. Tus traducciones actuales no cambiaron. Vuelve a intentarlo.",
    missingTitle: "Fuente no disponible",
    missingDescription: "Es posible que esta página se haya movido o que la fuente ya no esté activa. Abre tus proyectos para continuar.",
    projects: "Ir a tus proyectos",
  },
  common: {
    retry: "Intentar de nuevo",
    appName: "Malmoi",
    cancel: "Cancelar",
    close: "Cerrar",
    dismiss: "Descartar",
    slow: "Seguimos trabajando. Los repositorios grandes pueden tardar un minuto o más.",
    resizeSidebar: "Cambiar el tamaño de la barra lateral",
    keys: { enter: "↵", esc: "Esc", search: { mac: "⌘K", other: "Ctrl K" } },
    nav: {
      projects: "Proyectos",
      account: "Cuenta",
      mcp: "Conector MCP",
      preferences: "Preferencias",
      home: "Inicio",
      sources: "Fuentes",
      translations: "Traducciones",
      members: "Miembros",
      logs: "Registros",
      projectSettings: "Configuración",
      signOut: "Cerrar sesión",
      newProject: "Nuevo proyecto",
      userMenu: "Menú de la cuenta",
      collapseSidebar: "Contraer la barra lateral",
      expandSidebar: "Expandir la barra lateral",
      projectSwitcher: {
        label: "Cambiar de proyecto",
        search: { label: "Buscar proyectos", placeholder: "Buscar proyectos…" },
        empty: (q: string): string => `Ningún proyecto coincide con “${q}”`,
      },
      appHome: "Inicio de Malmoi",
    },
    copy: "Copiar",
    clearSearch: "Borrar la búsqueda",
    copied: "Copiado",
    copyFailed: "No se pudo copiar — selecciónalo tú",
    unreadable: UNAVAILABLE,
  },
  signIn: {
    title: "Inicia sesión en Malmoi",
    backToInvitation: "Volver a la invitación",
    backToAuthorization: "Volver a la autorización de la app",
    github: "Continuar con GitHub",
    google: "Continuar con Google",
    consent: { before: "Al hacer clic en Continuar con un servicio externo, aceptas la ", link: "Política de privacidad", after: " de Malmoi." },
    footer: { copyright: "© 2026 Malmoi", github: "GitHub", privacy: "Política de privacidad" },
    hero: { top: "Reúne tus textos", bottom: "Traduce y publica en equipo" },
  },

  uiLocale: {
    label: "Idioma",
    failed: "No pudimos cambiar el idioma. Inténtalo de nuevo.",
  },

  preferences: {
    loading: "Cargando preferencias…",
    description: "El idioma de todas las pantallas de Malmoi.",
    help: "Los idiomas de tus proyectos no cambian.",
  },

  landing: {
    shell: {
      logo: "Inicio de Malmoi",
      nav: "Principal",
      docs: "Documentación",
      github: "GitHub",
      getStarted: "Empezar",
    },
    hero: {
      title: ["Reúne tus textos,", "traduce y publica en equipo"] as const,
      body: "Malmoi es una herramienta de localización para repositorios de GitHub: encuentra tus archivos de traducción, permite que tu equipo los edite en el navegador y devuelve todos los cambios en una sola pull request.",
      latest: (version: string) => (version === "" ? "Últimas novedades" : `Novedades de la v${version}`),
    },
    stage: {
      label: "Cómo funciona Malmoi",
      captions: [
        "Malmoi lee los archivos de traducción que ya están en tu repositorio.",
        "Completa los idiomas que le faltan a una clave.",
        "Cada edición guardada suma al contador de Publicar.",
        "Revisa cada cambio como un diff antes de enviarlo.",
        "Todo vuelve en una sola pull request.",
      ] as const,
    },
    closing: {
      title: "Empieza con los archivos que ya tienes",
      body: "Conecta un repositorio de GitHub con archivos de traducción JSON, YAML, JS/TS o de extensiones de Chrome, invita a tu equipo y envía la primera pull request.",
    },
    mockup: {
      project: "Acme web",
      repo: "acme/web",
      source: "web",
      namespace: "checkout",
      user: "Alex",
      teammate: "Sam",
      projectCount: 3,
      memberCount: 4,
      sources: [
        { slug: "emails", keyCount: 40, namespaces: [] },
        {
          slug: "web",
          keyCount: 248,
          namespaces: [
            { name: "cart", keyCount: 36 },
            { name: "checkout", keyCount: 52 },
            { name: "common", keyCount: 104 },
            { name: "product", keyCount: 56 },
          ],
        },
      ],
      selected: {
        key: "checkout.submit",
        text: "Place order",
        description: "Botón principal del paso de pago",
        values: [
          { code: "en", value: "Place order" },
          { code: "de", value: "Bestellung aufgeben" },
        ],
        typedCode: "fr",
        typed: "Passer la commande",
      },
      rows: [
        { key: "checkout.submit", text: "Place order", missing: 1 },
        { key: "checkout.coupon", text: "Add a coupon", missing: 2 },
        { key: "checkout.shipping", text: "Shipping address", missing: 1 },
        { key: "cart.title", text: "Your cart", missing: 0 },
        { key: "cart.empty", text: "Your cart is empty", missing: 0 },
        { key: "cart.remove", text: "Remove", missing: 0 },
        { key: "checkout.title", text: "Checkout", missing: 0 },
        { key: "checkout.total", text: "Order total", missing: 0 },
      ],
      keyCount: 288,
      unsentBefore: 0,
      unsentAfter: 1,
      file: (code: string): string => `messages/${code}.json`,
      diff: [
        { key: "checkout.submit", code: "fr", before: null, after: "Passer la commande" },
      ],
      pullRequest: 128,
    },
  },

  publicDocs: {
    effectiveDate: "Fecha de entrada en vigor",
    docs: {
      title: "Documentación",
      nav: "Documentación",
      toc: "En esta página",
      pages: "Páginas anterior y siguiente",
      previous: "Anterior",
      next: "Siguiente",
      code: "Código",
      forDevelopers: "Para desarrolladores",
      forTranslators: "Para traductores",
      more: "Más en la documentación",
      notFound: {
        eyebrow: "404",
        title: "Esta página no existe",
        body: (path: ReactNode, overview: ReactNode): ReactNode => <>No hay ninguna página en {path}. Elige una página de la lista o empieza por el {overview}.</>,
        overview: "resumen de la documentación",
      },
    },
  },

  changelog: {
    title: "Novedades",
    latest: "Última",
    description: "Qué cambió en cada versión de Malmoi, de la más reciente a la más antigua.",
    releases: "GitHub Releases",
    intro: (releases: ReactNode): ReactNode => (
      <>Qué cambió en cada versión de Malmoi, de la más reciente a la más antigua. Las fechas están en UTC. Las mismas notas se publican en {releases}.</>
    ),
    failed: (releases: ReactNode): ReactNode => <>No pudimos cargar las novedades desde GitHub en este momento. Léelas en {releases}.</>,
    empty: (releases: ReactNode): ReactNode => <>Todavía no se ha publicado ninguna versión. Las nuevas versiones aparecen aquí y en {releases}.</>,
    truncated: (releases: ReactNode): ReactNode => <>Las versiones anteriores están en {releases}.</>,
  },

  home: {
    loading: "Cargando proyecto…",
    cards: {
      unit: { keys: "claves", cells: "celdas" },
      synced: (when: string | null): string => (when === null ? "aún sin sincronizar" : `sincronizado ${when}`),
      acrossSurfaces: (n: number): string => (n === 1 ? "en este repositorio" : `en ${n} fuentes`),
      reviewByLocale: (parts: string): string => parts,
      localeCount: (code: string, n: number): string => `${n.toLocaleString("es")} ${code}`,
      allFilled: (n: number): string => `${n.toLocaleString("es")} claves, todas completas`,
      nothingPending: "nada para enviar",
      nothingToReview: "nada para revisar",
      lastGoodSync: (when: string | null): string => (when === null ? "aún sin sincronizar" : `sincronizado ${when}`),
      asOf: (when: string | null): string => (when === null ? "aún sin sincronizar" : `a fecha de ${when}`),
      asOfLastSync: "a fecha de la última sincronización",
      cannotSend: "no se puede enviar ahora",
      held: {
        "pending-edits": "actualizaciones del repositorio retenidas",
        "open-pr": "retenido hasta que se fusione o se cierre la pull request",
        "pr-check-failed": "retenido — no se pudo comprobar si hay una pull request abierta",
      },
      frozen: "congelado al archivar",
      neverSent: "nunca enviado",
    },

    attention: {
      title: "Requiere tu atención",
      count: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "elemento" : "elementos"}`,
      more: (n: number): string => `+${n} más`,
      importFailed: {
        title: (surface: string): string => `Fuente ${surface}`,
        body: "La última sincronización no pudo leer esta fuente",
        tail: " — no se sincronizó nada de ella.",
      },
      partial: {
        body: "Esta fuente se sincronizó en parte",
        tail: " — algunos archivos de traducción quedaron fuera.",
      },
      review: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "celda espera" : "celdas esperan"} revisión`,
        tail: (who: string): string => ` — editado por última vez en este idioma por ${who}.`,
      },
      neverFilled: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (locale: string): string => `${locale} no tiene traducciones aquí`,
        tail: (n: number): string => ` — ${n.toLocaleString("es")} ${n === 1 ? "clave" : "claves"} por traducir.`,
      },
      empty: {
        title: "Nada requiere tu atención",
        description: "Aquí aparecen elementos cuando falla una sincronización, hay celdas esperando revisión o un idioma se queda atrás.",
      },
      archived: {
        title: "No hay nada que hacer",
        description:
          "Los elementos de atención vuelven cuando se restaura el proyecto. Las cifras de arriba quedaron congeladas en el momento en que se archivó.",
      },
    },

    logs: {
      title: "Registros recientes",
      all: "Todos los registros",
      empty: {
        beforeFirstSync: "Aún no hay nada. La primera sincronización desde tu repositorio aparecerá aquí.",
      },
    },

    meta: {
      title: "Proyecto",
      tabs: { list: "Detalles del proyecto", project: "Proyecto", sync: "Sincronizar", publish: "Publicar" },
      repository: "Repositorio",
      connection: "Conexión",
      branch: "Rama",
      ci: "CI",
      sources: "Fuentes",
      keys: "Claves",
      members: "Miembros",
      created: "Creado",
      archived: "Archivado",
      lastSync: "Última sincronización",
      synced: "Sincronizado",
      result: "Resultado",
      changed: "Cambiados",
      keysSeen: "Claves vistas",
      hold: "Espera",
      lastPublish: "Última publicación",
      published: "Publicado",
      pullRequest: "Pull request",
      prState: "Estado de la PR",
      settings: "Configuración",
      syncLogs: "Registros de sincronización",
      publishLogs: "Registros de publicación",
      configured: "Configurado",
      notSetUp: "Sin configurar",
      memberCount: (members: number, pending: number): string => `${members.toLocaleString("es")} (${pending.toLocaleString("es")})`,
      values: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "valor" : "valores"}`,
      never: "Nunca",
      unrecorded: "Sin registro",
      notOpen: "No abierta",
      pr: (n: number): string => `#${n}`,
    },

    banner: {
      syncFailed: {
        title: "La última sincronización no pudo terminar",
        body: (surface: string, branch: string, reason: string): string =>
          `Malmoi no pudo leer ${surface} en ${branch}. ${reason}`,
        safe: (when: string | null): string =>
          when === null
            ? "No se perdió nada: las celdas que ves son de antes de esta sincronización."
            : `No se perdió nada: las celdas que ves son de la última sincronización correcta, ${when}.`,
        action: "Intentar de nuevo",
        editor: "Pide a un propietario del proyecto que vuelva a ejecutar la sincronización.",
      },
      partial: {
        title: "Sincronizado en parte",
        body: (surface: string, branch: string, reason: string): string => `${surface} en ${branch} se sincronizó en parte. ${reason}`,
      },
      notConnected: {
        title: "Malmoi no está conectado a este repositorio",
        body: "Conecta la GitHub App a este repositorio para sincronizar y publicar. Todo lo que ya está traducido está a salvo.",
        action: "Conectar",
        editor: "Pide a un propietario del proyecto que lo conecte.",
      },
      disconnected: {
        title: "Este repositorio está desconectado",
        body: "Malmoi perdió la conexión con este repositorio. Las sincronizaciones y publicaciones se detienen hasta que se vuelva a conectar; todo lo que ya está traducido está a salvo.",
        action: "Volver a conectar",
        editor: "Pide a un propietario del proyecto que lo vuelva a conectar.",
      },
      wrongRepository: {
        title: "Esta conexión apunta a otro repositorio",
        body: "Esta dirección ahora corresponde a un repositorio distinto del que se conectó a este proyecto. Compruébalo en GitHub; si el repositorio realmente se reemplazó, crea un proyecto nuevo para él.",
      },
      archived: {
        title: "Este proyecto está archivado",
        body: "La edición y la publicación están desactivadas, y se rechazan las sincronizaciones desde tu repositorio. Restáuralo para volver a trabajar en él.",
        editor: "Pide a un propietario del proyecto que lo restaure.",
      },
    },
  },
  logs: {
    kinds: {
      all: "Toda la actividad",
      translations: "Traducciones",
      imports: "Sincronizaciones",
      publish: "Publicaciones",
      sources: "Fuentes e idiomas",
      members: "Miembros",
      settings: "Configuración",
    },
    filters: {
      anyDate: "Cualquier fecha",
      anyone: "Cualquier persona",
      anySource: "Cualquier fuente",
      anyResult: "Cualquier resultado",
      clear: "Borrar filtros",
      people: "Personas",
      automation: "Automatización",
      projectWide: "Todo el proyecto",
      clearSources: "Borrar fuentes",
      resultScope: "Se aplica a sincronizaciones y publicaciones. Los demás eventos no tienen resultado.",
      groupImports: "Sincronizaciones",
      groupPublish: "Publicaciones",
      groupBoth: "Ambas",
      axis: {
        kind: "Tipo",
        date: "Fecha",
        actor: "Autor",
        source: "Fuente",
        result: "Resultado",
      },
    },
    range: {
      today: "Hoy",
      yesterday: "Ayer",
      last7: "Últimos 7 días",
      last30: "Últimos 30 días",
      custom: "Rango personalizado (UTC)",
      customOpen: "Rango personalizado (UTC)…",
      from: "Desde (UTC)",
      to: "Hasta (UTC)",
      apply: "Aplicar rango",
      description: "Elige el primer y el último día que quieres ver. Deja uno vacío para un rango abierto.",
    },
    search: { label: "Buscar en los registros", placeholder: "Buscar en los registros…" },
    refresh: "Actualizar",
    status: {
      succeeded: "Enviado",
      skipped: "Nada que enviar",
      notSent: "Excluido",
      failed: "Fallida",
      syncing: "Sincronizando…",
      publishing: "Publicando…",
      inProgress: "En curso",
      imported: "Sincronizado",
      deferred: "Retenido",
      partial: "Sincronizado en parte",
      superseded: "Reemplazado",
      notStarted: "Sin iniciar",
      upToDate: "Al día",
    },
    day: {
      today: "Hoy",
      yesterday: "Ayer",
    },
    none: "—",
    warnings: (count: number): string => (count === 1 ? "1 descartada" : `${count.toLocaleString("es")} descartadas`),
    deferredReason: (count: number): string =>
      `${count === 1 ? "Una edición sin enviar dejó" : `${count.toLocaleString("es")} ediciones sin enviar dejaron`} la sincronización retenida. No se sincronizó nada.`,
    deferReasons: {
      "open-pr": "Todavía hay una pull request de Malmoi abierta. No se sincronizó nada: la sincronización se reanuda cuando se fusione o se cierre.",
      "pr-check-failed": "No se pudo comprobar en GitHub si hay una pull request de Malmoi abierta, así que no se sincronizó nada. La próxima ejecución lo vuelve a comprobar.",
      "too-large": "El cambio del repositorio es demasiado grande para una sincronización desde el servidor. No se sincronizó nada. Reduce el tamaño de los archivos o entrégalo con el flujo de trabajo del repositorio.",
    },
    empty: {
      title: "Todavía no hay actividad",
      description: "Las sincronizaciones, las ediciones de traducciones y las publicaciones aparecen aquí a medida que ocurren.",
    },
    noMatch: {
      title: "Ningún evento coincide con estos filtros",
      description: "Este proyecto tiene actividad, pero nada aparece en esta selección. Amplía el rango de fechas o borra los filtros.",
    },
    coverage: (date: string): string =>
      `El historial completo de actividad está disponible desde el ${date}. Los registros anteriores solo incluyen las ejecuciones de publicación.`,
    queryError: {
      title: "No pudimos cargar la actividad",
      description: "No se ha perdido nada: es un problema al leer el historial, no un proyecto sin actividad.",
      retry: "Intentar de nuevo",
    },
    loading: { list: "Cargando la actividad…" },
    older: "Anteriores",
    page: {
      perPage: "20 eventos por página, los más recientes primero.",
      noOlder: "No hay eventos anteriores que coincidan con estos filtros.",
    },
    meta: {
      values: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "valor cambiado" : "valores cambiados"}`,
      type: { TRANSLATION: "Traducción", IMPORT: "Sincronización", PUBLISH: "Publicación", SURFACE: "Fuente", MEMBER: "Miembro", SETTINGS: "Configuración" },
      runType: {
        IMPORT: { manual: "Sincronización manual", nightly: "Sincronización nocturna", ci: "Sincronización de CI" },
        PUBLISH: { manual: "Publicación manual", nightly: "Publicación nocturna", ci: "Publicación de CI" },
      },
      files: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "archivo" : "archivos"}`,
      keys: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "clave" : "claves"}`,
      noPullRequest: "sin pull request",
      declarationOnly: "solo la declaración",
      nothingImported: "no se sincronizó nada",
      archivedEffect: "se detuvo la edición y terminaron las publicaciones nocturnas",
      restoredEffect: "se reanudaron la edición y las publicaciones nocturnas",
      tokenEffect: "el token anterior dejó de funcionar",
    },
    sentence: {
      translation: {
        updated: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} actualizó {key} en {language}</>
        ),
        cleared: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} vació {key} en {language}</>
        ),
        reverted: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} revirtió {key} en {language} a la última versión confirmada como enviada</>
        ),
      },
      publish: {
        running: (who: ReactNode): ReactNode => <>{who} está enviando traducciones a GitHub</>,
        sent: (who: ReactNode): ReactNode => <>{who} envió traducciones a GitHub</>,
        nothing: (who: ReactNode): ReactNode => <>{who}: la publicación no tenía nada que enviar</>,
        notSent: (who: ReactNode): ReactNode => <>{who}: la publicación excluyó algunas ediciones</>,
        reconfirm: (who: ReactNode): ReactNode => <>{who}: la publicación se detuvo antes de enviar</>,
        failed: (who: ReactNode): ReactNode => <>{who}: la publicación falló</>,
        notStarted: (who: ReactNode): ReactNode => <>{who}: la publicación no se inició</>,
      },
      import: {
        running: (who: ReactNode): ReactNode => <>{who} está leyendo el repositorio</>,
        imported: (who: ReactNode, sources: number): ReactNode => (
          <>{who} sincronizó {sources.toLocaleString("es")} {sources === 1 ? "fuente" : "fuentes"} desde el repositorio</>
        ),
        deferred: (who: ReactNode, source: string): ReactNode => <>{who} retuvo la sincronización de {source}</>,
        superseded: (who: ReactNode): ReactNode => <>{who}: la sincronización cedió el paso a otra ejecución</>,
        failed: (who: ReactNode): ReactNode => <>{who}: la sincronización falló</>,
        notStarted: (who: ReactNode): ReactNode => <>{who}: la sincronización no se inició</>,
        upToDate: (who: ReactNode): ReactNode => <>{who} no encontró nada que publicar ni sincronizar</>,
        baseUnreadable: (who: ReactNode): ReactNode => <>{who} no pudo leer la rama base del repositorio</>,
        held: {
          "open-pr": (who: ReactNode): ReactNode => <>{who} retuvo la sincronización: todavía hay una pull request de Malmoi abierta</>,
          "pr-check-failed": (who: ReactNode): ReactNode => <>{who} retuvo la sincronización: GitHub no respondió sobre las pull requests</>,
          "too-large": (who: ReactNode): ReactNode => <>{who} retuvo la sincronización: el cambio es demasiado grande para una sincronización desde el servidor</>,
        },
      },
      member: {
        invited: (who: ReactNode, target: string): ReactNode => <>{who} invitó a {target}</>,
        joined: (who: ReactNode): ReactNode => <>{who} se unió al proyecto</>,
        roleChanged: (who: ReactNode, target: string): ReactNode => <>{who} cambió el rol de {target}</>,
        removed: (who: ReactNode, target: string): ReactNode => <>{who} quitó a {target}</>,
        invitationRevoked: (who: ReactNode): ReactNode => <>{who} revocó una invitación</>,
      },
      surface: {
        added: (who: ReactNode, source: string): ReactNode => <>{who} añadió la fuente {source}</>,
        baseLocale: (who: ReactNode, source: string): ReactNode => (
          <>{who} cambió el idioma base de {source}</>
        ),
      },
      settings: {
        created: (who: ReactNode): ReactNode => <>{who} creó este proyecto</>,
        name: (who: ReactNode): ReactNode => <>{who} cambió el nombre del proyecto</>,
        baseBranch: (who: ReactNode): ReactNode => <>{who} cambió la rama base</>,
        repository: (who: ReactNode): ReactNode => <>{who} volvió a conectar el repositorio</>,
        pushToken: (who: ReactNode): ReactNode => <>{who} renovó el token de push</>,
        image: (who: ReactNode): ReactNode => <>{who} cambió la imagen del proyecto</>,
        imageRemoved: (who: ReactNode): ReactNode => <>{who} quitó la imagen del proyecto</>,
        archived: (who: ReactNode): ReactNode => <>{who} archivó este proyecto</>,
        restored: (who: ReactNode): ReactNode => <>{who} restauró este proyecto</>,
      },
      fallback: (who: ReactNode, kind: string): ReactNode => <>{who} cambió {kind}</>,
    },
    detail: {
      labels: {
        reference: "Referencia",
        trigger: "Origen",
        source: "Fuente",
        key: "Clave",
        locale: "Idioma",
        before: "Antes",
        after: "Después",
        files: "Archivos",
        pullRequest: "Pull request",
        errorCode: "Código de error",
        resultPerSource: "Resultado por fuente",
        member: "Miembro",
        role: "Rol",
        effect: "Efecto",
        unsentEdits: "Ediciones sin enviar",
        heldBecause: "Retenido porque",
        values: "Valores",
        withheld: "Excluidas",
        closedPullRequest: "Pull request cerrada",
      },
      closedPullRequest: "Ya no había nada en ella que difiriera de la rama base, así que Malmoi la cerró.",
      withheld: (n: number): string =>
        `${n === 1 ? "Una edición se quedó" : `${n.toLocaleString("es")} ediciones se quedaron`} en Malmoi porque el archivo de idioma o la clave todavía no están en el repositorio.`,
      actions: {
        copy: "Copiar referencia",
        openTranslation: "Abrir esta traducción",
        openMembers: "Abrir miembros",
        openSettings: "Abrir configuración",
        openRepository: "Abrir en GitHub",
        close: "Cerrar",
      },
      notes: {
        publish: "Que una ejecución falle no demuestra que nada haya llegado a GitHub. Revisa el repositorio si esperas una pull request.",
        import: "Los recuentos son claves, no archivos ni celdas de traducción. Añadir una fuente y sincronizarla son eventos distintos: esta ejecución es la sincronización.",
        token: "Los valores de los tokens nunca se guardan en los registros, ni siquiera en parte.",
      },
      noResult: "El servidor no ha registrado ningún resultado.",
      notRecordedForRun: "no registrado en esta ejecución",
      noPullRequest: "Ninguna",
      missing: { title: "No se encontró este evento", description: "Puede que la referencia sea de otro proyecto o que nunca haya existido." },
      startedFinished: (started: string, finished: string): string => `Iniciado ${started} · terminado ${finished}`,
      startedOnly: (started: string): string => `Iniciado ${started}`,
    },
    value: {
      empty: "Vacío",
      spacesOnly: (n: number): string =>
        `Solo espacios (${n.toLocaleString("es")} ${n === 1 ? "carácter" : "caracteres"})`,
      notRecorded: "No registrado",
      unavailable: UNAVAILABLE,
    },
    archived: {
      description: "Este proyecto está archivado. El historial se puede seguir leyendo; la edición, la publicación y la sincronización están desactivadas.",
      restoreLine: (date: string): string => `Archivado el ${date}. Los propietarios del proyecto pueden restaurarlo desde Configuración.`,
    },
    trigger: {
      cron: "Proceso nocturno",
      removed: "Usuario eliminado",
      ci: "CI",
    },
    nightlyRetry: NIGHTLY_RETRY,
    reasons: {
      "base-unreadable": "No pudimos leer tu repositorio. Pide a tus desarrolladores que revisen el acceso de la app.",
      "not-installed": "La app no estaba conectada al repositorio. Pide a tus desarrolladores que la vuelvan a conectar.",
      "glob-matched-nothing": "Los archivos de traducción no estaban donde esperábamos. Consulta a tus desarrolladores.",
      "github-error": `GitHub no respondió. ${NIGHTLY_RETRY}`,
      "db-unavailable": `No se pudo acceder a nuestro propio almacenamiento. ${NIGHTLY_RETRY}`,
      stale: "Esta ejecución se detuvo antes de terminar.",
      unknown: `Algo salió mal. ${NIGHTLY_RETRY}`,
      reconfirm: "Los cambios por enviar se actualizaron después de la vista previa, así que no se envió nada. Vuelve a ver la vista previa y publica.",
      fallback: "Algo salió mal. Avisa a tus desarrolladores si sigue ocurriendo.",
    },
    refusals: {
      archived: "El proyecto se archivó.",
      "not-ready": "La primera sincronización todavía no ha terminado.",
      "stale-commit": "Ya se había sincronizado una versión más reciente del repositorio.",
      "wrong-format": "El repositorio ya no coincide con el formato guardado.",
      "repo-replaced": "El repositorio conectado cambió.",
      "not-installed": "La app no estaba conectada al repositorio.",
      fallback: "La ejecución se rechazó antes de empezar.",
    },
  },

  archive: {
    title: "Archivar proyecto",
    description: "Detén este proyecto sin eliminar nada.",
    action: "Archivar proyecto",
    restore: "Restaurar proyecto",
    archivedBy: (when: ReactNode): ReactNode => <>Archivado el {when}</>,
    confirm: {
      title: (name: string): string => `¿Archivar ${name}?`,
      body: "Todos dejan de editar, la publicación nocturna se detiene y se rechazan las sincronizaciones desde tu repositorio.",
      openPr: "Lo que ya enviaste sigue abierto para tus desarrolladores:",
      openPrLink: "Ver lo que está abierto",
      prUnknown: "No se pudo comprobar qué sigue abierto para tus desarrolladores.",
      cancel: "Cancelar",
    },
    failed: (reason: string): string => `No se pudo cambiar: ${reason}`,
    failedUnknown: "No se pudo confirmar el cambio. Actualiza la página para ver el estado actual.",
    empty: { title: "Este proyecto está archivado", action: "Abrir configuración" },
  },

  projects: {
    loading: "Cargando proyectos…",
    search: { label: "Buscar proyectos", placeholder: "Buscar proyectos…" },
    narrowed: {
      title: (q: string): string => `Ningún proyecto coincide con “${q}”`,
      description: "La búsqueda mira el nombre del proyecto.",
      reset: "Borrar búsqueda",
    },
    archived: "Archivado",
    role: { OWNER: "Propietario", EDITOR: "Editor" },
    empty: {
      title: "Todavía no hay proyectos",
      description:
        "Conecta un repositorio y Malmoi encontrará los archivos de traducción por ti; solo escribe en él abriendo una pull request. ¿Te invitaron al proyecto de otra persona? Abre el enlace de tu correo de invitación.",
    },
    summary: {
      newFromGithub: "Nuevo desde GitHub",
      toTranslate: "Para traducir",
      toReview: "Para revisar",
      toSend: "Para enviar",
    },
    group: { needsAttention: "Requiere atención", allSet: "Todo listo" },
    resultsFor: (q: string): string => `Resultados para “${q}”`,
    count: (n: number): string => `${n} ${n === 1 ? "proyecto" : "proyectos"}`,
    clearSearch: "Borrar búsqueda",
    meter: {
      note: {
        waiting: "Sin sincronizar todavía",
        importing: "Sincronizando…",
        failed: "Sincronización fallida",
        setup: "Conecta la GitHub App para continuar.",
      },
    },
    banner: {
      review: (n: number): string =>
        `${n === 1 ? "Una celda está traducida y espera" : `${n.toLocaleString("es")} celdas están traducidas y esperan`} revisión.`,
      unsent: (n: number): string =>
        `${n === 1 ? "Una edición sin enviar" : `${n.toLocaleString("es")} ediciones sin enviar`}: publica para ${n === 1 ? "enviarla" : "enviarlas"}.`,
      prOpen: (n: number): string => `La pull request #${n} está abierta: fusiónala para terminar.`,
      prCheckFailed: "No se pudo comprobar si hay una pull request abierta.",
      repoAhead: (n: number, baseBranch: string): string =>
        `${n === 1 ? "Cambió 1 archivo de traducción" : `Cambiaron ${n} archivos de traducción`} en ${baseBranch} después de tu última sincronización.`,
      setup: "Termina la configuración para empezar a traducir.",
      needsReconnect: "Este repositorio está desconectado: las sincronizaciones y publicaciones se detienen hasta que se vuelva a conectar.",
      checkDetails: "Revisa los detalles de la sincronización.",
      askOwner: {
        reconnect: "Pide a un propietario del proyecto que lo vuelva a conectar.",
        setup: "Pide a un propietario del proyecto que termine la configuración.",
      },
      action: {
        review: "Revisar",
        send: "Ir a Publicar",
        viewPr: "Abrir en GitHub",
        reviewChanges: "Revisar cambios",
        viewDetails: "Ver detalles",
        continueSetup: "Continuar la configuración",
        reconnect: "Volver a conectar",
      },
    },
    status: {
      active: "Activo",
      archived: "Archivado",
      setup: "Pendiente de configurar",
    },
    importFailure: {
      parseFailed: "No se pudieron analizar los archivos de traducción.",
      parseCrashed: "Un archivo de traducción detuvo el analizador.",
      invalidLocaleData: "No pudimos leer algunas entradas de traducción.",
      prepareFailed: "No pudimos leer el formato de los archivos en la última sincronización.",
      partialImport: "Algunos archivos de traducción quedaron fuera de la última sincronización.",
      importFailed: "La última sincronización no pudo terminar.",
      ownerRetries: "Solo los propietarios del proyecto pueden intentarlo de nuevo.",
    },
  },
  account: {
    loading: "Cargando cuenta…",
    profile: {
      title: "Perfil",
      avatar: "Avatar",
      name: "Nombre",
      email: "Correo",
      none: "Ninguno",
      save: "Guardar",
      saved: "Guardado",
      errors: {
        empty: "Escribe un nombre para que los demás puedan reconocerte.",
        tooLong: (max: number): string => `Usa ${max} caracteres o menos.`,
        unavailable: "No se pudo guardar tu nombre. Vuelve a intentarlo en un momento.",
      },
    },
    github: {
      title: "GitHub App",
      notConnected: "Sin conectar",
      statusReauthorize: "Caducada",
      statusUnavailable: "No se pudo comprobar",
      hintNotConnected: "Conéctate para ver en qué repositorios está instalada la app.",
      hintReauthorize: "No podrás añadir ni volver a conectar repositorios hasta que vuelvas a autorizar. Los proyectos que ya están conectados siguen sincronizándose.",
      hintUnavailable: "No se pudo comprobar esta conexión. Vuelve a abrir esta página en un momento.",
      connected: "Conectada",
      installedOn: (n: number): string => `Instalada en ${n.toLocaleString("es")} ${n === 1 ? "repositorio" : "repositorios"}.`,
      installationSettings: "Configuración de la instalación",
      rowName: "GitHub",
      confirmDisconnect: "¿Desconectar la Malmoi GitHub App?",
      confirmHint: "No podrás añadir ni volver a conectar repositorios hasta que vuelvas a conectarte. Los proyectos que ya están conectados siguen sincronizándose.",
    },
    sessionsSection: {
      title: "Sesiones",
    },
    sessions: {
      title: "Cerrar sesión en todas partes",
      confirmTitle: "¿Cerrar sesión en todas partes?",
      confirmHint: "Lo confirmarás con la cuenta con la que inicias sesión y después se cerrará la sesión en todos los dispositivos, incluido este.",
      confirmAction: (provider: string): string => `Continuar a ${provider}`,
      confirmDetail: (provider: string): string => `${provider} te pedirá que lo confirmes antes de que cambie nada.`,
      willConfirm: "Te llevaremos a tu proveedor para que lo confirmes y después te traeremos de vuelta aquí.",
      button: "Confirmar y cerrar sesión en todas partes",
      complete: "Se cerró tu sesión en todas partes. Vuelve a iniciar sesión para continuar.",
      failed: "No se pudo cerrar tu sesión en todas partes. Vuelve a intentarlo.",
      cancelled: "Se canceló la confirmación. Sigues con la sesión iniciada. Vuelve a intentarlo cuando quieras.",
      expired: "Esta confirmación caducó. Empieza de nuevo para cerrar sesión en todas partes.",
      wrongAccount: "Elige la misma cuenta con la que inicias sesión en Malmoi y vuelve a intentarlo.",
    },
    signOut: {
      title: "Cerrar sesión",
      description: "Tendrás que volver a iniciar sesión para abrir tus proyectos.",
    },
    picture: {
      upload: "Subir",
      delete: "Quitar",
      caption: "PNG o JPEG, hasta 3 MB.",
      busy: "Espera a que termine la subida en curso.",
    },
  },

  mcpConnector: {
    token: {
      title: "Tu token",
      create: "Crear token",
      rotate: "Rotar token",
      revoke: "Revocar",
      expired: "Caducado",
      emptyTitle: "Aún no hay token",
      emptyBody: "Crea un token para que un agente de IA pueda trabajar en tus proyectos.",
      facts: {
        grants: "Acciones permitidas",
        scope: "Alcance",
        created: "Creado",
        lastUsed: "Último uso",
        expires: "Caduca",
      },
      readOnly: "Solo lectura",
      allProjects: "Todos los proyectos",
      projects: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "proyecto" : "proyectos"}`,
      never: "Nunca",
      unconfirmed: "No se pudo confirmar el resultado. Si no recibiste el valor del token, rótalo para obtener uno nuevo.",
      revokeUnconfirmed: "No se pudo confirmar que el token se revocó. Si todavía aparece aquí, vuelve a revocarlo.",
      status: {
        created: "Token creado",
        rotated: "Token rotado",
        revoked: "Token revocado",
      },
    },
    grants: {
      "translation:write": { label: "Traducir y publicar", hint: "Guardar traducciones y abrir pull requests de publicación." },
      "project:settings": { label: "Configuración del proyecto", hint: "Fuentes, sincronización, rama base, token de push, archivado." },
      "member:manage": { label: "Miembros", hint: "Invitar, cambiar roles, quitar." },
      "project:create": { label: "Crear proyectos", hint: "Ver tus repositorios de GitHub y configurar proyectos nuevos." },
    },
    apps: {
      title: "Apps conectadas",
      count: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "app conectada" : "apps conectadas"}`,
      copyServerUrl: "Copiar URL del servidor",
      emptyTitle: "No hay apps conectadas",
      emptyBody: "Aquí aparecen las apps que autorices desde Claude Code, Codex o claude.ai.",
      disconnect: "Desconectar",
      disconnectLabel: (name: string, id: string): string => `Desconectar ${name}, ${id}`,
      confirmTitle: (name: string): string => `¿Desconectar ${name}?`,
      confirmBody: "Pierde el acceso de inmediato. Tus otras apps y tu token personal siguen funcionando.",
      confirm: "Desconectar app",
      disconnected: (name: string): string => `${name} desconectada`,
      loadFailed: "No pudimos cargar tus apps conectadas.",
      unconfirmed: (name: string): string => `No se pudo confirmar que ${name} se desconectó. Si todavía aparece en la lista, vuelve a desconectarla.`,
      dcrIdent: (id: string, host: string): string => `ID de cliente ${id} · vuelve a ${host}`,
    },
    guide: {
      link: "Conectar un agente de IA",
    },
    form: {
      createTitle: "Crear token",
      rotateTitle: "Rotar token",
      expiresIn: "Caduca en",
      days: (n: number): string => `${n.toLocaleString("es")} días`,
      grants: "Acciones permitidas",
      grantsHelp: "Leer claves, eventos y miembros dentro de tus proyectos nunca requiere un permiso.",
      scope: "Alcance",
      allMine: "Todos mis proyectos",
      chosen: "Proyectos elegidos",
      noMembership: "Todavía no eres miembro de ningún proyecto.",
      chooseOne: "Elige al menos un proyecto.",
      step: (n: number): string => `Paso ${n.toLocaleString("es")} de 2`,
      create: "Crear",
      rotateConfirm: "Rotar y mostrar el token nuevo",
      rotateWarning: "Al rotarlo, el token actual deja de funcionar de inmediato. Todos los agentes que lo usan se detienen hasta que pegues el nuevo.",
      failed: "No se pudo crear el token. Vuelve a intentarlo en un momento.",
    },
    result: {
      title: "Tu token",
      copyNow: "Cópialo ahora: no se volverá a mostrar.",
      setEnv: "Defínelo como MALMOI_TOKEN en tu shell y luego añade Malmoi a tu agente; en Conectar un agente de IA se explica cómo.",
    },
    revoke: {
      title: "¿Revocar tu token?",
      body: "Todos los agentes que lo usan se detienen de inmediato. Esto no se puede deshacer.",
      confirm: "Revocar token",
    },
  },

  oauthAuthorize: {
    title: "Conectar una app a Malmoi",
    signInDescription: "Inicia sesión para revisar lo que pide esta app.",
    consentDescription: "Elige lo que puede hacer por ti. Puedes desconectarla en cualquier momento en la página del conector MCP.",
    appNameNote: "La app eligió este nombre. Comprueba la dirección antes de continuar.",
    clientId: (id: string): string => `ID de cliente ${id}`,
    returnsTo: (uri: string): string => `Vuelve a ${uri}`,
    signedInWith: (provider: string): string => `Sesión iniciada con ${provider}`,
    notYou: "¿No eres tú?",
    replaces: (date: string): string =>
      `Conectaste esta app el ${date}. Si terminas de conectarla, la nueva conexión reemplaza a la anterior y es posible que se cierre la sesión de la app en tus otros dispositivos. Si eliges Denegar, se mantiene la conexión actual.`,
    denyFailed: "No se pudo registrar tu respuesta. No cambió nada; vuelve a intentarlo.",
    consentNote:
      "En cada proyecto, la app solo puede hacer lo que también permite tu rol en él. Todos mis proyectos incluye los proyectos a los que te unas más adelante, y los proyectos que cree la app se añaden a Proyectos elegidos. La conexión termina cuando caduca; vuelve a conectarte desde la app para seguir usándola.",
    returnTo: (host: string): string => `Volverás a ${host}.`,
    deny: "Denegar",
    authorize: "Autorizar",
    failed: "No se pudo guardar esta autorización. Tus elecciones se conservan; vuelve a intentarlo.",
    unconfirmed: "No se pudo confirmar si esto se completó. Revisa la solicitud antes de intentar otra cosa.",
    checkRequest: "Revisar solicitud",
    sessionEnded: "Se cerró tu sesión. Vuelve a iniciar sesión para continuar; esta solicitud sigue abierta.",
    ended: {
      notFound: { title: "No se encontró esta solicitud", body: "Es posible que el enlace esté incompleto. Vuelve a la app y conéctate de nuevo a Malmoi." },
      expired: { title: "Esta solicitud caducó", body: "Las solicitudes permanecen abiertas 10 minutos. Vuelve a la app y conéctate de nuevo a Malmoi." },
      used: {
        title: "Esta solicitud ya se respondió",
        body: "Se autorizó o se denegó antes. Revisa la app; si no está conectada, vuelve a conectarte a Malmoi desde allí.",
      },
      unavailable: { title: "No pudimos cargar esta solicitud", body: "Algo salió mal por nuestra parte. Es posible que la solicitud siga abierta; vuelve a intentarlo en un momento." },
      invalid: {
        title: "Esta app no puede conectarse",
        body: "Malmoi no pudo verificar de dónde venía esta solicitud, así que se detuvo aquí. No se compartió nada con la app.",
      },
    },
  },

  newProject: {
    formats: {
      "chrome-locales": { label: "Mensajes de extensión de Chrome", example: "_locales/{locale}/messages.json" },
      "json-catalog": { label: "Catálogo JSON", example: "src/locales/{locale}.json" },
      "yaml-catalog": { label: "Catálogo YAML", example: "config/locales/{locale}.yml" },
      "code-dict": { label: "Diccionario en código (un archivo por idioma)", example: "src/locales/{locale}.ts" },
      "ts-dict": { label: "Diccionario en código (todos los idiomas en un archivo)", example: "src/i18n/namespaces/*.ts" },
    },
    imported: (count: number, failed: number): string =>
      failed === 0
        ? `Se sincronizó ${count === 1 ? "1 clave" : `${count.toLocaleString("es")} claves`}.`
        : `Se sincronizó ${count === 1 ? "1 clave" : `${count.toLocaleString("es")} claves`}, pero ${failed.toLocaleString("es")} no se ${failed === 1 ? "pudo" : "pudieron"} leer.`,

    modal: {
      next: "Siguiente",
      back: "Atrás",
      close: "Cerrar",
      step: (n: number): string => `Paso ${n} de 4`,
    },

    steps: {
      repo: {
        title: "Nuevo proyecto",
        description: "Elige un repositorio y la rama que Malmoi debe leer.",
      },
      files: {
        title: "¿Qué archivos contienen tus textos?",
        description: (n: number, repo: string, branch: string): string =>
          `${n === 1 ? "1 conjunto coincide" : `${n} conjuntos coinciden`} en ${repo} · ${branch}. Revisa las claves antes de continuar.`,
        loading: (repo: string, branch: string): string => `Leyendo ${repo} · ${branch}…`,
        emptyTitle: "¿Dónde están tus archivos de traducción?",
        emptyDescription: (repo: string, branch: string): string =>
          `Malmoi no encontró archivos de traducción compatibles en ${repo} · ${branch}. Indica la ruta y los comprobará.`,
      },
      naming: {
        title: "Detalles del proyecto",
        description: "El idioma base decide qué claves existen. El nombre y la dirección se toman del repositorio.",
      },
      result: {
        title: "Malmoi está listo",
        description: "Cada noche, Malmoi envía al repositorio las traducciones que aún no se han enviado como una pull request, o recoge los commits nuevos. Para recoger los cambios con cada commit, añade el token de push y el flujo de trabajo al repositorio.",
      },
    },

    empty: {
      connect: {
        action: "Autorizar la GitHub App",
        reauthorize: "Volver a autorizar la GitHub App",
      },
      install: {
        title: "Conecta tus repositorios",
        description: "Instala la Malmoi GitHub App en tu cuenta u organización para elegir repositorios.",
        action: "Instalar la GitHub App",
        installed: "¿Ya está instalada en tu organización?",
        connect: "Conectar tu cuenta",
      },
      repos: {
        title: "Añadir un repositorio",
        description: "Elige a qué repositorios puede acceder la Malmoi GitHub App.",
        action: "Elegir repositorios",
      },
      waiting: {
        title: "Esperando aprobación",
        description: "Un propietario de la organización tiene que aprobar tu solicitud para instalar la Malmoi GitHub App.",
        action: "Intentar de nuevo",
        otherAccount: "Instalar en otra cuenta",
        still: "Todavía esperando aprobación.",
        info: "Un propietario de la organización todavía tiene que aprobar tu solicitud de instalación.",
      },
      limit: {
        title: "Límite de proyectos alcanzado",
        description: (limit: number): string => `Eres propietario de ${limit.toLocaleString("es")} proyectos, el máximo permitido. Archiva uno para liberar espacio.`,
        action: "Ir a tus proyectos",
      },
      reconnect: {
        title: "Volver a conectar GitHub",
        description: "Vuelve a autorizar la Malmoi GitHub App para ver tus repositorios.",
      },
      noLink: "Pide a quien administre tu cuenta u organización de GitHub que instale la Malmoi GitHub App y le dé acceso al repositorio.",
      listFailed: "No pudimos cargar tus repositorios.",
    },

    repo: {
      list: "Repositorios",
      search: { label: "Buscar repositorios", placeholder: "Buscar repositorios…" },
      pushedAt: (rel: string): string => `Push ${rel}`,
      branch: "Rama",
      branchHelp: "Malmoi lee los archivos de traducción de esta rama. Puedes cambiarla más adelante en Configuración.",
      branchDefault: "Se usa la rama predeterminada del repositorio.",
      branchTooMany: "Este repositorio tiene demasiadas ramas para mostrarlas; escribe el nombre de la rama.",
      notListed: "¿No ves un repositorio?",
      loading: "Buscando repositorios que tengan instalada la Malmoi GitHub App…",
      searchEmpty: (q: string): string => `Ningún repositorio coincide con “${q}”`,
      clearSearch: "Borrar búsqueda",
    },

    files: {
      candidates: "Archivos de traducción candidatos",
      resize: "Cambiar el tamaño de la lista de archivos",
      include: (path: string) => `Incluir ${path}`,
      previewCandidate: (path: string) => `Vista previa de ${path}`,
      conflicts: "Estas selecciones escriben en los mismos archivos. Desmarca una selección para continuar.",
      keys: (n: number): string => (n === 1 ? "1 clave" : `${n.toLocaleString("es")} claves`),
      summaryShort: (locales: number, keys: string): string => `${locales} idiomas · ${keys}`,
      notListed: "¿No aparece?",
      setPath: "Indicar la ruta manualmente",
      preview: {
        key: "Clave",
        value: "Valor",
        more: (n: number): string => (n === 1 ? "1 clave más" : `${n.toLocaleString("es")} claves más`),
        language: "Idioma",
        option: (code: string, keys: string | undefined): string => (keys === undefined ? code : `${code} · ${keys}`),
        none: "Todavía no hay nada que mostrar",
        noneDescription: "Indica una ruta y Malmoi mostrará las claves que encuentre. Si ningún archivo coincide, el proyecto no se crea.",
        rows: "Filas de la vista previa",
        unavailable: "No pudimos leer este archivo.",
      },
      manual: {
        format: "Formato de archivo",
        path: "Ruta",
        pathHint: {
          "per-locale": (token: ReactNode): ReactNode => <>El marcador {token} indica dónde va el idioma.</>,
          "multi-locale": (token: ReactNode): ReactNode => (
            <>Este formato guarda todos los idiomas en un solo archivo, así que la ruta no lleva marcador de idioma; usa {token} para que coincida con los archivos.</>
          ),
        },
        baseLocale: "Idioma base",
        baseLocalePlaceholder: "en",
        hint: "Al indicar una ruta se borra la selección de arriba.",
      },
    },

    baseLocale: {
      row: (path: string, keys: string | undefined): string => (keys === undefined ? path : `${path} · ${keys}`),
      title: "Idioma base",
      hint: "El archivo de este idioma decide qué claves existen. Si eliges el equivocado, las claves que solo existen en otro idioma quedan fuera.",
    },

    naming: {
      name: "Nombre",
      slug: "Dirección",
      hint: (address: ReactNode, branch: ReactNode): ReactNode => (
        <>
          Se abre en {address}. Las traducciones vuelven como una pull request en {branch}.{" "}
          <strong className="text-foreground font-normal">La dirección no se puede cambiar más adelante.</strong>
        </>
      ),
      create: "Crear proyecto",
      creating: "Creando el proyecto y sincronizando todos los archivos seleccionados…",
      nothingCreated: "No se creó nada.",
      resultUnknown: "No se pudo confirmar el resultado. Revisa tu lista de proyectos antes de volver a intentarlo. Si el proyecto existe, genera un token de push nuevo en Configuración.",
      failedSurface: (path: string, failed: number) => `${path}: ${failed.toLocaleString("es")} ${failed === 1 ? "problema" : "problemas"} de sincronización.`,
      info: (path: string, branch: string): string =>
        `Al crear el proyecto se lee ${path} en ${branch} una sola vez. No se escribe nada en el repositorio.`,
      mostKeys: "Más claves",
      baseOption: (code: string, keys: string | undefined, mostKeys: boolean): string =>
        [code, keys, mostKeys ? "Más claves" : undefined].filter((part) => part !== undefined).join(" · "),
      keyGap: (lang: string, n: number, base: string): string =>
        `${lang} tiene ${n.toLocaleString("es")} claves menos que ${base}. Esas claves quedarían fuera si ${lang} fuera el idioma base.`,
      slugTaken: (alt: string | undefined): string =>
        alt === undefined
          ? "Esa dirección ya está en uso. Prueba otra."
          : `Esa dirección ya está en uso. Prueba otra, como ${alt}.`,
      slugEmpty: "Elige una dirección.",
      slugFormat: "Una dirección puede usar letras minúsculas, números, '-', '.' y '_'.",
      slugTooLong: (max: number): string => `Una dirección puede tener hasta ${max} caracteres.`,
      slugReserved: "Esa dirección está reservada.",
    },

    errors: {
      sessionLost: "Vuelve a iniciar sesión y regresa; no se ha creado nada.",
      sessionLostAfterCreate: "Vuelve a iniciar sesión y regresa; tu proyecto sigue en tu lista.",
    },

    result: {
      token: {
        title: "Token de push",
        description: (secret: ReactNode): ReactNode => (
          <>
            Añádelo al secreto de Actions {secret} del repositorio.{" "}
            <strong className="text-foreground font-normal">No lo volverás a ver cuando salgas de esta página.</strong> Si lo pierdes,
            rótalo en Configuración.
          </>
        ),
      },
      ingest: {
        retry: "Intentar de nuevo",
        refsHint: "Las referencias en el código llegan después de la primera ejecución de tu flujo de trabajo de CI. Ya puedes empezar a traducir.",
        open: "Abrir proyecto",
      },
      failed: "No se pudo terminar. Vuelve a intentarlo en un momento.",
    },
  },
  translations: {
    loading: "Cargando traducciones…",
    keys: (n: number): string => (n === 1 ? "1 clave" : `${n.toLocaleString("es")} claves`),

    workspace: {
      filters: {
        state: { axis: "Estado", any: "Todas las claves", incomplete: "Incompletas", review: "Por revisar", unsent: "Sin enviar", new: "Nuevas desde GitHub", newHint: "Claves que llegaron después de la última vez que Malmoi confirmó tus archivos." },
        clear: "Borrar filtros",
        search: "Buscar claves",
        searchPlaceholder: "Buscar en todas las fuentes…",
      },
      tree: { title: "Fuentes", allNamespaces: "Todos los espacios de nombres", allSources: "Todas las fuentes", filter: "Filtrar espacios de nombres", open: "Mostrar fuentes" },
      resize: "Cambiar el tamaño de la lista de claves",
      list: {
        keys: "Claves",
        savedExtra: (n: number): string => `+${n.toLocaleString("es")} guardadas`,
        missing: (n: number): string => `${n.toLocaleString("es")} sin traducir`,
        complete: "Completa",
        notSent: "Sin enviar",
        needsReview: "Por revisar",
        saved: "Guardado",
      },
      detail: {
        languages: (filled: number, total: number): string => `${filled.toLocaleString("es")} de ${total.toLocaleString("es")} idiomas`,
        allLanguages: "Todos los idiomas",
        missingOnly: "Solo sin traducir",
        languagesGroup: "Idiomas",
        source: "Fuente",
        notSaved: "Sin guardar",
        saving: "Guardando…",
        missing: "Sin traducir",
        noDescription: "Sin descripción en el código",
        noCommit: "Todavía no hay un commit al que enlazar",
        referenced: (n: number): string => `Referenciada en ${n.toLocaleString("es")} ${n === 1 ? "lugar" : "lugares"}`,
        copyLink: "Copiar enlace",
        copied: "Copiado",
        copyFailed: "No se pudo copiar",
        selectKey: "Selecciona una clave para traducir",
        selectKeyBody: "Sus traducciones en todos los idiomas se abren aquí.",
        keyGone: (source: string): string => `Esta clave ya no está en ${source}`,
      },
      footer: {
        unsaved: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "cambio sin guardar" : "cambios sin guardar"}`,
        saved: "Guardado",
        savedNotSent: "Guardado · sin enviar",
        savedSince: (n: number): string => `Guardado · ${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"} desde que pulsaste Guardar`,
        save: "Guardar",
        tryAgain: "Intentar de nuevo",
        saveFailed: { title: "No pudimos guardar esta clave", body: "Tu texto sigue aquí. Vuelve a intentarlo o guárdalo dentro de un momento." },
        saveUnknown: { title: "No pudimos confirmar el guardado", body: "Tu texto sigue aquí. Revisa los valores actuales antes de volver a guardar." },
        cannotClear: {
          title: (locales: string): string => `${locales} no puede quedar vacío`,
          body: "Este formato de archivo no puede quitar una traducción, así que no se guardó nada. Escribe un valor o descarta el cambio.",
        },
        archived: "Este proyecto está archivado — la edición está desactivada",
        lostAccess: "Ya no tienes acceso a este proyecto",
        keyGone: "Esta clave ya no está disponible. Copia tu texto y vuelve a cargar la página.",
        notReady: "Este proyecto todavía no terminó su primera sincronización. Tu texto sigue aquí — guárdalo después de la sincronización.",
        session: {
          title: "Tu sesión terminó",
          body: "Vuelve a iniciar sesión en esta pestaña. El texto que escribiste se queda en pantalla hasta entonces.",
          signIn: "Iniciar sesión",
          restored: (n: number): string => `Sesión iniciada de nuevo · ${n.toLocaleString("es")} ${n === 1 ? "cambio sin guardar restaurado" : "cambios sin guardar restaurados"}`,
          storageBlocked: "Copia tu texto antes de iniciar sesión — este navegador no lo está guardando por ti.",
        },
      },
      revert: {
        button: "Revertir a lo último enviado",
        title: "¿Revertir a la última versión confirmada?",
        body: (n: number, list: string): string =>
          `Tus ediciones sin enviar en ${n.toLocaleString("es")} ${n === 1 ? "idioma" : "idiomas"} — ${list} — vuelven a la última versión confirmada como enviada. Lo que guardaste desde entonces se descarta.`,
        confirm: "Revertir traducciones",
        unavailable: "La última versión enviada no está disponible para todos los idiomas modificados.",
        unsaved: "Primero guarda o descarta tus cambios.",
        busy: "Esto queda desactivado mientras se guarda, se publica o se sincroniza.",
        forbidden: "Solo los propietarios del proyecto pueden revertir a una versión enviada.",
        failed: { title: "No pudimos revertir esta clave", body: "No se hizo ningún cambio. Vuelve a intentarlo o revisa la última sincronización." },
        unknown: { title: "No pudimos confirmar la reversión", body: "Es posible que la reversión se haya completado. Revisa los valores actuales antes de volver a intentarlo.", check: "Revisar los valores actuales" },
        changed: { title: "Los valores cambiaron mientras esto estaba abierto", body: "Alguien guardó valores nuevos para esta clave. Míralos antes de revertir — este diálogo ya no coincide con lo que está guardado.", again: "Revisar de nuevo" },
        reverted: "Revertido a la última versión confirmada como enviada",
      },
      sync: { ownerOnly: "Solo los propietarios del proyecto pueden sincronizar." },
      syncLock: {
        title: "Sincronizando…",
        until: (time: ReactNode): ReactNode => <>No puedes guardar ediciones hasta que termine la sincronización — a más tardar a las {time}</>,
        ok: "Aceptar",
      },
      publish: {
        title: "¿Publicar sin guardar tus cambios?",
        body: (project: string, list: string, key: string, n: number): string =>
          `Publicar envía todos los valores guardados de ${project}. ${n === 1 ? "Tu traducción" : "Tus traducciones"} sin guardar de ${key} en ${list} — ${n.toLocaleString("es")} ${n === 1 ? "idioma" : "idiomas"} — ${n === 1 ? "se queda" : "se quedan"} aquí como ${n === 1 ? "borrador" : "borradores"}.`,
        keep: "Seguir editando",
        preview: "Ver los cambios guardados",
      },
      discard: {
        title: "¿Descartar tus cambios?",
        body: (key: string, list: string, n: number): string =>
          `${n === 1 ? "Tu traducción" : "Tus traducciones"} sin guardar de ${key} en ${list} (${n.toLocaleString("es")}) se ${n === 1 ? "perderá" : "perderán"}.`,
        keep: "Seguir editando",
        discard: "Descartar cambios",
        leave: "Salir y descartar",
      },
      empty: {
        noIncomplete: (ns: string): string => `No hay claves incompletas en ${ns}`,
        noMatch: (q: string): string => `Ninguna clave coincide con “${q}”`,
        noIncompleteMatch: (q: string): string => `Ninguna clave incompleta coincide con “${q}”`,
        filteredOut: "Ninguna clave coincide con estos filtros",
        searchAll: "Buscar en todas las fuentes",
        clearSearch: "Borrar búsqueda",
        noKeys: (ns: string): string => `No hay claves en ${ns}`,
        noActive: "No hay claves activas en este proyecto",
      },
    },

    cellLabel: (key: string, locale: string): string => `${key} · ${locale}`,

    connection: {
      owner: {
        disconnected: "Vuelve a conectarlo en Configuración.",
        notConnected: "Conéctalo en Configuración.",
        wrongRepository: "Revísalo en Configuración.",
      },
      editor: { wrongRepository: "Pide a un propietario del proyecto que lo revise." },
    },

    banner: {
      paused: (n: number): string =>
        `Las actualizaciones del repositorio se retienen hasta que se ${n === 1 ? "envíe" : "envíen"} ${n.toLocaleString("es")} ${n === 1 ? "edición sin enviar" : "ediciones sin enviar"}.`,
      sendWithPublish: "Enviar con Publicar",

      basePending: (locale: string): string =>
        `El idioma base va a cambiar a ${locale}. ` +
        "El cambio se aplica en la próxima sincronización desde el flujo de trabajo de GitHub Actions de tu repositorio — el botón Sincronizar no lo aplica. " +
        "Esa sincronización espera mientras haya ediciones sin enviar, así que publícalas primero.",
    },

    empty: {
      notReady: "Todavía no hay nada que traducir",
      noKeys: {
        description: "Los textos que tus desarrolladores añadan al repositorio aparecen aquí después de la próxima sincronización.",
      },
    },

    publish: {
      button: "Publicar",
      unsentCount: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "edición sin enviar" : "ediciones sin enviar"}`,
      viewResult: "Ver resultado",
      viewLink: "Ver pull request",
      nothing: "No hay nada que enviar — todas las ediciones ya se enviaron.",
      paused: "Publicar no está disponible en este momento.",

      previewTitle: (n: number): string => `Publicar ${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"}`,
      previewIntro: (repo: string): string =>
        `Todo lo que editaste va a ${repo} en una sola pull request.`,
      previewIntroPartial: (repo: string): string =>
        `Las ediciones que se pueden enviar van a ${repo} en una sola pull request.`,
      same: {
        undoes: (n: number): string => `Deshace el cambio de #${n}`,
        already: "Ya está en el repositorio",
        closesTitle: (n: number): string => `Publicar cierra la pull request #${n}`,
        closesBody: (n: number, branch: string): string =>
          `Todas las ediciones de aquí vuelven a coincidir con ${branch}, así que a #${n} no le queda nada que fusionar. Malmoi la cierra con un comentario que explica el motivo.`,
        closeAction: (n: number): string => `Cerrar la pull request #${n}`,
        nothingTitle: (branch: string): string => `Nada difiere de ${branch}`,
        nothingBody: "Todas las ediciones de aquí ya coinciden con el repositorio, así que no se abre ninguna pull request. Publicar las marca como enviadas.",
        action: "Publicar",
      },
      nothingSendable: {
        title: "Todavía no se puede enviar nada",
        body: "Cada edición sin enviar está esperando su archivo de idioma o su clave, así que ninguna pull request cambiaría.",
      },
      previewCounts: (n: number, keys: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"} en ${keys.toLocaleString("es")} ${keys === 1 ? "clave" : "claves"}.`,
      previewSummary: (n: number, keys: number, files: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"} · ${keys.toLocaleString("es")} ${keys === 1 ? "clave" : "claves"} · ${files.toLocaleString("es")} ${files === 1 ? "archivo" : "archivos"}`,
      changes: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"}`,
      otherFile: {
        label: "Sin ediciones sin enviar",
        body: "Este archivo se reescribe a partir de las traducciones actuales de Malmoi. Las claves quitadas del código desaparecen, y los valores de una pull request anterior que no se fusionó vuelven a salir.",
      },
      fileSummary: (n: number, keys: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"} · ${keys.toLocaleString("es")} ${keys === 1 ? "clave" : "claves"}`,
      key: "Clave",
      locale: "Idioma",
      value: "Valor",
      beforeLabel: "En el repositorio",
      afterLabel: "Tu edición",
      truncated: (n: number): string =>
        `${n.toLocaleString("es")} más no aparecen aquí. Publicar los envía todos.`,
      withoutFile: (n: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "edición no aparece" : "ediciones no aparecen"} porque el archivo de idioma todavía no está en el repositorio. ${n === 1 ? "Se queda" : "Se quedan"} aquí hasta que exista el archivo.`,
      withoutKey: (n: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "edición no aparece" : "ediciones no aparecen"} porque ${n === 1 ? "su clave no está" : "sus claves no están"} en el archivo de idioma. ${n === 1 ? "Se queda" : "Se quedan"} aquí hasta que el archivo tenga ${n === 1 ? "la clave" : "esas claves"}.`,
      withheld: {
        file: (n: number): string =>
          `${n.toLocaleString("es")} ${n === 1 ? "edición no se envió" : "ediciones no se enviaron"} porque el archivo de idioma no está en el repositorio. ${n === 1 ? "Se queda" : "Se quedan"} aquí hasta que exista el archivo.`,
        key: (n: number): string =>
          `${n.toLocaleString("es")} ${n === 1 ? "edición no se envió" : "ediciones no se enviaron"} porque ${n === 1 ? "su clave no está" : "sus claves no están"} en el archivo de idioma. ${n === 1 ? "Se queda" : "Se quedan"} aquí hasta que el archivo tenga ${n === 1 ? "la clave" : "esas claves"}.`,
        editor: "Pide ayuda a un propietario del proyecto.",
        owner: {
          file: "Añade el archivo al repositorio o usa Revertir a lo último enviado.",
          key: "Usa Revertir a lo último enviado o vuelve a añadir las claves al archivo de idioma.",
          fileNoRevert: "Añade el archivo al repositorio o descarta las ediciones con Sincronizar.",
          keyNoRevert: "Vuelve a añadir las claves al archivo de idioma o descarta las ediciones con Sincronizar.",
        },
      },

      prOpen: {
        title: (n: number): string => `#${n} está abierta — esto reemplaza lo que contiene`,
        body: (n: number, changes: number): ReactNode => (
          <>
            No se abre una segunda pull request. #{n} contendrá{" "}
            <span className="text-foreground">todo lo que está sin enviar</span>, no solo{" "}
            {changes === 1 ? "este cambio" : `estos ${changes.toLocaleString("es")}`}.
          </>
        ),
      },
      prNone: {
        title: (repo: string): string => `Se abre una nueva pull request en ${repo}`,
        body: (changes: number): string =>
          changes === 1
            ? "No hay nada abierto ahora mismo, así que este cambio sale por su cuenta."
            : `No hay nada abierto ahora mismo, así que estos ${changes.toLocaleString("es")} cambios salen por su cuenta.`,
      },
      prUnknown: {
        title: "No se pudo comprobar si hay una pull request abierta",
        body: "Si ya hay una abierta, publicar reemplaza lo que contiene en lugar de abrir una segunda.",
      },
      openPr: "Abrir pull request",
      replacePr: (n: number): string => `Reemplazar la pull request #${n}`,

      progressTitle: (n: number): string => `Publicando ${n.toLocaleString("es")} ${n === 1 ? "cambio" : "cambios"}`,
      progressDescription:
        "Escribiendo los archivos de traducción y abriendo una pull request. Normalmente tarda unos segundos.",
      progress: (branch: string): readonly string[] => [
        "Generando los archivos de traducción",
        `Haciendo commit en ${branch}`,
        "Abriendo la pull request",
      ],
      leave: "Salir de esta página no lo detiene.",

      created: "Enviado a revisión",
      createdDescription: (n: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "cambio está" : "cambios están"} en una pull request. ${n === 1 ? "Llega" : "Llegan"} al producto cuando alguien del equipo la fusione.`,
      prMeta: (n: number, files: number): string =>
        `Pull request #${n} · ${files.toLocaleString("es")} ${files === 1 ? "archivo modificado" : "archivos modificados"}`,
      openedJustNow: "Abierta ahora mismo",
      holdsEverything: "Contiene todo lo que está sin enviar",
      prState: "Abierta",
      accessNote:
        "Editar o cerrar esta pull request se hace en GitHub. Si no tienes acceso ahí, pide ayuda a un propietario del proyecto.",

      updated: "Tu pull request anterior ahora contiene esto",
      updatedDescription: (n: number, changes: number): string =>
        `#${n} seguía abierta, así que Malmoi reemplazó su contenido en lugar de abrir una segunda. Ahora contiene todo lo que está sin enviar, no solo ${changes === 1 ? "el cambio de hoy" : `los ${changes.toLocaleString("es")} de hoy`}.`,
      replacedTitle: "La rama se reemplazó, no se amplió",
      replacedBody: (branch: string, base: string): ReactNode => (
        <>
          {branch} siempre contiene{" "}
          <span className="text-foreground">un solo commit sobre {base}</span>, así que esta pull request es una
          instantánea de todo lo que está sin enviar — no un historial de lo que se añadió desde entonces.
        </>
      ),
      tellReviewer: (n: number): string =>
        `Si #${n} lleva un tiempo esperando, quizá convenga avisar al revisor de que cambió.`,

      noChanges: "Nada cambió en los archivos",
      noChangesDescription:
        "Tus ediciones ya estaban en el repositorio, así que no hizo falta ninguna pull request.",
      noChangesBody: (branch: string): ReactNode => (
        <>
          Malmoi comparó lo que iba a escribir con{" "}
          <span className="text-foreground">{branch}</span> y ambos resultaron idénticos. Esto
          ocurre cuando los mismos valores se sincronizaron desde el repositorio, o cuando una edición se deshizo
          antes de enviarla.
        </>
      ),
      inLogs: "Queda registrado en Registros como una ejecución sin nada que enviar.",
      close: "Cerrar",

      notSent: "Excluido — algunos valores no se pueden escribir en los archivos",
      notSentDescription:
        "Malmoi se detuvo antes de escribir en el repositorio, porque estos valores se habrían quedado fuera. Tus ediciones siguen guardadas aquí.",
      closedPr: {
        description: (branch: string): string => `Tus ediciones ahora coinciden con ${branch}, así que se cerró la pull request anterior.`,
        line: (n: number, branch: string): string => `La pull request #${n} se cerró porque ya no tiene nada que difiera de ${branch}.`,
        owner: "La próxima publicación con cambios abre una nueva.",
        editor: "La próxima publicación con cambios abre una nueva. Si debía seguir abierta, pide ayuda a un propietario del proyecto.",
        view: (n: number): string => `Ver #${n}`,
      },
      withheldDescription: {
        withheld: "No se escribió nada en el repositorio. Estas ediciones siguen guardadas aquí hasta que se puedan enviar.",
        noChanges: "No se escribió nada en el repositorio. Tus otras ediciones ya coincidían con él, y estas siguen guardadas aquí hasta que se puedan enviar.",
      },
      notWritten: "Excluidas",
      warnings: (n: number): string =>
        `${n.toLocaleString("es")} ${n === 1 ? "advertencia" : "advertencias"} · los valores siguen guardados en Malmoi`,
      stillHere: "Estos valores se quedan en Malmoi y saldrán cuando los archivos puedan contenerlos.",

      configError: "No se pudo acceder al repositorio",
      configErrorDescription: (repo: string, branch: string): string =>
        `Algo de ${repo} tiene que cambiar antes de que ${branch} pueda recibir esto. Tus ediciones siguen guardadas aquí.`,
      wontHelp: "Volver a intentarlo no servirá",
      repository: "Repositorio",
      baseBranch: "Rama base",
      failedAt: "Falló en",
      reference: "Referencia",
      sendReference: "¿No eres propietario del proyecto? Comparte la referencia de arriba con uno — también está en Registros.",
      settings: "Abrir configuración",
      signIn: "Iniciar sesión",

      transientError: "GitHub no respondió",
      transientErrorDescription:
        "La solicitud a GitHub falló a mitad de camino. Tus ediciones siguen guardadas aquí.",
      transientErrorBody: (): ReactNode => (
        <>
          Esto suele ser temporal, y volver a intentarlo es seguro: Malmoi{" "}
          <span className="font-medium">reemplaza la misma rama</span> en lugar de añadirle cambios, así que
          un segundo intento no puede dejar dos copias.
        </>
      ),
      retry: "Intentar de nuevo",
      lostResponse: "La respuesta no llegó",
      lostResponseDescription:
        "Es posible que Malmoi haya enviado tus cambios de todos modos. Tus ediciones siguen guardadas aquí.",

      notStarted: "No se envió nada. Tus ediciones están a salvo.",
      refused: "No se pudo iniciar la publicación. Vuelve a abrir este proyecto desde tu lista de proyectos.",
      baseFileMissing: {
        title: "El archivo del idioma base no está en el repositorio",
        description: (path: string, branch: string): string =>
          `Malmoi lo busca en ${path} en ${branch}, y no se envió nada mientras falte.`,
        owner: "Restaura el archivo en esa rama, o cambia la ruta o la rama en Configuración.",
        editor: "Pide a un propietario del proyecto que restaure el archivo o cambie la ruta en Configuración.",
      },
      baseFileUnreadable: {
        title: "No se puede leer el archivo del idioma base",
        description: (path: string, branch: string): string =>
          `Malmoi no pudo analizar ${path} en ${branch}, así que no puede saber qué claves tiene el archivo. No se envió nada.`,
        owner: "Corrige el archivo en esa rama, o cambia la ruta o la rama en Configuración.",
        editor: "Pide a un propietario del proyecto que corrija el archivo o cambie la ruta en Configuración.",
      },
      unknownDelivery: "No pudimos confirmar si tus cambios se enviaron.",

      alreadyRunning: "Alguien está publicando ahora mismo",
      alreadyRunningBody:
        "Otra ejecución empezó hace un momento. Espera a que termine — tus cambios se incluirán si todavía no los leyó, y se enviarán la próxima vez si ya los leyó.",
      tooSoon: "Un momento",
      tooSoonBody:
        "Malmoi espera un momento entre pull requests para que el repositorio no reciba dos seguidas.",
      wait: (seconds: number): string => `Vuelve a intentarlo en ${seconds.toLocaleString("es")} s`,

      previewFailed: "No pudimos leer lo que se enviaría",
      previewFailedDescription: (branch: string): string =>
        `Malmoi lee los archivos de traducción en ${branch} para mostrar lo que cambiarían tus ediciones. Esa lectura no llegó.`,
      previewFailedTitle: (branch: string): string => `No pudimos leer los archivos en ${branch}`,
      previewFailedBody: (n: number): string =>
        `${n === 1 ? "Tu cambio sigue" : `Tus ${n.toLocaleString("es")} cambios siguen`} aquí. Publicar queda desactivado hasta que se pueda mostrar esta lista — enviar sin ella se saltaría el único paso que dice qué reemplaza una pull request.`,
      previewFailedHint:
        "Si esto sigue pasando, revisa la conexión con el repositorio — un propietario del proyecto puede comprobarla en Configuración.",
    },

  },

  sources: {
    screenLoading: "Cargando fuentes…",
    title: "Fuentes",
    count: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "fuente" : "fuentes"}`,
    languageCount: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "idioma" : "idiomas"}`,
    unmanaged: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "entrada no es" : "entradas no son"} texto simple y ${n === 1 ? "se queda" : "se quedan"} en el código.`,
    add: "Añadir fuentes",
    open: "Abrir traducciones",
    openLanguage: "Abrir",
    details: "Detalles de la fuente",
    files: "Archivos",
    path: "Patrón de ruta",
    format: "Formato de archivo",
    repository: "Repositorio / rama",
    notConfigured: "Sin configurar",
    unknownFormat: "Formato no reconocido",
    status: "Estado de sincronización",
    languages: "Idiomas",
    retry: "Intentar de nuevo",
    loading: "Cargando los detalles de la fuente…",
    unavailable: "No pudimos cargar esta fuente. Vuelve a intentarlo.",
    rejected: "Esta fuente no está disponible para ti. Cierra esta ventana y actualiza la página.",
    latestFailed: "El cambio se completó, pero no pudimos cargar el estado más reciente. Vuelve a cargar los detalles.",
    emptyTitle: "Todavía no hay fuentes",
    emptyOwner: "Añade los archivos que contienen tus textos, y Malmoi los leerá desde tu rama base. Las claves y los idiomas aparecen aquí después de la primera sincronización.",
    emptyEditor: "Un propietario del proyecto añade los archivos de traducción. Hasta entonces no hay nada que traducir — verás los idiomas aquí cuando termine la primera sincronización.",
    ownerOnly: "Solo los propietarios del proyecto pueden añadir fuentes.",
    askOwner: "Pide a un propietario del proyecto que ejecute la primera sincronización.",
    askOwnerRerun: "Pide a un propietario del proyecto que vuelva a ejecutar la sincronización.",
    reconnectOwner: "Vuelve a conectar el repositorio en Configuración y luego inténtalo de nuevo.",
    reconnectEditor: "Pide a un propietario del proyecto que vuelva a conectar el repositorio.",
    firstImport: "La primera sincronización todavía no terminó. Añadir una fuente no conecta su flujo de trabajo de CI.",
    noLanguages: "No hay idiomas activos disponibles. Restaura un idioma en el repositorio y vuelve a sincronizar.",
    applied: "Aplicado",
    requested: "Solicitado",
    waiting: "Pendiente de aplicar",
    pendingHelp: "Si tu CI pasa el idioma base de esta fuente, actualiza su entrada en el flujo de trabajo al idioma solicitado.",
    orphanReason: "Este idioma se quitó del repositorio.",
    orphanStrip: (code: string): string => `${code} se quitó del repositorio.`,
    orphanStripRest: (translations: number, active: number): string =>
      `Las ${translations.toLocaleString("es")} traducciones se conservan y quedan en solo lectura. Vuelve cuando el idioma esté otra vez en el repositorio y se ejecute la próxima sincronización. No se cuenta entre los ${active.toLocaleString("es")} idiomas activos.`,
    statusHelp: "Se actualiza con las sincronizaciones desde tu repositorio.",
    baseHelp: "El idioma base decide qué claves existen en esta fuente.",
    languagesHelp: "Los idiomas vienen del repositorio. Añade o quita los archivos allí.",
    baseRow: "Origen de todas las claves de este archivo",
    needReview: (count: number): string => `${count.toLocaleString("es")} por revisar`,
    missingRepo: "Quitado del repositorio",
    editorBase: "Solo los propietarios del proyecto pueden cambiar el idioma base de una fuente.",
    readOnlyNote: "El nombre, la ruta y el formato de archivo se leen del repositorio.",
    started: "iniciada",
    addedAgo: "añadida",
    lastSuccess: "Última sincronización correcta",
    archivedOwner: "Las traducciones se conservan. Las sincronizaciones están detenidas, y las fuentes no se pueden ver ni cambiar hasta que se restaure el proyecto.",
    archivedEditor: "Las traducciones se conservan. Un propietario del proyecto puede restaurarlo — entonces vuelven las fuentes y las traducciones.",
    discardTitle: "¿Descartar el cambio del idioma base?",
    discardBody: (requested: string, applied: string): string =>
      `Elegiste ${requested} pero no lo guardaste. El idioma base sigue siendo ${applied}.`,
    keepEditing: "Seguir editando",
    discardChange: "Descartar cambio",
    importedSummary: (keys: number, locales: number): string =>
      `${keys.toLocaleString("es")} claves activas en ${locales.toLocaleString("es")} ${locales === 1 ? "idioma" : "idiomas"}, leídas del repositorio.`,
    notImportedHelp: "Todavía no llegó ninguna clave ni ningún idioma de este archivo. Añadir una fuente no conecta la CI por sí solo — el flujo de trabajo de tu repositorio envía los textos.",
    workflow: "Actualiza el flujo de trabajo en Configuración para incluir las fuentes añadidas.",
    addedCount: (count: number): string => `${count.toLocaleString("es")} ${count === 1 ? "fuente añadida" : "fuentes añadidas"}`,
    addedOne: (count: number): string => `${count.toLocaleString("es")} claves sincronizadas`,
    addedFailed: "sincronización fallida",
    resultKeep: "Esto se queda hasta que lo cierres, para que el resultado no desaparezca cuando cambie un estado más abajo.",
  },

  locales: {
    base: "Base",
    orphaned: {
      badge: "Quitado del repositorio",
    },
    empty: {
      description: "Aparecen después de que la primera sincronización lea tus archivos de traducción.",
    },
    field: {
      label: "Idioma base",
      help: "El idioma en el que están escritos tus textos de origen. Cambiarlo surte efecto en la próxima sincronización desde el flujo de trabajo de GitHub Actions de tu repositorio, no con el botón Sincronizar — actualiza el valor base-locale: del flujo de trabajo para que coincida.",
      save: "Guardar",
      saving: "Guardando…",
      saved: "Guardado",
      failed: "No pudimos guardar esto. Vuelve a intentarlo dentro de un momento.",
      noLocales: "Puedes configurarlo después de la primera sincronización.",
    },
    pending: {
      copy: "Copiar línea",
    },
  },
  members: {
    loading: "Cargando miembros…",
    seats: (n: number, limit: number): string => `${n} de ${limit} plazas`,
    seatsFull: (limit: number): string => `${limit} de ${limit} plazas — quita a alguien para invitar`,
    ownerOnly: "Solo los propietarios del proyecto pueden invitar o cambiar roles",
    count: (n: number): string => `${n} ${n === 1 ? "miembro" : "miembros"}`,
    unreadableLabel: UNAVAILABLE,
    unreadableHint: "No se pudieron descifrar el nombre ni la dirección de esta persona. El rol y la fecha de incorporación no se ven afectados.",
    roleLocked: {
      pending: (role: string): string =>
        `${role}, fijado al crear la invitación. Revócala e invita de nuevo para cambiarlo.`,
      editor: (role: string): string => `${role}, solo los propietarios del proyecto pueden cambiar roles.`,
    },
    joined: (when: string): string => `Se unió ${when}`,
    unnamed: "Sin nombre",
    you: "Tú",
    changeRole: (who: string): string => `Cambiar el rol de ${who}`,
    remove: "Quitar",
    removeLabel: (who: string): string => `Quitar a ${who}`,
    removeConfirm: "Quitar miembro",
    removed: (who: string): string => `Se quitó a ${who}`,
    confirmRemove: (who: string): string => `¿Quitar a ${who} de este proyecto?`,
    confirmRemoveHint: "Pierde el acceso de inmediato. Sus traducciones se conservan — el historial mantiene su nombre.",
    cancel: "Cancelar",
    changeFailed: "No pudimos aplicar ese cambio. Actualiza la página y vuelve a intentarlo.",
    confirmRole: (who: string, role: string): string => `¿Cambiar el rol de ${who} a ${role}?`,
    confirmRoleHint: "El nuevo rol se aplica de inmediato.",
    confirmSelfDemote: "Dejarás de poder gestionar miembros y configuración de inmediato, y solo un propietario del proyecto puede devolvértelo.",
    confirmRoleAction: "Cambiar rol",
    changeUnconfirmed: "No pudimos confirmar ese cambio. Actualiza para ver los miembros actuales.",

    invite: {
      open: "Invitar miembro",
      title: "Invitar miembros",
      description: "Envía invitaciones por correo electrónico y elige un rol para cada persona. Usa la dirección con la que inician sesión — en GitHub, su correo principal.",
      columns: { email: "Correo electrónico", role: "Rol" },
      placeholder: "nombre@empresa.com",
      roleHint: {
        EDITOR: "Puede traducir y publicar",
        OWNER: "También gestiona miembros y configuración",
      },
      roleFor: (who: string): string => `Rol de ${who}`,
      removeRecipient: (who: string): string => `Quitar a ${who}`,
      emptyRecipient: (n: number): string => `destinatario ${n.toLocaleString("es")}`,
      addAnother: "Añadir otro",
      send: (n: number): string => (n === 0 ? "Enviar invitaciones" : n === 1 ? "Enviar invitación" : `Enviar ${n.toLocaleString("es")} invitaciones`),
      sending: "Enviando invitaciones…",
      nothingSent: "Esta solicitud no envió nada. Corrige o quita la fila resaltada y vuelve a enviar.",
      seatsUsed: (n: number, limit: number): string => `${n} de ${limit} plazas ocupadas`,
      rowError: {
        invalidEmail: "Esto no parece una dirección de correo electrónico.",
        invalidRole: "Elige un rol para esta dirección.",
        duplicate: (row: number): string => `Ya está en la fila ${row.toLocaleString("es")}. Quita esta.`,
        roleConflict: (row: number, role: string): string => `También está en la fila ${row.toLocaleString("es")} como ${role}. Deja un solo rol para esta dirección.`,
      },
      alreadyMember: "Ese correo ya es miembro de este proyecto.",
      limit: {
        title: "Esto superaría el límite de invitaciones",
        project: (limit: number, used: number, n: number, time: string): string =>
          `Un proyecto puede crear ${limit.toLocaleString("es")} invitaciones por hora, y en la última hora se ${used === 1 ? "creó" : "crearon"} ${used.toLocaleString("es")}. Puedes enviar ${n === 1 ? "esta" : `estas ${n.toLocaleString("es")}`} después de las ${time}.`,
        address: (email: string, time: string): string => `${email} fue invitado hace menos de un minuto. Puedes volver a enviar después de las ${time}.`,
        user: (limit: number, used: number, n: number, time: string): string =>
          `Puedes crear ${limit.toLocaleString("es")} invitaciones por hora entre todos los proyectos, y creaste ${used.toLocaleString("es")} en la última hora. Puedes enviar ${n === 1 ? "esta" : `estas ${n.toLocaleString("es")}`} después de las ${time}.`,
      },
      tooMany: (limit: number): string => `Puedes invitar hasta ${limit.toLocaleString("es")} personas a la vez.`,
      unconfirmed: {
        title: "No pudimos confirmar el envío del correo",
        body: "Es posible que se hayan enviado algunas invitaciones. Volver a enviar reemplaza los enlaces anteriores.",
      },
      sendFailed: "No se pudieron enviar los correos de invitación. Volver a enviar reemplaza los enlaces de este intento.",
      emailUnavailable: "El correo electrónico no está disponible ahora. Vuelve a intentarlo más tarde.",
      failed: "No pudimos enviar las invitaciones. Actualiza la página y vuelve a intentarlo.",
      sentToast: (n: number): string => (n === 1 ? "Invitación enviada" : `Invitaciones enviadas a ${n.toLocaleString("es")} personas`),
    },

    pending: {
      title: "Invitaciones pendientes",
      count: (n: number): string => `${n.toLocaleString("es")} ${n === 1 ? "invitación" : "invitaciones"}`,
      expires: (when: string): string => `Caduca ${when}`,
      invitedBy: (who: string): string => `Invitado por ${who}`,
      unknownInviter: "un miembro",
      resend: "Reenviar",
      resendLabel: (who: string): string => `Reenviar la invitación a ${who}`,
      resentToast: (who: string): string => `Invitación reenviada a ${who}`,
      resendFailed: (who: string, time: string): string => `No se pudo reenviar la invitación a ${who}. Puedes volver a intentarlo después de las ${time}.`,
      resendLimited: (who: string, time: string): string => `${who} fue invitado hace menos de un minuto. Puedes reenviar después de las ${time}.`,
      resendProjectLimited: (who: string, limit: number, time: string): string =>
        `No se pudo reenviar a ${who}: este proyecto ha creado ${limit.toLocaleString("es")} invitaciones en la última hora. Puedes reenviar después de las ${time}.`,
      resendUserLimited: (who: string, limit: number, time: string): string =>
        `No se pudo reenviar a ${who}: has creado ${limit.toLocaleString("es")} invitaciones entre todos los proyectos en la última hora. Puedes reenviar después de las ${time}.`,
      resendUnconfirmed: (who: string): string => `No pudimos confirmar el correo a ${who}. Es posible que se haya enviado — reenviar reemplaza ese enlace.`,
      resendUnavailable: (who: string): string => `No se pudo reenviar a ${who}. El correo electrónico no está disponible ahora. Vuelve a intentarlo más tarde.`,
      gone: (who: string): string => `La invitación a ${who} ya no está pendiente.`,
      resendError: (who: string): string => `No se pudo reenviar la invitación a ${who}. Actualiza la página y vuelve a intentarlo.`,
      revoke: "Revocar",
      revokeLabel: (who: string): string => `Revocar la invitación de ${who}`,
      revoked: (who: string): string => `Se revocó la invitación de ${who}`,
      revokeFailed: "No pudimos revocar esa invitación. Actualiza la página y vuelve a intentarlo.",
      confirmRevoke: (who: string): string => `¿Revocar la invitación de ${who}?`,
      confirmRevokeHint: "El enlace deja de funcionar de inmediato. Puedes volver a invitar a la misma dirección.",
      confirmRevokeAction: "Revocar invitación",
      revokeUnconfirmed: "No pudimos confirmar que la invitación se revocó. Actualiza para comprobarlo.",
      empty: {
        title: "No hay invitaciones pendientes",
        description: "Todas las personas que invitaste se unieron, o sus enlaces caducaron.",
      },
    },
  },

  settings: {
    loading: "Cargando configuración…",
    general: {
      title: "General", thumbnail: "Miniatura", name: "Nombre", address: "Dirección",
      upload: "Subir", remove: "Quitar",
      caption: "PNG o JPEG, hasta 3 MB.",
      emptyName: "Escribe un nombre para el proyecto.", longName: "Usa 200 caracteres o menos.",
      busy: "Actualizando la miniatura…",
    },
    sources: {
      add: "Añadir fuentes", locked: "Ya es una fuente",
      confirm: "Añadir las fuentes seleccionadas",
      notImported: "Sin sincronizar todavía", importing: "Sincronizando…", imported: "Sincronizada", failed: "Sincronización fallida",
      failedAfter: "Sincronización fallida", retry: "Ejecutar la primera sincronización", rerun: "Vuelve a ejecutar el flujo de trabajo en GitHub.",
      unknown: "No pudimos confirmar el resultado. Revisa la lista de fuentes antes de volver a intentarlo.",
      nothingAdded: "No se añadió nada. Tu selección sigue aquí.",
      description: "Elige archivos de traducción de tu repositorio. Las fuentes existentes siguen seleccionadas.",
      selectHelp: "Selecciona al menos una fuente nueva para añadir.",
      previewNone: "Indica una ruta y Malmoi mostrará las claves que encuentre. Si ningún archivo coincide, no se añade nada.",
      blocked: {
        detecting: "Buscando archivos de traducción en el repositorio.",
        detectFailed: "No pudimos cargar la lista de archivos. Vuelve a intentarlo arriba.",
        conflict: "Algunos de los archivos seleccionados ya pertenecen a otra fuente.",
        base: "Elige un idioma base para cada fuente seleccionada.",
      },
      manualReason: "Escribe una ruta de archivo y un idioma base para comprobar.",
    },
    ci: { description: "Tu flujo de trabajo envía las cadenas de origen a Malmoi con cada merge.", title: "Integración con CI", workflow: "Archivo del flujo de trabajo", sourcesLead: "Un solo flujo de trabajo cubre todas las fuentes. Añade o cambia fuentes en", stale: "Algunas fuentes aún no se han sincronizado. Comprueba que el flujo de trabajo las incluya.",
      noSources: "Añade una fuente para obtener el flujo de trabajo." },
    archivedReason: "Restaura este proyecto para cambiar su configuración.",
    recovery: "Las sincronizaciones siguen funcionando. Gestiona tu autorización de GitHub en Cuenta para volver a conectar este repositorio o añadir fuentes.",
    accountLink: "Cuenta",
    installed: "La Malmoi GitHub App está instalada en este repositorio.",
    openRepo: "Abrir en GitHub",

    repository: {
      disconnected: "Desconectado", notConnected: "No conectado", unknown: "No se pudo comprobar", wrongRepository: "Repositorio incorrecto",
      movedHint: "Vuelve a conectar para guardar el nuevo nombre. Mientras tanto, las sincronizaciones siguen funcionando.",
      paused: "Las sincronizaciones y publicaciones se detienen hasta que se vuelva a conectar. Todo lo ya traducido está a salvo.",
      title: "Repositorio",
      connect: "Conectar",
      reconnect: "Volver a conectar",
      connectFailed: "No pudimos iniciar la conexión. Vuelve a intentarlo en un momento.",
      health: {
        ok: "Conectado",
        "not-connected": "Todavía no hay ninguna instalación conectada.",
        "app-uninstalled": "La app se eliminó o se suspendió, o se revocó su acceso a este repositorio.",
        "installation-changed": "La app se reinstaló — vuelve a conectarla.",
        moved: (fullName: ReactNode): ReactNode => <>Este repositorio se trasladó a {fullName}</>,
        "repo-replaced": "Esta dirección ahora contiene un repositorio distinto del que se conectó a este proyecto. Compruébalo en GitHub — si el repositorio realmente se reemplazó, crea un proyecto nuevo para él.",
        unknown: "No podemos comprobarlo ahora. Vuelve a abrir esta página en un momento.",
        install: "Instalar la app",
        installHint: "Instálala, vuelve aquí y conéctala de nuevo.",
      },

      fields: {
        branch: "Rama base",
        branchHelp: "Las sincronizaciones leen esta rama, y las pull requests se abren contra ella.",
        branchDisconnected: "Vuelve a conectar el repositorio para cambiar la rama base.",
        save: "Guardar",
      saved: "Guardado",
        failed: "No pudimos guardarlo. Vuelve a intentarlo en un momento.",
      },

    },

    status: {
      unconfirmed: "No pudimos confirmar si la sincronización terminó.",
    },

    token: {
      title: "Token de push",
      description: (secret: ReactNode): ReactNode => (
        <>
          Rotarlo invalida el token actual de inmediato — la CI seguirá fallando hasta que actualices el
          secreto {secret} del repositorio.
        </>
      ),
      rotate: "Rotar token",
      disconnected: "Vuelve a conectar el repositorio para rotar el token.",
      warning: "No volverás a verlo cuando salgas de esta página. Si lo pierdes, vuelve a rotarlo.",
      failed: "No pudimos rotar el token. Vuelve a intentarlo en un momento.",
      unconfirmed: "No pudimos confirmar la rotación. Es posible que el token actual ya no sea válido — vuelve a rotarlo para obtener uno nuevo.",
      confirmTitle: "¿Rotar el token de push?",
      confirmBody: "El token actual deja de funcionar de inmediato, incluido el que acabas de copiar. La CI fallará hasta que el secreto PUSH_TOKEN del repositorio tenga el nuevo.",
      confirmAction: "Rotar y mostrar el nuevo token",
    },

    workflow: {
      saveAs: "Guarda este archivo en tu repositorio.",
      hookHint: (hook: ReactNode, wrapper: ReactNode, doc: ReactNode): ReactNode => (
        <>
          Los repositorios que leen las traducciones mediante un hook ({hook}) también necesitan la entrada {wrapper} — consulta {doc}.
        </>
      ),
      hookDoc: "Añadir el flujo de trabajo",
    },

    account: {
      connect: "Autorizar la GitHub App",
      reconnect: "Volver a autorizar la GitHub App",
      unavailable: "No pudimos cargar tu cuenta. Vuelve a abrir esta página en un momento.",
      disconnect: "Desconectar",
      disconnectLabel: "Desconectar la GitHub App",
      disconnectConfirm: "Desconectar app",
      disconnectFailed: "No pudimos desconectar. Vuelve a intentarlo en un momento.",
    },
  },

  invite: {
    title: "Tienes una invitación",
    unavailableTitle: "Invitación no disponible",
    signInHint: (email: string): string => `Inicia sesión con la cuenta de ${email} para aceptar.`,
    accept: "Aceptar invitación",
    otherAccount: "Iniciar sesión con otra cuenta",
    openProject: "Abrir proyecto",
    openProjects: "Ir a tus proyectos",
    signIn: "Iniciar sesión",
    sentTo: (email: string): string => `Esta invitación se envió a ${email}.`,
  },

  link: {
    providers: { github: "GitHub", google: "Google" },
    title: "Este correo ya tiene una cuenta",
    description: (pending: string, have: string): string =>
      `Acabas de iniciar sesión con ${pending}, pero esta dirección se creó con ${have}.`,
    confirm: (have: string): string => `Confirmar con ${have}`,
    joined: (month: string): string => `Se unió en ${month}`,
    footnote: "Añadiremos este método de inicio de sesión a esa cuenta. Tus proyectos y traducciones se quedan donde están.",
    methods: {
      title: "Métodos de inicio de sesión",
      count: (connected: number, total: number): string => `${connected} de ${total}`,
      connect: "Conectar",
      connectLabel: (provider: string): string => `Conectar ${provider} como método de inicio de sesión`,
      connected: "Conectado",
      notConnected: "No conectado",
      disconnect: "Desconectar",
      disconnectLabel: (provider: string): string => `Desconectar ${provider} como método de inicio de sesión`,
      lastMethod: "Es tu única forma de iniciar sesión.",
      confirmDisconnect: (provider: string): string => `¿Desconectar ${provider}?`,
      disconnectConfirm: "Desconectar método de inicio de sesión",
      confirmHint: "No podrás iniciar sesión con él hasta que vuelvas a iniciar sesión con él en esta dirección.",
      unlinkUnconfirmed: "No pudimos confirmar ese cambio. Actualiza para ver tus métodos de inicio de sesión.",
    },
  },
  errors: {
    upload: {
      "too-large": "Esa foto supera los 3 MB. Elige una más pequeña.",
      "too-many-pixels": "Las dimensiones de esa foto son demasiado grandes. Elige una con menos píxeles.",
      "unsupported-type": "Ese archivo no es un PNG o JPEG válido. Elige otra foto.",
      "not-a-file": "No se recibió ninguna foto. Elige un archivo y vuelve a intentarlo.",
      empty: "Ese archivo está vacío. Elige otro.",
      unavailable: "No se pudo guardar esa foto. Vuelve a intentarlo en un momento.",
      fallback: "No se pudo usar esa foto. Elige un PNG o JPEG de hasta 3 MB.",
    },
    connectMethod: {
      connected: "Método de inicio de sesión añadido. Puedes usarlo la próxima vez que inicies sesión.",
      "email-mismatch": "El correo no coincide con esta cuenta. Prueba con una cuenta que tenga el mismo correo verificado.",
      "already-connected": "Este método de inicio de sesión ya está añadido. Puedes usarlo para iniciar sesión.",
      "taken-by-other": "Este método de inicio de sesión pertenece a otra cuenta de Malmoi. Prueba con otra cuenta.",
      expired: "Esta solicitud caducó o fue reemplazada. Empieza de nuevo desde la lista de métodos de inicio de sesión.",
      cancelled: "Se canceló la adición del método de inicio de sesión. Empieza de nuevo cuando quieras.",
      unverified: "No se proporcionó ningún correo verificado. Verifica tu correo con el proveedor antes de volver a intentarlo.",
      "wrong-user": "Tu sesión cambió durante esta solicitud. Empieza de nuevo desde la lista de métodos de inicio de sesión.",
      failed: "No se pudo añadir el método de inicio de sesión. Vuelve a intentarlo en un momento.",
    },
    access: {
      unauthorized: "Tu sesión terminó. Vuelve a iniciar sesión para guardar tu trabajo.",
      forbidden: "No tienes permiso para hacer esto. Pídeselo a un propietario del proyecto.",
      "not-found": "No puedes abrir este proyecto. Revisa tu enlace de invitación.",
      "last-owner": "Un proyecto necesita al menos un propietario. Primero haz propietario a otra persona.",
      "not-member": "Esa persona no es miembro de este proyecto.",
      unavailable: "Algo salió mal. Vuelve a intentarlo en un momento.",
      archived: "Este proyecto está archivado. Un propietario del proyecto puede restaurarlo en Configuración.",
      "owner-limit-reached": (limit: number): string =>
        `Una persona puede ser propietaria de hasta ${limit} proyectos activos, y alguien aquí ya tiene ${limit} o más. Primero tiene que archivar proyectos.`,
    },

    invite: {
      unauthorized: "No has iniciado sesión. Inicia sesión y volverás a este enlace.",
      "not-found": "Esta invitación no existe. El enlace es incorrecto o la invitación fue revocada.",
      expired: "Esta invitación caducó. Pide un enlace nuevo a la persona que te invitó.",
      "already-accepted": "Este enlace ya se usó. Una invitación solo funciona una vez.",
      "email-mismatch": "Inicia sesión con la cuenta que recibió la invitación. La que estás usando no es esa.",
      "already-member": "Ya eres miembro de este proyecto.",
      archived: "Este proyecto está archivado. Pide a la persona que te invitó que lo restaure y vuelve a abrir este enlace.",
      "limit-reached": (limit: number): string =>
        `Ya eres propietario de ${limit} o más proyectos activos. Archiva proyectos hasta tener menos de ${limit} y vuelve a abrir este enlace.`,
      unavailable: "Algo salió mal. Vuelve a intentarlo en un momento.",
      fallback: "No se pudo aceptar la invitación. Pide un enlace nuevo a la persona que te invitó.",
    },

    link: {
      "wrong-account": "Esa es otra cuenta. Elige la cuenta con la que se creó esta dirección y vuelve a intentarlo.",
      "already-linked": "Ese método de inicio de sesión ya está en esta cuenta. Prueba a iniciar sesión con él.",
      invalid: "No se pudo completar esa confirmación. Empiézala de nuevo desde la pantalla de inicio de sesión.",
      cancelled: "Se canceló la confirmación. No cambió nada; vuelve a intentarlo cuando quieras.",
      unavailable: "Algo salió mal. Vuelve a intentarlo en un momento.",
      "last-method": "No puedes desconectar tu único método de inicio de sesión.",
      fallback: "No se pudo completar esa confirmación. Vuelve a intentarlo.",
    },

    signIn: {
      OAuthAccountNotLinked: "Ese correo ya está registrado con otro método de inicio de sesión. Usa el método con el que te registraste.",
      AccessDenied: "No puedes iniciar sesión con esta cuenta. Puede que su correo no esté verificado.",
      Unavailable: "Algo salió mal. Vuelve a abrir esto en un momento.",
      LinkExpired: "Esa confirmación ya no es válida. Vuelve a iniciar sesión para continuar.",
      fallback: "No se pudo iniciar sesión. Vuelve a intentarlo en un momento.",
    },

    connect: {
      "state-mismatch": "No se pudo verificar esa solicitud de conexión. Empiézala de nuevo.",
      "state-expired": "Esa solicitud de conexión caducó. Empiézala de nuevo.",
      "wrong-user": "Empezaste esto con otra cuenta. Vuelve a empezar la conexión.",
      denied: "Se canceló la conexión en GitHub. Empiézala de nuevo para continuar.",
      "exchange-failed": "No se pudo completar la conexión con GitHub. Empiézala de nuevo.",
      "taken-by-other": "Esa cuenta de GitHub ya está conectada a otro usuario. Esa persona puede desconectarla para liberarla.",
      "not-connected": "Primero autoriza la Malmoi GitHub App; usa Autorizar la GitHub App, más abajo.",
      reauthorize: "Tu autorización de la GitHub App caducó. Usa Volver a autorizar la GitHub App.",
      "repo-not-installed": "La app no está instalada en este repositorio. Instálala y vuelve a conectar.",
      "installation-forbidden": "Esta cuenta no tiene acceso a esa instalación. Pide acceso al propietario del repositorio.",
      "repo-forbidden": "Esta cuenta no tiene acceso a ese repositorio. Pide acceso al propietario del repositorio.",
      "repo-read-only": "Esta cuenta solo puede leer ese repositorio. Para conectarlo se necesita acceso de escritura; pídeselo al propietario del repositorio.",
      unavailable: "Algo salió mal. Vuelve a intentarlo en un momento.",
      fallback: "Falló la conexión con GitHub. Vuelve a intentarlo.",
    },

    onboarding: {
      "no-installations": "Tu cuenta de GitHub está conectada. Instala la Malmoi GitHub App en tu cuenta personal o en tu organización para elegir repositorios.",
      "no-repos": "Tu cuenta de GitHub está conectada, pero no hay repositorios disponibles. Elige a qué repositorios puede acceder la Malmoi GitHub App en la configuración de la instalación en GitHub.",
      "no-candidates": "No encontramos archivos de traducción compatibles. Revisa el formato y la ruta de los archivos y vuelve a intentarlo.",
      "tree-truncated": "Este repositorio tiene demasiados archivos para buscar, e indicar la ruta a mano choca con el mismo límite. Malmoi todavía no puede conectar repositorios tan grandes.",
      "base-branch-missing": "No podemos leer la rama predeterminada. Comprueba que el repositorio tenga commits.",
      "key-count-failed": "Número de claves no disponible",
      "manual-no-match": "No hay archivos de ese formato en esa ruta. Revisa la ruta y el formato.",
      "sample-expired": "Esta vista previa caducó. Vuelve a detectar los archivos para verla.",
      "slug-taken": "Esa dirección ya está en uso. Elige otra.",
      "limit-reached": (limit: number): string => `Puedes crear hasta ${limit} proyectos.`,
      "invalid-slug": (max: number): string =>
        `Una dirección puede usar letras minúsculas, números, '-', '.' y '_', hasta ${max} caracteres. 'new' está reservada.`,
      "invalid-branch": "Ese nombre de rama no es válido. Elige otra rama.",
      "sync-branch": "Malmoi publica las traducciones desde esa rama, así que no puede ser la rama base. Elige otra rama.",
      "not-awaiting": "La primera sincronización ya terminó. Volver a ejecutarla aquí sobrescribiría traducciones editadas, así que está bloqueada.",
      "resource-limit": "Estos archivos de traducción son demasiado grandes o tienen demasiados niveles de anidación para sincronizarlos. Reduce su tamaño y vuelve a intentarlo.",
      "ingest-failed": "La primera sincronización falló. Puedes volver a intentarlo desde Fuentes.",
      "not-ready": "Este proyecto aún no está listo. Un propietario del proyecto tiene que terminar de configurarlo.",
      unauthorized: "Tu sesión terminó. Vuelve a iniciar sesión y empieza de nuevo.",
      fallback: "No se pudo crear el proyecto. Empieza de nuevo y vuelve a intentarlo.",
    },

    repositorySettings: {
      "invalid-branch": "Ese no es un nombre de rama válido. No se permiten espacios ni los caracteres ~^:?*[.",
      "sync-branch": "Malmoi publica las traducciones desde esa rama, así que no puede ser la rama base. Elige otra rama.",
      "unknown-locale": "Este repositorio no tiene ningún archivo de traducción para ese idioma.",
      "orphaned-locale": "El archivo de ese idioma ya no está en el repositorio. Primero vuelve a añadirlo.",
    },
  },

  adapterErrors: {
    "parse-failed": "No se pudo analizar el archivo.",
    "parse-crashed": "El analizador falló con este archivo.",
    "root-not-object": "El nivel superior del archivo no es un mapa de claves y valores.",
    "no-default-export": "Este archivo no tiene un objeto como export default.",
    "invalid-chrome-key": "La clave usa caracteres que chrome.i18n no permite (permitidos: A-Z a-z 0-9 _ @).",
    "missing-message-field": "La entrada no tiene el campo 'message'.",
    "value-not-message-object": "El valor no es un objeto { message }.",
    "value-not-string": "El valor no es texto.",
    "value-not-string-or-container": "El valor no es texto, ni un objeto, ni un array.",
    "value-not-string-literal": "El valor no es un literal de texto simple.",
    "shorthand-property": "La propiedad está en forma abreviada, así que no se puede leer su valor; parece una referencia con import.",
    "not-property-assignment": "Esto no es una asignación de propiedad.",
    "duplicate-key": "La clave aparece dos veces, así que uno de los dos valores se pierde.",
    "duplicate-property": "La clave está definida dos veces. Malmoi usa la que edita y deja la otra como está.",
    "key-shadowed": "La clave es el comienzo de una clave más larga, así que no tiene un hueco propio; este valor no se escribió.",
    "write-parse-failed": "No se pudo analizar el archivo, así que se dejó sin tocar.",
    "write-no-default-export": "Este archivo no tiene un objeto como export default, así que se dejó sin tocar.",
    "write-locale-object-missing": "Este idioma no está en el archivo, así que sus traducciones no se escribieron.",
    "write-slot-not-string-literal": "El valor no está en un hueco de texto simple, así que no se escribió.",
    "write-slot-not-scalar": "El valor no está en un hueco de texto simple (es un alias, un mapa o una lista), así que no se escribió.",
    "write-slot-missing": "No hay un hueco para esta clave, así que se omitió; habría que cambiar la estructura del archivo.",
    "original-file-missing": "El archivo original no está en el repositorio, así que este idioma se omitió y no se envió.",
    "download-failed": "No se pudo descargar el archivo.",
    fallback: "No pudimos leer este archivo.",
  },
} satisfies Messages;
