# Formatos de archivo compatibles

Malmoi lee y escribe catálogos JSON y YAML, mensajes de extensiones de Chrome, diccionarios de código TypeScript o JavaScript y archivos ARB de Flutter.

## Formatos compatibles {#formats}

Los formatos compatibles son catálogos JSON, catálogos YAML, mensajes de extensiones de Chrome, un diccionario de código por idioma, un diccionario de código que contiene todos los idiomas y archivos ARB de Flutter. Un solo idioma basta para empezar a editar el texto de origen antes de añadir traducciones.

| Formato | Ruta de ejemplo |
| --- | --- |
| **Catálogo JSON** | `src/locales/{locale}.json` |
| **Catálogo YAML** | `config/locales/{locale}.yml` |
| **Mensajes de extensión de Chrome** | `_locales/{locale}/messages.json` |
| **Diccionario en código (un archivo por idioma)** | `src/locales/{locale}.ts` |
| **Diccionario en código (todos los idiomas en un archivo)** | `src/i18n/namespaces/*.ts` |
| **Flutter ARB** | `lib/l10n/app_{locale}.arb` |

`{locale}` representa un código de idioma como `en`; `*` coincide con un segmento de nombre de archivo dentro de ese directorio.

Los catálogos JSON pueden usar archivos `.json` con el nombre del idioma, nombres con prefijo como `client.{locale}.json` o directorios de idioma como `{locale}/common.json`. Los catálogos YAML pueden usar `.yml` o `.yaml`, con un nombre de idioma simple o con prefijo. Los mensajes de extensiones de Chrome usan `_locales/{locale}/messages.json`.

Los diccionarios de código con un archivo por idioma admiten `.ts`, `.tsx`, `.js` y `.mjs`. Un diccionario de código que contiene todos los idiomas solo admite `.ts` y `.tsx`.

Los archivos ARB de Flutter pueden llevar el nombre del idioma, como `{locale}.arb`, o un prefijo, como `app_{locale}.arb`. Si la raíz del repositorio tiene un `l10n.yaml`, los archivos a los que apunta aparecen primero y se sugiere el idioma de su archivo de plantilla como idioma base. Los mensajes ICU, como plurales y selects, se muestran y se guardan como cadenas completas.

## Conserva la estructura del archivo {#file-structure}

Los catálogos YAML y los diccionarios de código existentes conservan los comentarios, las líneas en blanco y el orden de las claves. Los catálogos JSON y los mensajes de extensiones de Chrome conservan la representación de su archivo — sangría, contenedores en una línea, escapes y orden de los campos.

Los archivos ARB de Flutter conservan la misma representación JSON, y los metadatos `@key` de cada clave y las entradas `@@` se copian de tu archivo sin cambios. Un `@@locale` existente se ajusta al código de idioma del archivo, y la primera publicación mueve cada `@key` justo después de su clave. Un `@key` solo se elimina cuando su clave se quitó del código.

Los valores vienen de Malmoi; el archivo existente aporta la estructura o la representación.

## Añade y quita idiomas {#languages}

Los propietarios del proyecto pueden añadir y quitar idiomas en Malmoi en catálogos JSON y YAML, mensajes de extensiones de Chrome, archivos ARB de Flutter y diccionarios con un archivo por idioma. Consulta [Añade y quita idiomas](../setup/languages.md#languages). Un diccionario que contiene todos los idiomas en un archivo requiere cambiar los objetos de idioma en el repositorio; su tarjeta no tiene acciones para nuevas adiciones o eliminaciones ni descripción.

Para los archivos nuevos de YAML y de código por idioma, Malmoi toma del archivo base las convenciones de raíz, estructura plana o anidada de claves, forma de exportación y formato, cuando corresponda. La raíz de idioma de YAML debe coincidir con el código del idioma base. Una exportación con nombre conserva su nombre; se rechaza un nombre que contenga el código del idioma base. Solo se escriben claves con traducciones. No se copian los valores del idioma base, comentarios, sentencias `import` ni declaraciones de tipos. Publicar se detiene si no puede crear el archivo con seguridad; cancela la adición o crea el archivo en el repositorio. Una vez creado, las publicaciones posteriores conservan su estructura. Los archivos ARB de Flutter nuevos toman el formato del archivo base y solo contienen `@@locale` y las claves traducidas; los metadatos `@key` no se copian, porque `flutter gen-l10n` los lee del archivo de plantilla.

Los archivos nuevos pueden contener solo algunas claves. Si una traducción posterior necesita un mapa padre que no está en el archivo, Malmoi inserta la ruta restante como una clave literal con puntos, como `"a.b.c"`. Comprueba que la búsqueda anidada de tu aplicación pueda leerla y registra los idiomas nuevos en las sentencias `import` o las listas de idiomas admitidos cuando sea necesario; Malmoi no cambia ese código.
