<script setup lang="ts">
import { ref } from 'vue'
import { NSwitch, NInputNumber, NInput, NSelect, NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/hermes/settings'
import { toggleHindsight, fetchHealth, type HindsightHealth } from '@/api/hermes/hindsight'
import SettingRow from './SettingRow.vue'

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18n()

const hindsightHealth = ref<HindsightHealth | null>(null)
const testingConnection = ref(false)

const embeddingProviderOptions = [
  { label: 'LM Studio (Local)', value: 'lm_studio' },
  { label: 'Z.ai / 智谱', value: 'zai' },
  { label: t('common.custom') || 'Custom', value: 'custom' },
]

async function save(values: Record<string, any>) {
  try {
    await settingsStore.saveSection('memory', values)
    message.success(t('settings.saved'))
  } catch (err: any) {
    message.error(t('settings.saveFailed'))
  }
}

async function handleHindsightToggle(enabled: boolean) {
  try {
    await toggleHindsight(enabled)
    await settingsStore.saveSection('memory', { hindsight_enabled: enabled })
    message.success(t('settings.saved'))
  } catch {
    message.error(t('settings.saveFailed'))
  }
}

async function testConnection() {
  testingConnection.value = true
  try {
    hindsightHealth.value = await fetchHealth()
    if (hindsightHealth.value.available) {
      message.success(t('settings.hindsight.connectionOk'))
    } else {
      message.warning(t('settings.hindsight.connectionFailed'))
    }
  } catch {
    message.error(t('settings.hindsight.connectionFailed'))
  } finally {
    testingConnection.value = false
  }
}
</script>

<template>
  <section class="settings-section">
    <SettingRow :label="t('settings.memory.enabled')" :hint="t('settings.memory.enabledHint')">
      <NSwitch :value="settingsStore.memory.memory_enabled" @update:value="v => save({ memory_enabled: v })" />
    </SettingRow>
    <SettingRow :label="t('settings.memory.userProfile')" :hint="t('settings.memory.userProfileHint')">
      <NSwitch :value="settingsStore.memory.user_profile_enabled" @update:value="v => save({ user_profile_enabled: v })" />
    </SettingRow>
    <SettingRow :label="t('settings.memory.charLimit')" :hint="t('settings.memory.charLimitHint')">
      <NInputNumber
        :value="settingsStore.memory.memory_char_limit"
        :min="100" :max="10000" :step="100"
        size="small" class="input-sm"
        @update:value="v => v != null && save({ memory_char_limit: v })"
      />
    </SettingRow>
    <SettingRow :label="t('settings.memory.userCharLimit')" :hint="t('settings.memory.userCharLimitHint')">
      <NInputNumber
        :value="settingsStore.memory.user_char_limit"
        :min="100" :max="10000" :step="100"
        size="small" class="input-sm"
        @update:value="v => v != null && save({ user_char_limit: v })"
      />
    </SettingRow>
  </section>

  <section class="settings-section hindsight-section">
    <h4 class="section-subtitle">{{ t('settings.hindsight.title') }}</h4>
    <SettingRow :label="t('settings.hindsight.enabled')" :hint="t('settings.hindsight.enabledHint')">
      <NSwitch :value="settingsStore.memory.hindsight_enabled" @update:value="handleHindsightToggle" />
    </SettingRow>
    <SettingRow :label="t('settings.hindsight.embeddingProvider')" :hint="t('settings.hindsight.embeddingProviderHint')">
      <NSelect
        :value="settingsStore.memory.hindsight_embedding_provider"
        :options="embeddingProviderOptions"
        size="small" style="width: 200px"
        @update:value="v => save({ hindsight_embedding_provider: v })"
      />
    </SettingRow>
    <SettingRow :label="t('settings.hindsight.embeddingBaseUrl')" :hint="t('settings.hindsight.embeddingBaseUrlHint')">
      <NInput
        :value="settingsStore.memory.hindsight_embedding_base_url"
        size="small" style="width: 300px"
        placeholder="http://host.docker.internal:1234/v1"
        @update:value="v => save({ hindsight_embedding_base_url: v })"
      />
    </SettingRow>
    <SettingRow :label="t('settings.hindsight.embeddingModel')">
      <NInput
        :value="settingsStore.memory.hindsight_embedding_model"
        size="small" style="width: 300px"
        placeholder="text-embedding-nomic-embed-text-v1.5"
        @update:value="v => save({ hindsight_embedding_model: v })"
      />
    </SettingRow>
    <SettingRow :label="t('settings.hindsight.testConnection')">
      <NButton size="small" :loading="testingConnection" @click="testConnection">
        {{ t('settings.hindsight.test') }}
      </NButton>
      <span v-if="hindsightHealth" :class="hindsightHealth.available ? 'status-ok' : 'status-fail'" style="margin-left: 8px; font-size: 12px">
        {{ hindsightHealth.available ? '✓ Connected' : '✗ ' + (hindsightHealth.error || 'Unavailable') }}
      </span>
    </SettingRow>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.settings-section {
  margin-top: 16px;
}

.section-subtitle {
  font-size: 14px;
  font-weight: 600;
  margin: 24px 0 8px;
  padding-top: 16px;
  border-top: 1px solid $border-color;
}

.status-ok { color: $success; }
.status-fail { color: $error; }
</style>
