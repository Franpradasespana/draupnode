#!/usr/bin/env bash
# =============================================================================
#  Servidor Ubuntu de PRUEBAS para Draupnode (en Docker).
#
#    bash servidor.sh arrancar    construye y arranca (deja las claves listas)
#    bash servidor.sh estado      ¿está en marcha? datos de conexión
#    bash servidor.sh ssh         entra por SSH como ubuntu
#    bash servidor.sh parar       lo para (conserva lo instalado)
#    bash servidor.sh borrar      lo elimina del todo para empezar de cero
#
#  Lo mismo se puede hacer con botones desde Draupnode → Pruebas.
#  Usa la misma imagen (internal/lab/Dockerfile) y las mismas claves
#  (~/.config/draupnode/prueba) que la aplicación.
# =============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NOMBRE=draupnode-prueba
IMAGEN=draupnode/servidor-prueba:24.04
VOLUMEN=draupnode-prueba-docker
PUERTO_SSH=2222
PUERTO_COOLIFY=18000
CLAVES="${XDG_CONFIG_HOME:-$HOME/.config}/draupnode/prueba"
DOCKERFILE="$DIR/../../internal/lab/Dockerfile"

# Docker: directamente si tu usuario está en el grupo «docker»; si no, con sudo.
if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
  echo "· Tu usuario no puede usar Docker directamente: usaré sudo (te pedirá la contraseña)."
  echo "  Para no tener que usar sudo: sudo usermod -aG docker $USER  y cierra y abre sesión."
fi
d() { "${DOCKER[@]}" "$@"; }

existe() { d container inspect "$NOMBRE" >/dev/null 2>&1; }
corriendo() { [ "$(d container inspect -f '{{.State.Running}}' "$NOMBRE" 2>/dev/null)" = true ]; }

claves() {
  mkdir -p "$CLAVES"
  chmod 700 "$CLAVES"
  # Clave sin contraseña, clave con contraseña («draupnode») y su versión PuTTY.
  [ -f "$CLAVES/id_prueba" ] || ssh-keygen -q -t ed25519 -N '' -C draupnode-prueba -f "$CLAVES/id_prueba"
  [ -f "$CLAVES/id_prueba_con_frase" ] || ssh-keygen -q -t ed25519 -N 'draupnode' -C draupnode-prueba-frase -f "$CLAVES/id_prueba_con_frase"
  if command -v puttygen >/dev/null && [ ! -f "$CLAVES/id_prueba_con_frase.ppk" ]; then
    printf 'draupnode\n' > "$CLAVES/.frase"
    puttygen "$CLAVES/id_prueba_con_frase" --old-passphrase "$CLAVES/.frase" --new-passphrase "$CLAVES/.frase" \
      -O private -o "$CLAVES/id_prueba_con_frase.ppk" >/dev/null 2>&1 || true
    rm -f "$CLAVES/.frase"
  fi
  # Huella del servidor fija: aunque lo borres y lo vuelvas a crear, Draupnode
  # no avisará de «huella cambiada».
  [ -f "$CLAVES/ssh_host_ed25519_key" ] || ssh-keygen -q -t ed25519 -N '' -C servidor-prueba -f "$CLAVES/ssh_host_ed25519_key"
}

instalar_claves() {
  cat "$CLAVES/id_prueba.pub" "$CLAVES/id_prueba_con_frase.pub" > "$CLAVES/.authorized_keys"
  for u in ubuntu prueba; do
    d exec "$NOMBRE" install -d -m 700 -o "$u" -g "$u" "/home/$u/.ssh"
    d cp "$CLAVES/.authorized_keys" "$NOMBRE:/home/$u/.ssh/authorized_keys"
    d exec "$NOMBRE" sh -c "chown $u:$u /home/$u/.ssh/authorized_keys && chmod 600 /home/$u/.ssh/authorized_keys"
  done
  rm -f "$CLAVES/.authorized_keys"
  d cp "$CLAVES/ssh_host_ed25519_key" "$NOMBRE:/etc/ssh/ssh_host_ed25519_key"
  d cp "$CLAVES/ssh_host_ed25519_key.pub" "$NOMBRE:/etc/ssh/ssh_host_ed25519_key.pub"
  d exec "$NOMBRE" sh -c 'chown root:root /etc/ssh/ssh_host_ed25519_key* && chmod 600 /etc/ssh/ssh_host_ed25519_key \
    && rm -f /etc/ssh/ssh_host_rsa_key* /etc/ssh/ssh_host_ecdsa_key* \
    && printf "HostKey /etc/ssh/ssh_host_ed25519_key\n" > /etc/ssh/sshd_config.d/10-hostkey.conf \
    && systemctl restart ssh'
}

esperar_ssh() {
  for _ in $(seq 1 30); do
    if ssh -q -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
         -o ConnectTimeout=2 -i "$CLAVES/id_prueba" -p "$PUERTO_SSH" ubuntu@127.0.0.1 true 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "El SSH del contenedor no responde. Mira: ${DOCKER[*]} logs $NOMBRE" >&2
  return 1
}

datos() {
  cat <<INFO

  Servidor de pruebas listo.

  En Draupnode → Servidores → Añadir servidor:
    IP o dominio   127.0.0.1
    Puerto         $PUERTO_SSH
    Usuario        ubuntu      (sudo sin contraseña, como en Oracle)
    Clave          $CLAVES/id_prueba                (sin contraseña)
             o     $CLAVES/id_prueba_con_frase      (contraseña: draupnode)
             o     $CLAVES/id_prueba_con_frase.ppk  (PuTTY, contraseña: draupnode)
    O usuario y contraseña: ubuntu / draupnode

  Para probar que la app pide la contraseña de sudo: usuario «prueba» / draupnode.

  Huella del servidor: $(ssh-keygen -lf "$CLAVES/ssh_host_ed25519_key.pub" | awk '{print $2}')
  Panel de Coolify (si lo instalas): http://127.0.0.1:$PUERTO_COOLIFY
INFO
}

case "${1:-}" in
  arrancar)
    claves
    echo "· Construyendo la imagen (la primera vez tarda un poco)…"
    d build -q -t "$IMAGEN" - < "$DOCKERFILE" >/dev/null
    if existe; then
      corriendo || d start "$NOMBRE" >/dev/null
    else
      echo "· Creando el contenedor…"
      d run -d --name "$NOMBRE" --hostname servidor-prueba \
        --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
        --tmpfs /run --tmpfs /run/lock \
        -v "$VOLUMEN:/var/lib/docker" \
        -p "127.0.0.1:$PUERTO_SSH:22" -p "127.0.0.1:$PUERTO_COOLIFY:8000" \
        "$IMAGEN" >/dev/null
    fi
    sleep 2
    instalar_claves
    esperar_ssh
    datos
    ;;
  estado)
    if corriendo; then echo "En marcha."; datos; elif existe; then echo "Parado (bash servidor.sh arrancar)."; else echo "No existe (bash servidor.sh arrancar)."; fi
    ;;
  ssh)
    exec ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$CLAVES/id_prueba" -p "$PUERTO_SSH" ubuntu@127.0.0.1
    ;;
  parar)
    existe && d stop "$NOMBRE" >/dev/null && echo "Parado. Lo instalado se conserva."
    ;;
  borrar)
    read -r -p "¿Borrar el servidor de pruebas y todo lo instalado en él? [s/N] " r
    [ "$r" = s ] || [ "$r" = S ] || { echo "Cancelado."; exit 0; }
    existe && d rm -f "$NOMBRE" >/dev/null
    d volume rm "$VOLUMEN" >/dev/null 2>&1 || true
    echo "Borrado. Las claves de $CLAVES se conservan; «arrancar» crea uno nuevo y limpio."
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 2
    ;;
esac
