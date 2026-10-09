# Autoalojamiento

Puedes ejecutar tu propio Malmoi en un servidor Linux con Docker Compose. Esta sección es la guía del operador para instalarlo, mantenerlo y resolver problemas.

## Qué se admite {#support}

La configuración admitida es Docker Compose en un único servidor Linux: una instancia de la app, PostgreSQL 17, un volumen para las imágenes subidas y un programador nocturno, detrás de un proxy inverso HTTPS (se incluye un ejemplo de nginx) en la raíz de un dominio. Está verificada en `linux/amd64`.

- Cada versión de la app `v<x.y.z>` publica una imagen en `ghcr.io/sinhyeokkang/malmoi:v<x.y.z>`. La etiqueta de la imagen es la etiqueta de la app y es independiente de la etiqueta de la action del workflow (`malmoi-i18n-push-vN`).
- El soporte cubre solo la última versión de la app, en GitHub Issues y en la medida de lo posible.
- No se admite: Kubernetes, más de una instancia de la app, alta disponibilidad, actualizaciones sin interrupción o automáticas, redes aisladas, GitHub Enterprise, GitLab, inicio de sesión con contraseña, SAML o correo, correo por algo que no sea Resend, mover cuentas o proyectos entre mal-moi.com y una instalación, una consola de administración, un asistente de instalación ni marca blanca.

## Comparado con mal-moi.com {#compare}

| | mal-moi.com | Tu propio servidor |
| --- | --- | --- |
| Infraestructura | Se ejecuta por ti | Un servidor Linux con Docker Compose, PostgreSQL 17, un volumen de subidas, un programador y un proxy HTTPS que tú gestionas |
| Actualizaciones | Cada versión se aplica sola | Actualizas una versión cada vez a partir de las imágenes publicadas |
| Dónde están los datos | Supabase (base de datos, Tokio) y Vercel (alojamiento, imágenes) | La base de datos y el volumen de subidas de tu servidor |
| Inicio de sesión y correo | Inicio de sesión con GitHub y Google, correos de invitación por Resend | Lo mismo, con apps OAuth, una GitHub App y un dominio de Resend que registras tú |
| Límites | Hasta 3 proyectos activos en propiedad por persona | Lo mismo, salvo para las personas incluidas en `OPERATOR_EMAILS` |
| Soporte | GitHub Issues | Solo la última versión, en GitHub Issues, en la medida de lo posible |
| Coste | Gratis | Software gratuito; pagas tu servidor, tu dominio y tu plan de Resend |
| Política de privacidad | La de Malmoi | La tuya — `/privacy` redirige a ella |
| Buscadores y analítica | Las páginas públicas se indexan, con recuento de visitas sin cookies | Todas las páginas llevan `noindex` y no se cuentan visitas |

- El registro está abierto en ambos. Cualquiera con una dirección de correo verificada por GitHub o Google puede iniciar sesión y crear proyectos sin invitación; nada en la app bloquea el registro, y el acceso a un proyecto sigue viniendo solo de su lista de miembros.
- El archivo de workflow que genera tu instalación siempre incluye una línea `api-url` con tu dirección. No la quites nunca: sin ella, el workflow envía el token de push del proyecto a mal-moi.com.
- La sincronización nocturna se ejecuta a las 18:00 UTC en ambos; en tu servidor la ejecuta el contenedor del programador.
- La insignia Latest de `/changelog` muestra la versión más reciente del repositorio original, que puede ser más nueva que la tuya. Tu versión es la etiqueta de `MALMOI_IMAGE`.

## Antes de instalar {#requirements}

- Un servidor Linux con Docker Engine y el plugin de Compose.
- Un dominio cuya raíz dedicas a Malmoi (no una subruta), con registros A o AAAA que apunten al servidor y los puertos 80 y 443 abiertos.
- Un certificado de una autoridad de certificación pública. Los runners de GitHub Actions rechazan certificados autofirmados y de CA privadas.
- Una dirección a la que llegue GitHub Actions. Los workflows de los repositorios de destino envían sus actualizaciones a tu `MALMOI_ORIGIN` desde runners alojados en GitHub, así que una lista de IP permitidas, un firewall o una VPN delante del servidor detienen todas las actualizaciones.
- Una página de política de privacidad propia, en otro sitio. Los [materiales de privacidad](troubleshooting.md#privacy) enumeran lo que guarda la instalación.

Los workflows de los repositorios de destino ejecutan la etiqueta de action original `malmoi-i18n-push-v3` de `SinhyeokKang/malmoi`, y el `PUSH_TOKEN` y el `GITHUB_TOKEN` del proyecto entran en ese paso. Esa etiqueta puede moverse con independencia de la versión que instalaste. Si no es aceptable, haz un fork del repositorio original y apunta `uses:` a un SHA de commit de tu fork.
