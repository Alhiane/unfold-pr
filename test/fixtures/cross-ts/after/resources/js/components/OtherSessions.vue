<template>
  <button @click="logOutOtherSessions">Log out other sessions</button>
</template>

<script setup lang="ts">
import { authService } from '@/services/authService'
import { pick } from '@/helpers'
import axios from 'axios'

const logOutOtherSessions = async () => {
  await authService.logOutOtherSessions()
  pick()
  axios.get('/ping')
}
</script>
