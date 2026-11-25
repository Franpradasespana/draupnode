<script lang="ts">
  import AlertsList from '../components/AlertsList.svelte'
  import { t } from '../lib/i18n.svelte'
</script>

<div class="head">
  <h1>{t('Avisos')}</h1>
  <p class="muted">{t('Lo que conviene mirar: servidores que no responden, disco casi lleno, contenedores o servicios que fallan, copias atrasadas o que fallaron, módulos sin aplicar, aplicaciones que fallaron, la copia de Draupnode y versiones nuevas.')}</p>
</div>
<AlertsList />

<style>
  .head { margin-bottom: 18px; }
  .head h1 { margin: 0 0 4px; }
</style>
