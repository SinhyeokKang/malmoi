# Supported file formats

Malmoi reads and writes JSON and YAML catalogs, Chrome extension messages, TypeScript or JavaScript code dictionaries, Flutter ARB files, and Apple strings files.

## Supported formats {#formats}

The supported formats are JSON catalogs, YAML catalogs, Chrome extension messages, one code dictionary per language, one code dictionary containing all languages, Flutter ARB files, and Apple strings files. A single language is enough to start editing source text before adding translations.

| Format | Example path |
| --- | --- |
| **JSON catalog** | `src/locales/{locale}.json` |
| **YAML catalog** | `config/locales/{locale}.yml` |
| **Chrome extension messages** | `_locales/{locale}/messages.json` |
| **Code dictionary (one file per language)** | `src/locales/{locale}.ts` |
| **Code dictionary (all languages in one file)** | `src/i18n/namespaces/*.ts` |
| **Flutter ARB** | `lib/l10n/app_{locale}.arb` |
| **Apple strings file** | `App/{locale}.lproj/Localizable.strings` |

`{locale}` stands for a language code such as `en`; `*` matches a file-name segment within that directory.

JSON catalogs can use `.json` files named for the language, prefixed names such as `client.{locale}.json`, or language directories such as `{locale}/common.json`. YAML catalogs can use `.yml` or `.yaml`, with a plain or prefixed language name. Chrome extension messages use `_locales/{locale}/messages.json`.

Code dictionaries with one file per language support `.ts`, `.tsx`, `.js`, and `.mjs`. A code dictionary that contains all languages supports `.ts` and `.tsx` only.

Flutter ARB files can be named for the language, such as `{locale}.arb`, or with a prefix, such as `app_{locale}.arb`. If the repository root has an `l10n.yaml`, the files it points to are listed first and its template file's language is suggested as the base language. ICU messages, such as plurals and selects, are shown and saved as whole strings.

Apple strings files live in a `{locale}.lproj` folder, and each table, such as `Localizable.strings` or `InfoPlist.strings`, is its own source. The language code is the folder name; `Base.lproj` isn't a language and isn't listed, and names with a numeric region or a third part, such as `es_419` or `zh-Hant-TW`, aren't read as languages. Files in UTF-8 or UTF-16 are supported. `.stringsdict` plural files aren't read.

## Preserve file structure {#file-structure}

Existing YAML catalogs, code dictionaries, and Apple strings files keep comments, blank lines, and key order. JSON catalogs and Chrome extension messages keep their file representation — indentation, one-line containers, escapes, and field order.

Flutter ARB files keep the same JSON representation, and each key's `@key` metadata and the `@@` entries are copied from your file unchanged. An existing `@@locale` is set to the file's language code, and the first publish moves each `@key` right after its key. A `@key` is dropped only when its key was removed from the code.

Apple strings files keep their encoding and byte order mark, and values keep their escapes until you change them. If a key appears twice, the last entry is the one Malmoi shows and changes, as in Apple's own reader; the earlier line stays as it is, and the update shows a warning without failing. When you translate a key that a language file doesn't have yet, Malmoi adds its line after the key that comes before it in the base language file.

Values come from Malmoi; the existing file supplies the structure or representation.

## Add and remove languages {#languages}

Project owners can add and remove languages in Malmoi for JSON and YAML catalogs, Chrome extension messages, Flutter ARB files, Apple strings files, and code dictionaries with one file per language. See [Add and remove languages](../setup/languages.md#languages). A code dictionary containing all languages in one file requires language-object changes in the repository; its card has no new add or remove actions or description.

For new YAML and per-language code files, Malmoi borrows the base file's root convention, flat or nested key structure, export form, and formatting, where applicable. A YAML language root must match the base language code. A named code export keeps its name; a name containing the base language code is refused. Only keys with translations are written. Base-language values, comments, `import` statements, and type declarations aren't copied. Publish stops if it can't create the file safely; cancel the addition or create the file in the repository. Once a file exists, later publishes preserve its structure. New Flutter ARB files borrow the base file's formatting and contain `@@locale` and translated keys only; `@key` metadata isn't copied, because `flutter gen-l10n` reads it from the template file. New Apple strings files take the base file's encoding and contain translated keys only, without its comments.

New files can be sparse. If a later translation needs a parent mapping that isn't in the file, Malmoi inserts the remaining path as a dotted literal key, such as `"a.b.c"`. Check that your app's nested lookup can read it, and register new languages in `import` statements or supported-language lists where needed; Malmoi doesn't change that code.
