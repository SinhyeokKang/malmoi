# Formatos de archivo compatibles

Malmoi lee y escribe catálogos JSON y YAML, mensajes de extensiones de Chrome y diccionarios de código TypeScript o JavaScript.

## Formatos compatibles {#formats}

Los formatos compatibles son catálogos JSON, catálogos YAML, mensajes de extensiones de Chrome, un diccionario de código por idioma y un diccionario de código que contiene todos los idiomas. Un solo idioma basta para empezar a editar el texto de origen antes de añadir traducciones.

| Formato | Ruta de ejemplo |
| --- | --- |
| **Catálogo JSON** | `src/locales/{locale}.json` |
| **Catálogo YAML** | `config/locales/{locale}.yml` |
| **Mensajes de extensión de Chrome** | `_locales/{locale}/messages.json` |
| **Diccionario en código (un archivo por idioma)** | `src/locales/{locale}.ts` |
| **Diccionario en código (todos los idiomas en un archivo)** | `src/i18n/namespaces/*.ts` |

`{locale}` representa un código de idioma como `en`; `*` coincide con un segmento de nombre de archivo dentro de ese directorio.

Los catálogos JSON pueden usar archivos `.json` con el nombre del idioma, nombres con prefijo como `client.{locale}.json` o directorios de idioma como `{locale}/common.json`. Los catálogos YAML pueden usar `.yml` o `.yaml`, con un nombre de idioma simple o con prefijo. Los mensajes de extensiones de Chrome usan `_locales/{locale}/messages.json`.

Los diccionarios de código con un archivo por idioma admiten `.ts`, `.tsx`, `.js` y `.mjs`. Un diccionario de código que contiene todos los idiomas solo admite `.ts` y `.tsx`.

## Conserva la estructura del archivo {#file-structure}

Los catálogos YAML y los diccionarios de código conservan los comentarios, las líneas en blanco y el orden de las claves. Los catálogos JSON y los mensajes de extensiones de Chrome conservan la representación de su archivo — sangría, contenedores en una línea, escapes y orden de los campos.

Los valores vienen de Malmoi; el archivo existente aporta la estructura o la representación.
