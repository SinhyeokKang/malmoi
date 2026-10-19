# Formatos de archivo compatibles

Malmoi lee y escribe catálogos JSON y YAML, mensajes de extensiones de Chrome, diccionarios de código TypeScript o JavaScript, archivos ARB de Flutter, archivos strings de Apple, catálogos String Catalog de Apple y archivos strings de Android.

## Formatos compatibles {#formats}

Los formatos compatibles son catálogos JSON, catálogos YAML, mensajes de extensiones de Chrome, un diccionario de código por idioma, un diccionario de código que contiene todos los idiomas, archivos ARB de Flutter, archivos strings de Apple, catálogos String Catalog de Apple y archivos strings de Android. Un solo idioma basta para empezar a editar el texto de origen antes de añadir traducciones.

| Formato | Ruta de ejemplo |
| --- | --- |
| **Catálogo JSON** | `src/locales/{locale}.json` |
| **Catálogo YAML** | `config/locales/{locale}.yml` |
| **Mensajes de extensión de Chrome** | `_locales/{locale}/messages.json` |
| **Diccionario en código (un archivo por idioma)** | `src/locales/{locale}.ts` |
| **Diccionario en código (todos los idiomas en un archivo)** | `src/i18n/namespaces/*.ts` |
| **Flutter ARB** | `lib/l10n/app_{locale}.arb` |
| **Archivo strings de Apple** | `App/{locale}.lproj/Localizable.strings` |
| **Apple String Catalog** | `App/Localizable.xcstrings` |
| **Archivo strings de Android** | `app/src/main/res/values-{locale}/strings.xml` |

`{locale}` representa un código de idioma como `en`; `*` coincide con un segmento de nombre de archivo dentro de ese directorio.

Los catálogos JSON pueden usar archivos `.json` con el nombre del idioma, nombres con prefijo como `client.{locale}.json` o directorios de idioma como `{locale}/common.json`. Los catálogos YAML pueden usar `.yml` o `.yaml`, con un nombre de idioma simple o con prefijo. Los mensajes de extensiones de Chrome usan `_locales/{locale}/messages.json`.

Los diccionarios de código con un archivo por idioma admiten `.ts`, `.tsx`, `.js` y `.mjs`. Un diccionario de código que contiene todos los idiomas solo admite `.ts` y `.tsx`.

Los archivos ARB de Flutter pueden llevar el nombre del idioma, como `{locale}.arb`, o un prefijo, como `app_{locale}.arb`. Si la raíz del repositorio tiene un `l10n.yaml`, los archivos a los que apunta aparecen primero y se sugiere el idioma de su archivo de plantilla como idioma base. Los mensajes ICU, como plurales y selects, se muestran y se guardan como cadenas completas.

Los archivos strings de Apple están en una carpeta `{locale}.lproj`, y cada tabla, como `Localizable.strings` o `InfoPlist.strings`, es su propia fuente. El código de idioma es el nombre de la carpeta; `Base.lproj` no es un idioma y no aparece, y los nombres con una región numérica o una tercera parte, como `es_419` o `zh-Hant-TW`, no se leen como idiomas. Se admiten archivos en UTF-8 o UTF-16. Los archivos de plurales `.stringsdict` no se leen.

Un Apple String Catalog guarda todos los idiomas en un solo archivo `.xcstrings`, y se sugiere como idioma base el idioma de su campo `sourceLanguage`. Las claves que Xcode crea a partir de tu código a menudo no tienen una entrada en ese idioma; Malmoi muestra la propia clave como texto de origen y solo escribe esa entrada si cambias el texto de origen. Las variaciones de plural y de dispositivo, las claves marcadas para no traducir y las claves vacías no se muestran y se quedan en el archivo sin cambios. Un archivo de catálogo de más de 2 MB no se puede cargar; consulta [Límites](limits.md#files).

Los archivos strings de Android están en carpetas `values-{locale}` dentro de la carpeta `res` de un módulo, o dentro de `composeResources` en Compose Multiplatform. El código de idioma es el sufijo de la carpeta tal como lo escribe Android, como `ko`, `zh-rCN` o `iw`; carpetas como `values-night` o `values-v21` no son idiomas. El archivo del idioma base, `values/strings.xml`, no tiene código de idioma en su ruta, así que introduces su código al conectar la fuente, y no se puede cambiar después. Se admite un módulo que solo tiene `values/strings.xml`. Solo se muestran las entradas `<string>`; `<plurals>`, `<string-array>`, las entradas marcadas con `translatable="false"` y las referencias como `@string/name` se quedan en el archivo sin cambios. Los valores se muestran con los escapes de Android resueltos, así que `Don\'t` se lee `Don't`. Las etiquetas en línea como `<b>` o `<xliff:g>` se quedan como texto: conserva las etiquetas del idioma base y traduce solo el texto entre ellas. Un `<` que no es una etiqueta se muestra como `&lt;`; escribe `&lt;` para ponerlo. Un archivo que define el mismo nombre dos veces no se puede cargar, porque la compilación de Android también lo rechaza.

## Conserva la estructura del archivo {#file-structure}

Los catálogos YAML, los diccionarios de código, los archivos strings de Apple y los archivos strings de Android existentes conservan los comentarios, las líneas en blanco y el orden de las claves. Los Apple String Catalogs solo cambian las entradas editadas, y una entrada para un idioma que la clave todavía no tiene se añade con el formato de Xcode. Los catálogos JSON y los mensajes de extensiones de Chrome conservan la representación de su archivo — sangría, contenedores en una línea, escapes y orden de los campos.

Los archivos ARB de Flutter conservan la misma representación JSON, y los metadatos `@key` de cada clave y las entradas `@@` se copian de tu archivo sin cambios. Un `@@locale` existente se ajusta al código de idioma del archivo, y la primera publicación mueve cada `@key` justo después de su clave. Un `@key` solo se elimina cuando su clave se quitó del código.

Los archivos strings de Apple conservan su codificación y su marca de orden de bytes, y los valores conservan sus escapes hasta que los cambias. Si una clave aparece dos veces, Malmoi muestra y cambia la última entrada, como el lector de Apple; la línea anterior se queda como está, y la actualización muestra una advertencia sin fallar. Cuando traduces una clave que un archivo de idioma todavía no tiene, Malmoi añade su línea después de la clave que la precede en el archivo del idioma base.

En un archivo strings de Android, Malmoi cambia solo el texto dentro de cada `<string>` editado y no reformatea el XML. Cuando traduces una clave que un archivo de idioma todavía no tiene, Malmoi añade su `<string>` después de la clave que la precede en el archivo del idioma base, con el atributo `formatted` de la entrada base. El archivo del idioma base nunca recibe líneas nuevas.

En un Apple String Catalog, un nombre que aparece dos veces se lee como lo lee Xcode: se muestra y se cambia el primero, la copia posterior se queda hasta que Xcode la quita en su siguiente guardado, y la actualización muestra una advertencia sin fallar. Malmoi no añade ni quita claves en un catálogo; Xcode las añade a partir de tu código. Una entrada de plural o de dispositivo no admite un solo valor; si se edita, Publicar se detiene para ese archivo.

Los valores vienen de Malmoi; el archivo existente aporta la estructura o la representación.

## Añade y quita idiomas {#languages}

Los propietarios del proyecto pueden añadir y quitar idiomas en Malmoi en catálogos JSON y YAML, mensajes de extensiones de Chrome, archivos ARB de Flutter, archivos strings de Apple, archivos strings de Android y diccionarios con un archivo por idioma. Consulta [Añade y quita idiomas](../setup/languages.md#languages). Un diccionario que contiene todos los idiomas en un archivo requiere cambiar los objetos de idioma en el repositorio, y un Apple String Catalog requiere añadir el idioma en Xcode; su tarjeta no tiene acciones para nuevas adiciones o eliminaciones ni descripción.

Para los archivos nuevos de YAML y de código por idioma, Malmoi toma del archivo base las convenciones de raíz, estructura plana o anidada de claves, forma de exportación y formato, cuando corresponda. La raíz de idioma de YAML debe coincidir con el código del idioma base. Una exportación con nombre conserva su nombre; se rechaza un nombre que contenga el código del idioma base. Solo se escriben claves con traducciones. No se copian los valores del idioma base, comentarios, sentencias `import` ni declaraciones de tipos. Publicar se detiene si no puede crear el archivo con seguridad; cancela la adición o crea el archivo en el repositorio. Una vez creado, las publicaciones posteriores conservan su estructura. Los archivos ARB de Flutter nuevos toman el formato del archivo base y solo contienen `@@locale` y las claves traducidas; los metadatos `@key` no se copian, porque `flutter gen-l10n` los lee del archivo de plantilla. Los archivos strings de Apple nuevos toman la codificación del archivo base y solo contienen las claves traducidas, sin sus comentarios. Los archivos strings de Android nuevos copian la declaración XML y el elemento `<resources>` del archivo base y solo contienen las claves traducidas, cada una con el atributo `formatted` de la entrada base. Los idiomas de Android con región usan la grafía de Android, como `pt-rBR`.

Los archivos nuevos pueden contener solo algunas claves. Si una traducción posterior necesita un mapa padre que no está en el archivo, Malmoi inserta la ruta restante como una clave literal con puntos, como `"a.b.c"`. Comprueba que la búsqueda anidada de tu aplicación pueda leerla y registra los idiomas nuevos en las sentencias `import` o las listas de idiomas admitidos cuando sea necesario; Malmoi no cambia ese código. Si tu aplicación Android limita sus idiomas con `resConfigs` o `localeFilters`, añade allí el idioma nuevo.
