<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NEmpty, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { recall, reflect, type RecallResult } from '@/api/hermes/hindsight'

const { t } = useI18n()
const message = useMessage()
const query = ref('')
const results = ref<RecallResult[]>([])
const reflectText = ref('')
const loading = ref(false)

async function handleRecall() {
  if (!query.value.trim()) return
  loading.value = true
  reflectText.value = ''
  try {
    const res = await recall(query.value)
    results.value = res.results
  } catch (err: any) {
    message.error(err.message)
  } finally {
    loading.value = false
  }
}

async function handleReflect() {
  if (!query.value.trim()) return
  loading.value = true
  results.value = []
  try {
    const res = await reflect(query.value)
    reflectText.value = res.text
  } catch (err: any) {
    message.error(err.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="memory-search">
    <div class="search-bar">
      <NInput v-model:value="query" :placeholder="t('hindsight.searchPlaceholder')" size="small" clearable @keyup.enter="handleRecall" />
      <NButton size="small" :loading="loading" @click="handleRecall">{{ t('hindsight.recall') }}</NButton>
      <NButton size="small" :loading="loading" @click="handleReflect">{{ t('hindsight.reflect') }}</NButton>
    </div>
    <div class="search-results">
      <div v-if="reflectText" class="reflect-result">
        <p class="reflect-text">{{ reflectText }}</p>
      </div>
      <div v-else-if="results.length" class="recall-results">
        <div v-for="r in results" :key="r.id" class="result-item">
          <span class="result-type">{{ r.type }}</span>
          <p class="result-text">{{ r.text }}</p>
          <span v-if="r.context" class="result-context">{{ r.context }}</span>
        </div>
      </div>
      <NEmpty v-else-if="!loading" :description="t('hindsight.noResults')" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.memory-search { display: flex; flex-direction: column; gap: 12px; }
.search-bar { display: flex; gap: 8px; align-items: center; }
.search-results { flex: 1; overflow-y: auto; }
.result-item { padding: 10px 0; border-bottom: 1px solid $border-color; }
.result-type { font-size: 11px; color: $text-muted; text-transform: uppercase; }
.result-text { font-size: 13px; margin: 4px 0; }
.result-context { font-size: 11px; color: $text-secondary; }
.reflect-result { padding: 12px; background: $bg-secondary; border-radius: $radius-md; }
.reflect-text { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
</style>
