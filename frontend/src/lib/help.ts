// Textos de la ayuda (botón «Ayuda» del menú lateral). Las capturas están en
// assets/ayuda/*.webp y se regeneran con `make capturas`.
import type { View } from './state.svelte'

const shots = import.meta.glob('../assets/ayuda/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** URL de una captura por su nombre (sin extensión), o undefined si no existe. */
export function shot(name: string): string | undefined {
  return shots[`../assets/ayuda/${name}.webp`]
}

export interface HelpStep {
  title: string
  text: string
  img?: string
}

export interface HelpSection {
  id: View | 'general'
  title: string
  intro: string
  steps: HelpStep[]
}

export const HELP: HelpSection[] = [
  {
    id: 'general',
    title: 'Cómo funciona',
    intro: 'Draupnode prepara servidores Linux desde cero. Das de alta el servidor, creas un proyecto con lo que quieres instalar y lo aplicas. Todo se ejecuta por SSH desde este equipo: las contraseñas no salen de aquí.',
    steps: [
      { title: '1 · Añade un servidor', text: 'En «Servidores», con su IP, usuario y clave SSH (o contraseña).', img: 'servidor-nuevo' },
      { title: '2 · Prueba la conexión', text: 'La primera vez te enseña la huella del servidor para que confirmes que es él.' },
      { title: '3 · Crea un proyecto', text: 'En «Proyectos», elige el servidor y marca los módulos (Docker, Coolify, PostgreSQL…).', img: 'proyecto' },
      { title: '4 · Previsualiza y aplica', text: '«Previsualizar» dice qué cambiaría sin tocar nada; «Aplicar» lo instala. También puedes exportar un único instalar.sh.' },
      { title: 'La barra de abajo', text: 'Muestra el servidor elegido: si responde ahora mismo, cuándo se probó la conexión, lo que se está instalando y un botón para abrir su web (Coolify si está instalado). Cambia de servidor con su desplegable.', img: 'barra-estado' },
      { title: 'Ventana estrecha', text: 'Si la ventana es estrecha (por ejemplo, a media pantalla), el menú de la izquierda se pliega: ábrelo con el botón ☰ de arriba a la izquierda.' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Panel',
    intro: 'Resumen de tus servidores y los siguientes pasos.',
    steps: [
      { title: 'Resumen', text: 'Arriba: cuántos servidores tienes, cuántos conectan bien, cuántos proyectos y cuándo fue la última comprobación.', img: 'panel' },
      { title: 'Lista de servidores', text: 'Pulsa un servidor para ver sus proyectos. El punto verde indica que la última prueba de conexión fue bien; rojo, que falló.' },
      { title: 'Primeros pasos', text: 'Lista de lo que falta por hacer. «Ir» te lleva a la pantalla correspondiente.' },
    ],
  },
  {
    id: 'servers',
    title: 'Servidores',
    intro: 'Las máquinas que Draupnode va a preparar y cómo conectarse a ellas por SSH.',
    steps: [
      { title: 'Lista', text: 'Cada tarjeta muestra la conexión (usuario@IP), cómo se entra (clave o contraseña), el resultado de la última prueba y los datos del servidor. Pulsa la tarjeta para ver sus proyectos.', img: 'servidores' },
      { title: 'Añadir servidor', text: 'Nombre, IP o dominio, puerto (22 normalmente) y usuario. Elige la clave de la lista (salen las de ~/.ssh) o escribe una contraseña. Si la clave tiene contraseña, marca «tiene contraseña» y decide si guardarla.', img: 'servidor-nuevo' },
      { title: 'Probar conexión', text: 'Conecta, comprueba sudo y recoge datos (sistema, memoria, disco). La primera vez pide confirmar la huella del servidor; compárala con la que te da tu proveedor.' },
      { title: 'Editar y eliminar', text: 'El lápiz cambia los datos; la papelera lo quita de Draupnode (el servidor en sí no se toca). No se puede eliminar un servidor que use algún proyecto.' },
    ],
  },
  {
    id: 'projects',
    title: 'Proyectos',
    intro: 'Un proyecto es un conjunto de módulos que se instala en un servidor. Un servidor puede tener varios proyectos; un proyecto está en un solo servidor (puedes cambiarlo con su desplegable).',
    steps: [
      { title: 'Lista', text: 'Cada proyecto muestra su servidor, sus módulos y el resultado de la última ejecución. Si vienes desde un servidor, arriba puedes cambiarlo o pulsar «Ver todos».', img: 'proyectos' },
      { title: 'Nuevo proyecto', text: 'Ponle nombre, elige el servidor y pulsa «Guardar». Después, en «Añadir módulos», pulsa las tarjetas de lo que quieras instalar: se marcan en azul (las que necesitan otras las añaden solas, en ámbar). No hay que rellenar nada todavía: la configuración se pide al aplicar.', img: 'proyecto' },
      { title: 'Se guarda solo', text: 'Una vez creado, cada cambio se guarda automáticamente («Cambios guardados», arriba a la derecha) y en el sitio de «Guardar» aparece «Eliminar». Si hay campos en rojo, no se guarda hasta corregirlos.' },
      { title: 'Configurar y aplicar', text: 'Con módulos marcados aparece «Configurar y aplicar…»: se abre una ventana por cada módulo nuevo que tenga opciones (Anterior / Siguiente) y al final un resumen con «Previsualizar» y «Finalizar y aplicar». Arriba de la ventana ves siempre el servidor y el proyecto.' },
      { title: 'Página de un módulo', text: 'Pulsando un módulo instalado ves su estado, lo suyo (por ejemplo, los botones de copias, el panel de Coolify o sus contraseñas) y su configuración. Si cambias algo sale «Cambios sin aplicar» y el botón «Aplicar cambios». La ruta de arriba (Servidor › Proyecto › Módulo) te dice siempre dónde estás y te lleva atrás.' },
      { title: 'Previsualizar', text: 'Una simulación: no cambia nada de tu proyecto en el servidor. Al terminar te dice una de dos cosas: «Simulación completada. Todavía no se ha aplicado nada», con la lista de lo que hará Aplicar; o «Configuración ya aplicada en el servidor: no es necesario pulsar Aplicar». Si sale en rojo, dice qué falló. Cada tarea lleva su estado: «ya está bien», «se cambiará», «no hace falta en este servidor» o «fallo». «Para que lo sepas» son avisos, no errores.' },
      { title: 'Aplicar', text: 'Instala de verdad. Verás cada tarea en directo; al terminar, las notas importantes (por ejemplo, la dirección del panel de Coolify). El botón solo aparece si el proyecto no se ha aplicado aún o si lo has cambiado desde la última vez; si no, verás «Aplicado hace…, sin cambios desde entonces». Las contraseñas que generan los módulos se crean en el servidor la primera vez que aplicas (al previsualizar, no), quedan allí en /etc/draupnode/secretos/<proyecto>/ (solo root) y Draupnode trae una copia a su bóveda cifrada.' },
      { title: 'Copias en otro servidor', text: 'En la página del módulo «Copias de seguridad», «Guardar también en otro servidor…» elige otro de tus servidores y lo prepara como destino: crea allí el proyecto «Destino de copias» (rest-server en modo solo añadir, con HTTPS) y deja este proyecto apuntando a él. Luego aplica primero el destino y después este proyecto. Desde este servidor se pueden añadir copias allí, pero no borrarlas: si alguien entra aquí, las de allí siguen a salvo.', img: 'destino-copias' },
      { title: 'Publicar tus apps en tu dominio (Caddy o nginx)', text: 'Los módulos «Caddy» y «nginx» hacen lo mismo: ponen tus apps en tu dominio con HTTPS. En «Sitios», una línea por sitio: «dominio destino», por ejemplo «fotos.ejemplo.com 127.0.0.1:2283» (una app) o «blog.ejemplo.com /srv/www/blog» (una web estática). El dominio tiene que apuntar ya a la IP del servidor. Caddy es más sencillo (pide y renueva los certificados él solo); nginx es el más conocido (los certificados los pide certbot). Solo puede haber uno, y ninguno si usas Coolify (que ya trae el suyo).' },
      { title: 'Tu VPN (WireGuard)', text: 'Con el módulo «WireGuard» entras al servidor como si estuvieras en su red. En «Dispositivos» pon un nombre por aparato (portatil, movil…). Después de aplicar, en la página del módulo pulsa «Ver configuraciones» (pide la contraseña de la bóveda): en el móvil, escanea el QR con la app WireGuard; en el ordenador, «Guardar .conf» e impórtalo. Quitar un nombre le quita el acceso.', img: 'vpn' },
      { title: 'Contraseñas del proyecto', text: 'Debajo de los botones, si el proyecto tiene módulos que generan contraseñas (PostgreSQL, Coolify…). «Ver contraseñas» pide la contraseña de la bóveda (siempre, aunque ya la hayas escrito antes) y las enseña tapadas, con botones para mostrarlas y copiarlas. Se ocultan solas a los 2 minutos. Cada proyecto tiene las suyas, aunque estén en el mismo servidor; si cambias el nombre del proyecto, siguen siendo las mismas.' },
      { title: 'Ordenar los módulos', text: 'El botón de arriba a la derecha de «Módulos» cambia el orden: «Instalados» pone primero los instalados y debajo el resto, cada parte en orden alfabético; «Por categoría» los agrupa por categoría. Se recuerda la elección.' },
      { title: 'Colores de los módulos', text: 'Verde: instalado en el servidor por este proyecto (arriba, en «Instalado en…»). Azul: marcado, se instalará al aplicar. Ámbar: lo necesita otro módulo marcado. Borde discontinuo: sigue instalado pero el proyecto ya no lo gestiona. Con candado: no puede ir con otro que ya tienes.' },
      { title: 'Quitar o desinstalar un módulo', text: 'Pulsa la tarjeta de un módulo instalado para abrir su página. Abajo tienes «Quitar del proyecto» (sigue instalado y funcionando; Draupnode deja de gestionarlo) y «Desinstalar…» (hay que escribir DESINSTALAR; si tiene datos puedes borrarlos también). Uno quitado del proyecto se puede volver a añadir desde su página.' },
      { title: 'Copias de seguridad', text: 'Con el módulo «Copias de seguridad (restic)» instalado sale un recuadro en el proyecto: «Hacer copia ahora», «Ver copias» (y «Ver copias remotas» si tienes destino remoto) y «Traer copias al equipo», que descarga solo lo nuevo a una carpeta tuya, con la contraseña y un LEEME para restaurar. La contraseña de las copias también está en «Contraseñas del proyecto»: sin ella no se pueden abrir. Todo es código abierto: restic, y como destino remoto otro servidor por SFTP, un rest-server de restic o un S3 compatible (MinIO, Garage, SeaweedFS).' },
      { title: 'Monitorización', text: 'Con «Monitorización (métricas)» instalada, su página enseña el estado del servidor (CPU, RAM, disco, contenedores, si cada fuente responde), que se actualiza solo cada 30 s, y el botón «Abrir Grafana». Grafana no está abierta a internet: Draupnode la abre por la conexión SSH en tu navegador. Entra con admin y la contraseña de «Contraseñas» del módulo. «Registros (Loki)» añade a Grafana la búsqueda en los registros de los contenedores y del sistema.' },
      { title: 'Restaurar una copia', text: 'En «Ver copias», cada copia tiene «Restaurar…»: navegas por sus carpetas, marcas lo que quieras y eliges «Descargar a este equipo» (no toca el servidor) o «Restaurar en el servidor» (en una carpeta aparte, o en su sitio original escribiendo RESTAURAR). En la carpeta postgres-… cada .dump es una base: «Restaurar base…» la recupera en una base nueva (recomendado: la actual no se toca) o sustituyendo la actual (escribiendo su nombre; corta las conexiones y lo escrito después de la copia se pierde).' },
      { title: 'Destino SFTP', text: 'Al aplicar, Draupnode genera en el servidor una clave para el destino y te la enseña (también en «Contraseñas del proyecto»). Añádela al ~/.ssh/authorized_keys del usuario del destino; la siguiente copia crea allí el repositorio sola.' },
      { title: 'Lo que no se puede desinstalar', text: 'Sistema base (son paquetes y ajustes del sistema). Un módulo que necesita otro instalado (p. ej. Docker mientras haya PostgreSQL o Coolify): desinstala antes ese. «SSH seguro» sí se puede desinstalar: quita el endurecimiento y fail2ban, pero el SSH sigue funcionando (es por donde se conecta Draupnode); solo si está en el puerto 22.' },
      { title: 'Módulos que no pueden ir juntos', text: 'Algunos módulos chocan entre sí (por ejemplo, dos que quieren los mismos puertos): el que choca sale con un candado y «choca con…». Quita antes el otro.' },
      { title: 'SSH seguro + fail2ban', text: 'Cierra el SSH a lo imprescindible y bloquea a quien prueba contraseñas. Draupnode no te deja guardar nada que te deje fuera (quitar la contraseña si entras con ella, prohibir root si entras como root, una lista de usuarios sin el tuyo) y fail2ban nunca bloquea tu IP. Si cambias el puerto, se abre solo en el Cortafuegos y, al terminar, Draupnode actualiza el servidor.' },
      { title: 'Exportar instalar.sh', text: 'Un único script con todo para ejecutarlo tú en el servidor: sudo bash instalar.sh.' },
    ],
  },
  {
    id: 'catalog',
    title: 'Catálogo',
    intro: 'Los módulos que se pueden instalar: cada uno es un rol de Ansible con su ficha.',
    steps: [
      { title: 'Ficha de un módulo', text: 'Qué hace, de qué depende, qué requisitos tiene (sistema, memoria, disco) y qué datos se pueden configurar.', img: 'catalogo' },
      { title: 'Ficheros del rol', text: 'Puedes leer las tareas de Ansible que ejecutará cada módulo.' },
      { title: 'Módulos propios', text: '«Mis módulos» abre la carpeta de módulos propios: copia uno, cámbialo y pulsa «Recargar».' },
    ],
  },
  {
    id: 'lab',
    title: 'Pruebas',
    intro: 'Un servidor Ubuntu 24.04 dentro de Docker en este equipo, para probar sin miedo a romper nada.',
    steps: [
      { title: '1 · Docker en este equipo', text: 'Si falta Docker o no tienes permiso, los botones lo arreglan (te pide tu contraseña en una ventana del sistema). Si te añade al grupo docker, reinicia el equipo.', img: 'pruebas' },
      { title: '2 · Servidor de pruebas', text: '«Crear y arrancar» lo deja como un servidor recién contratado: sin Docker ni Coolify. «Parar» conserva lo instalado; «Borrar» lo deja como nuevo.' },
      { title: '3 · Usarlo en Draupnode', text: '«Dar de alta» lo añade a Servidores con su clave y su huella. Después crea un proyecto en él (por ejemplo con Coolify) y pulsa «Aplicar».' },
      { title: 'Panel de Coolify', text: 'El botón solo aparece cuando Coolify está instalado y responde (en http://127.0.0.1:18000).' },
    ],
  },
  {
    id: 'docker',
    title: 'Docker',
    intro: 'Un asistente que crea los ficheros de Docker (Dockerfile, docker-compose.yml, .dockerignore y, si hace falta, docker-entrypoint.sh) de cualquier proyecto: Python, Node, Java, PHP, Go o web estática.',
    steps: [
      { title: '1 · Carpeta', text: 'Elige la carpeta del proyecto. Draupnode mira sus ficheros (requirements.txt, package.json, pom.xml…) y te dice qué ha reconocido y en qué se ha basado. El .env nunca se lee.', img: 'docker' },
      { title: '2 a 4 · Revisa', text: 'Lenguaje y versión, cómo arranca y qué necesita (PostgreSQL, MariaDB, Redis, variables, carpetas de datos). Todo viene relleno con lo detectado: cambia solo lo que no cuadre.' },
      { title: '5 · Vista previa y guardar', text: 'Ves cada fichero antes de guardarlo. Si el proyecto ya tenía Dockerfile, los nuevos se guardan al lado con «.draupnode» en el nombre y no se toca nada tuyo.', img: 'docker-vista' },
      { title: 'Probar a construir', text: 'Si hay Docker en este equipo, construye la imagen y te enseña la salida. Si falla, las últimas líneas suelen decir qué falta.' },
    ],
  },
  {
    id: 'settings',
    title: 'Ajustes',
    intro: 'Dónde se guardan las contraseñas, el tema de colores y los datos de la aplicación.',
    steps: [
      { title: 'Contraseñas guardadas', text: 'En el llavero del sistema o en una bóveda cifrada propia (con una contraseña maestra). Puedes elegir cuál usar por defecto.', img: 'ajustes' },
      { title: 'Tema', text: 'Elige una paleta o crea la tuya con el editor de colores; se puede exportar e importar.' },
      { title: 'Datos de la aplicación', text: 'La carpeta donde Draupnode guarda servidores, proyectos y registros de ejecución.' },
    ],
  },
]

/** Sección de ayuda para una pantalla (la general si no tiene propia). */
export function helpFor(view: View | null): HelpSection {
  return HELP.find((h) => h.id === view) ?? HELP[0]
}
