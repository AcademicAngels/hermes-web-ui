<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HindsightStats } from '@/api/hermes/hindsight'

defineProps<{ stats: HindsightStats | null; loading: boolean }>()
const { t } = useI18n()
</script>

<template>
  <div class="memory-stats">
    <div class="stat-item">
      <span class="stat-label">{{ t('hindsight.status') }}</span>
      <span :class="['stat-value', stats?.available ? 'online' : 'offline']">
        {{ stats?.available ? t('hindsight.online') : t('hindsight.offline') }}
      </span>
    </div>
    <div class="stat-item">
      <span class="stat-label">{{ t('hindsight.banks') }}</span>
      <span class="stat-value">{{ stats?.total_banks ?? '-' }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.memory-stats { display: flex; gap: 24px; padding: 12px 16px; border-bottom: 1px solid $border-color; }
.stat-item { display: flex; align-items: center; gap: 8px; }
.stat-label { font-size: 12px; color: $text-muted; }
.stat-value { font-size: 13px; font-weight: 600; }
.online { color: $success; }
.offline { color: $error; }
</style>
