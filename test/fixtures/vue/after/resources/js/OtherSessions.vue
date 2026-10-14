<template>
  <button @click="logOutOtherSessions">Log out other sessions</button>
</template>

<script setup lang="ts">
import { authService } from './authService'

const confirmFirst = () => window.confirm('Log out everywhere else?')

const logOutOtherSessions = async () => {
  if (!confirmFirst()) return
  await authService.logOutOtherSessions()
}
</script>
