<script lang="ts">
  import AlertsList from '../components/AlertsList.svelte'
</script>

<div class="head">
  <h1>Avisos</h1>
  <p class="muted">Lo que conviene mirar: copias que hace tiempo que no traes, aplicaciones que fallaron, la copia de Draupnode y versiones nuevas.</p>
</div>
<AlertsList />

<style>
  .head { margin-bottom: 18px; }
  .head h1 { margin: 0 0 4px; }
</style>
