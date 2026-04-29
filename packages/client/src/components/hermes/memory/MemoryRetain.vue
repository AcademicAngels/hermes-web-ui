<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { retain } from '@/api/hermes/hindsight'

const { t } = useI18n()
const message = useMessage()
const content = ref('')
const context = ref('')
const saving = ref(false)

async function handleRetain() {
  if (!content.value.trim()) return
  saving.value = true
  try {
    await retain(content.value, context.value || undefined)
    message.success(t('hindsight.retained'))
    content.value = ''
    context.value = ''
  } catch (err: any) {
    message.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="memory-retain">
    <NInput v-model:value="content" type="textarea" :placeholder="t('hindsight.retainPlaceholder')" :rows="3" />
    <div class="retain-row">
      <NInput v-model:value="context" size="small" :placeholder="t('hindsight.contextPlaceholder')" style="flex: 1" />
      <NButton size="small" type="primary" :loading="saving" @click="handleRetain">{{ t('hindsight.retain') }}</NButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.memory-retain { display: flex; flex-direction: column; gap: 8px; }
.retain-row { display: flex; gap: 8px; align-items: center; }
</style>
