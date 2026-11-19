# Servidor Ubuntu 24.04 de PRUEBAS para Draupnode.
# Se parece a una máquina de Oracle Cloud: systemd, SSH, usuario «ubuntu» con
# sudo sin contraseña y python3. Necesita --privileged (lo pone servidor.sh)
# para que funcionen systemd, iptables y Docker dentro del contenedor.
FROM ubuntu:24.04

ENV container=docker \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      systemd systemd-sysv dbus openssh-server sudo python3 ca-certificates \
      curl iproute2 iputils-ping psmisc less nano tzdata \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Unidades que no tienen sentido dentro de un contenedor.
RUN systemctl mask systemd-udevd.service systemd-udevd-kernel.socket systemd-udevd-control.socket \
      getty@tty1.service systemd-logind.service sys-kernel-config.mount sys-kernel-debug.mount \
      systemd-remount-fs.service 2>/dev/null || true

# Usuario «ubuntu» como en Oracle Cloud: sudo SIN contraseña.
# Contraseña «draupnode» por si se quiere probar a entrar con usuario y contraseña.
RUN (id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu) \
 && echo 'ubuntu:draupnode' | chpasswd \
 && echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-ubuntu \
 && chmod 440 /etc/sudoers.d/90-ubuntu

# Usuario «prueba»: sudo CON contraseña (para probar que la app la pide).
RUN useradd -m -s /bin/bash -G sudo prueba \
 && echo 'prueba:draupnode' | chpasswd

# SSH: claves y también contraseña.
RUN mkdir -p /run/sshd \
 && printf 'PasswordAuthentication yes\nKbdInteractiveAuthentication yes\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/90-pruebas.conf \
 && systemctl enable ssh

# Docker dentro de Docker guarda sus datos en un volumen (overlay sobre overlay no funciona).
VOLUME ["/var/lib/docker"]

STOPSIGNAL SIGRTMIN+3
CMD ["/lib/systemd/systemd"]
