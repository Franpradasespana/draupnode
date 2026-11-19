<script lang="ts">
  import logo from '../assets/logo.png'
  let { size = 22 }: { size?: number } = $props()
</script>

<img src={logo} width={size} height={size} alt="" draggable="false" />

<style>
  img { border-radius: 22%; display: block; }
</style>
