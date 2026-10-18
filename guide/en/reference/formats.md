# Supported file formats

Malmoi reads and writes JSON and YAML catalogs, Chrome extension messages, and TypeScript or JavaScript code dictionaries.

## Supported formats {#formats}

The supported formats are JSON catalogs, YAML catalogs, Chrome extension messages, one code dictionary per language, and one code dictionary containing all languages. A single language is enough to start editing source text before adding translations.

| Format | Example path |
| --- | --- |
| **JSON catalog** | `src/locales/{locale}.json` |
| **YAML catalog** | `config/locales/{locale}.yml` |
| **Chrome extension messages** | `_locales/{locale}/messages.json` |
| **Code dictionary (one file per language)** | `src/locales/{locale}.ts` |
| **Code dictionary (all languages in one file)** | `src/i18n/namespaces/*.ts` |

`{locale}` stands for a language code such as `en`; `*` matches a file-name segment within that directory.

JSON catalogs can use `.json` files named for the language, prefixed names such as `client.{locale}.json`, or language directories such as `{locale}/common.json`. YAML catalogs can use `.yml` or `.yaml`, with a plain or prefixed language name. Chrome extension messages use `_locales/{locale}/messages.json`.

Code dictionaries with one file per language support `.ts`, `.tsx`, `.js`, and `.mjs`. A code dictionary that contains all languages supports `.ts` and `.tsx` only.

## Preserve file structure {#file-structure}

Existing YAML catalogs and code dictionaries keep comments, blank lines, and key order. JSON catalogs and Chrome extension messages keep their file representation — indentation, one-line containers, escapes, and field order.

Values come from Malmoi; the existing file supplies the structure or representation.

## Add and remove languages {#languages}

Project owners can add and remove languages in Malmoi for JSON and YAML catalogs, Chrome extension messages, and code dictionaries with one file per language. See [Add and remove languages](../setup/languages.md#languages). A code dictionary containing all languages in one file requires language-object changes in the repository; its card has no new add or remove actions or description.

For new YAML and per-language code files, Malmoi borrows the base file's root convention, flat or nested key structure, export form, and formatting, where applicable. A YAML language root must match the base language code. A named code export keeps its name; a name containing the base language code is refused. Only keys with translations are written. Base-language values, comments, `import` statements, and type declarations aren't copied. Publish stops if it can't create the file safely; cancel the addition or create the file in the repository. Once a file exists, later publishes preserve its structure.

New files can be sparse. If a later translation needs a parent mapping that isn't in the file, Malmoi inserts the remaining path as a dotted literal key, such as `"a.b.c"`. Check that your app's nested lookup can read it, and register new languages in `import` statements or supported-language lists where needed; Malmoi doesn't change that code.
