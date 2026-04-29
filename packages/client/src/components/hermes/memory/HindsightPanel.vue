<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchStats, type HindsightStats } from '@/api/hermes/hindsight'
import MemoryStats from './MemoryStats.vue'
import MemorySearch from './MemorySearch.vue'
import MemoryRetain from './MemoryRetain.vue'

const { t } = useI18n()
const stats = ref<HindsightStats | null>(null)
const loading = ref(false)

async function loadStats() {
  loading.value = true
  try { stats.value = await fetchStats() } catch { /* handled by stats component */ }
  finally { loading.value = false }
}

onMounted(loadStats)
</script>

<template>
  <div class="hindsight-panel">
    <MemoryStats :stats="stats" :loading="loading" />
    <div class="panel-body">
      <div class="panel-section">
        <h4 class="panel-subtitle">{{ t('hindsight.search') }}</h4>
        <MemorySearch />
      </div>
      <div class="panel-section">
        <h4 class="panel-subtitle">{{ t('hindsight.addMemory') }}</h4>
        <MemoryRetain />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.hindsight-panel { display: flex; flex-direction: column; height: 100%; }
.panel-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 24px; }
.panel-subtitle { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: $text-secondary; }
</style>
